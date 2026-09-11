const crypto = require('node:crypto');

class MetaTemplateSyncError extends Error {
  constructor(code, message = 'Meta template synchronization is unavailable') {
    super(message);
    this.name = 'MetaTemplateSyncError';
    this.code = code;
  }
}

const managerPredicate = `u.active=true AND (u.role='admin' OR EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.workspace_id=p.workspace_id
  AND m.user_id=u.id AND m.role IN ('owner','admin')))`;

function safeTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: row.category,
    status: row.status,
    parameterFormat: row.parameter_format,
    components: row.components,
    wabaId: row.waba_id,
    lastSyncedAt: new Date(row.last_synced_at).toISOString()
  };
}

function sameTarget(actual, expected) {
  if (!expected) return true;
  return actual.workspaceId === expected.workspaceId
    && actual.connectionId === expected.connectionId
    && actual.numberId === expected.numberId
    && actual.wabaId === expected.wabaId;
}

class MetaTemplateSyncRepository {
  constructor(pool, vault) {
    if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool is required');
    if (!vault || typeof vault.decrypt !== 'function') throw new TypeError('credential vault is required');
    this.pool = pool;
    this.vault = vault;
  }

  async target({ actorId, workspaceId, connectionId, numberId }, executor = this.pool) {
    const result = await executor.query(`SELECT p.id,p.workspace_id,p.encrypted_credentials,p.encryption_key_id,a.waba_id,a.phone_number_id,n.id AS whatsapp_number_id
      FROM users u JOIN provider_connections p ON p.workspace_id=$2
      JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
      JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=p.workspace_id
        AND n.id=$4 AND n.external_session_id=a.phone_number_id
      WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND p.status='active'
      AND a.disconnected_at IS NULL AND ${managerPredicate}`, [actorId, workspaceId, connectionId, numberId]);
    if (!result.rowCount) throw new MetaTemplateSyncError('META_CONNECTION_NOT_FOUND');
    if (result.rowCount !== 1) throw new MetaTemplateSyncError('META_TEMPLATE_BINDING_INVALID');
    const row = result.rows[0];
    if (!row.encrypted_credentials) throw new MetaTemplateSyncError('META_CREDENTIALS_UNAVAILABLE');
    const secret = this.vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
    const accessToken = String(secret.accessToken || '').trim();
    if (!accessToken) throw new MetaTemplateSyncError('META_CREDENTIALS_UNAVAILABLE');
    return { workspaceId: row.workspace_id, connectionId: row.id, numberId: row.whatsapp_number_id, wabaId: row.waba_id, accessToken };
  }

  async lockExpectedTarget(client, expected) {
    if (!expected) return;
    const connection = await client.query(`SELECT id FROM provider_connections
      WHERE id=$1 AND workspace_id=$2 AND provider='whatsapp_cloud' FOR UPDATE`, [expected.connectionId, expected.workspaceId]);
    const asset = await client.query(`SELECT provider_connection_id,phone_number_id FROM meta_connection_assets
      WHERE provider_connection_id=$1 AND workspace_id=$2 AND waba_id=$3 AND disconnected_at IS NULL FOR UPDATE`, [expected.connectionId, expected.workspaceId, expected.wabaId]);
    const number = await client.query(`SELECT id,external_session_id FROM whatsapp_numbers
      WHERE id=$1 AND workspace_id=$2 AND provider_connection_id=$3 FOR UPDATE`, [expected.numberId, expected.workspaceId, expected.connectionId]);
    if (connection.rowCount !== 1 || asset.rowCount !== 1 || number.rowCount !== 1 || asset.rows[0].phone_number_id !== number.rows[0].external_session_id) {
      throw new MetaTemplateSyncError('META_TEMPLATE_BINDING_CHANGED');
    }
  }

  async list(scope) {
    const target = await this.target(scope);
    const result = await this.pool.query(`SELECT id,name,language,category,status,parameter_format,components,waba_id,last_synced_at
      FROM whatsapp_message_templates
      WHERE workspace_id=$1 AND provider_connection_id=$2 AND whatsapp_number_id=$3 AND provider='whatsapp_cloud'
      ORDER BY name,language`, [target.workspaceId, target.connectionId, target.numberId]);
    return result.rows.map(safeTemplate);
  }

  async replace(scope, templates, expectedTarget = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockExpectedTarget(client, expectedTarget);
      const target = await this.target(scope, client);
      if (!sameTarget(target, expectedTarget)) throw new MetaTemplateSyncError('META_TEMPLATE_BINDING_CHANGED');
      const names = [];
      const languages = [];
      for (const template of templates) {
        names.push(template.name);
        languages.push(template.language);
        await client.query(`INSERT INTO whatsapp_message_templates(
          id,workspace_id,provider_connection_id,whatsapp_number_id,provider,official_template_id,waba_id,name,language,category,status,parameter_format,components,last_synced_at
        ) VALUES($1,$2,$3,$4,'whatsapp_cloud',$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp())
        ON CONFLICT(provider_connection_id,whatsapp_number_id,name,language) DO UPDATE SET
          official_template_id=EXCLUDED.official_template_id,waba_id=EXCLUDED.waba_id,category=EXCLUDED.category,status=EXCLUDED.status,
          parameter_format=EXCLUDED.parameter_format,components=EXCLUDED.components,last_synced_at=clock_timestamp(),updated_at=clock_timestamp()`,
        [crypto.randomUUID(), target.workspaceId, target.connectionId, target.numberId, template.officialTemplateId, target.wabaId, template.name, template.language, template.category, template.status, template.parameterFormat, JSON.stringify(template.components)]);
      }
      await client.query(`UPDATE whatsapp_message_templates t SET status='ARCHIVED',last_synced_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE t.workspace_id=$1 AND t.provider_connection_id=$2 AND t.whatsapp_number_id=$3 AND t.provider='whatsapp_cloud'
        AND NOT EXISTS (
          SELECT 1 FROM unnest($4::text[],$5::text[]) AS remote(name,language)
          WHERE remote.name=t.name AND remote.language=t.language
        )`, [target.workspaceId, target.connectionId, target.numberId, names, languages]);
      await client.query("INSERT INTO audit_logs(id,user_id,action,details) VALUES($1,$2,'meta.templates.synced',$3)", [crypto.randomUUID(), scope.actorId, { workspaceId: target.workspaceId, connectionId: target.connectionId, numberId: target.numberId, wabaId: target.wabaId, templateCount: templates.length }]);
      const saved = await client.query(`SELECT id,name,language,category,status,parameter_format,components,waba_id,last_synced_at
        FROM whatsapp_message_templates WHERE workspace_id=$1 AND provider_connection_id=$2 AND whatsapp_number_id=$3 AND provider='whatsapp_cloud'
        ORDER BY name,language`, [target.workspaceId, target.connectionId, target.numberId]);
      await client.query('COMMIT');
      return saved.rows.map(safeTemplate);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

module.exports = { MetaTemplateSyncRepository, MetaTemplateSyncError, safeTemplate, sameTarget };

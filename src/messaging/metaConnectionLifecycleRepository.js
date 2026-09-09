const crypto = require('node:crypto');

class MetaLifecycleError extends Error {
  constructor(message, code) { super(message); this.name = 'MetaLifecycleError'; this.code = code; }
}
const managerPredicate = `u.active=true AND (u.role='admin' OR EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.workspace_id=p.workspace_id
  AND m.user_id=u.id AND m.role IN ('owner','admin')))`;
function safeRow(row) {
  if (!row) return null;
  return {
    id: row.id, workspaceId: row.workspace_id, label: row.label, status: row.status,
    phone: row.display_phone_number || row.phone || null,
    verifiedName: row.verified_name || null,
    tokenStatus: row.token_status, tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at).toISOString() : null,
    webhookSubscribed: Boolean(row.webhook_subscribed), accountStatus: row.account_status,
    qualityRating: row.quality_rating || null,
    lastDiagnosticsAt: row.last_diagnostics_at ? new Date(row.last_diagnostics_at).toISOString() : null,
    diagnosticsCode: row.last_diagnostics_code || null,
    disconnectedAt: row.disconnected_at ? new Date(row.disconnected_at).toISOString() : null,
    automationEnabled: Boolean(row.automation_enabled),
  };
}
class MetaConnectionLifecycleRepository {
  constructor(pool, vault) { if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new TypeError('PostgreSQL pool is required'); if (!vault) throw new TypeError('credential vault is required'); this.pool = pool; this.vault = vault; }
  async diagnosticsTarget({ actorId, workspaceId, connectionId }) {
    const result = await this.pool.query(`SELECT p.id,p.workspace_id,p.label,p.status,p.encrypted_credentials,p.encryption_key_id,
      a.waba_id,a.phone_number_id,a.display_phone_number,a.token_expires_at,a.disconnected_at
      FROM users u JOIN provider_connections p ON p.workspace_id=$2
      JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
      WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND ${managerPredicate}`, [actorId, workspaceId, connectionId]);
    const row = result.rows[0];
    if (!row || row.disconnected_at || !row.encrypted_credentials) return null;
    const secret = this.vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
    const accessToken = String(secret.accessToken || '').trim();
    if (!accessToken) throw new MetaLifecycleError('Meta credentials are unavailable', 'META_CREDENTIALS_UNAVAILABLE');
    return { connectionId: row.id, workspaceId: row.workspace_id, wabaId: row.waba_id, phoneNumberId: row.phone_number_id, accessToken };
  }
  async recordDiagnostics({ actorId, workspaceId, connectionId, result }) {
    const saved = await this.pool.query(`WITH allowed AS (
      SELECT p.id FROM users u JOIN provider_connections p ON p.workspace_id=$2
      WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND ${managerPredicate}
    ), asset AS (
      UPDATE meta_connection_assets a SET token_status=$4,webhook_subscribed=$5,account_status=$6,
        quality_rating=$7,last_diagnostics_at=clock_timestamp(),last_diagnostics_code=$8,
        display_phone_number=COALESCE($9,a.display_phone_number),verified_name=COALESCE($10,a.verified_name),updated_at=clock_timestamp()
      FROM allowed WHERE a.provider_connection_id=allowed.id AND a.workspace_id=$2 RETURNING a.*
    )
    UPDATE provider_connections p SET status=CASE WHEN $11::boolean=false AND p.status='active' THEN 'degraded' ELSE p.status END,
      updated_at=clock_timestamp() FROM asset WHERE p.id=asset.provider_connection_id
    RETURNING p.id,p.workspace_id,p.label,p.status,asset.display_phone_number,asset.verified_name,asset.token_status,
      asset.token_expires_at,asset.webhook_subscribed,asset.account_status,asset.quality_rating,asset.last_diagnostics_at,
      asset.last_diagnostics_code,asset.disconnected_at,false AS automation_enabled`,
    [actorId, workspaceId, connectionId, result.tokenStatus, result.webhookSubscribed, result.accountStatus, result.qualityRating, result.code, result.displayPhoneNumber, result.verifiedName, result.healthy]);
    return safeRow(saved.rows[0]);
  }
  async status({ actorId, workspaceId, connectionId }) {
    const result = await this.pool.query(`SELECT p.id,p.workspace_id,p.label,p.status,a.display_phone_number,a.verified_name,
      a.token_status,a.token_expires_at,a.webhook_subscribed,a.account_status,a.quality_rating,a.last_diagnostics_at,
      a.last_diagnostics_code,a.disconnected_at,n.phone,n.automation_enabled
      FROM users u JOIN provider_connections p ON p.workspace_id=$2
      JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
      LEFT JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=p.workspace_id
      WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND ${managerPredicate}`, [actorId, workspaceId, connectionId]);
    return safeRow(result.rows[0]);
  }
  async activate({ actorId, workspaceId, connectionId }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ready = await client.query(`SELECT p.id FROM users u JOIN provider_connections p ON p.workspace_id=$2
        JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
        WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND p.status IN ('connecting','degraded')
        AND a.token_status='valid' AND a.webhook_subscribed=true AND a.account_status='connected'
        AND a.disconnected_at IS NULL AND a.last_diagnostics_at>clock_timestamp()-interval '15 minutes'
        AND p.encrypted_credentials IS NOT NULL AND ${managerPredicate} FOR UPDATE OF p,a`, [actorId, workspaceId, connectionId]);
      if (!ready.rowCount) throw new MetaLifecycleError('Meta connection is not ready for activation', 'META_ACTIVATION_NOT_READY');
      await client.query("UPDATE provider_connections SET status='active',updated_at=clock_timestamp() WHERE id=$1 AND workspace_id=$2", [connectionId, workspaceId]);
      await client.query("UPDATE whatsapp_numbers SET automation_enabled=false WHERE provider_connection_id=$1 AND workspace_id=$2", [connectionId, workspaceId]);
      await client.query("INSERT INTO audit_logs(id,user_id,action,details) VALUES($1,$2,'meta.connection.activated',$3)", [crypto.randomUUID(), actorId, { workspaceId, connectionId }]);
      await client.query('COMMIT'); return { id: connectionId, workspaceId, status: 'active', automationEnabled: false };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
module.exports = { MetaConnectionLifecycleRepository, MetaLifecycleError, safeRow };

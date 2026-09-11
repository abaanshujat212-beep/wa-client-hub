class MetaMediaRepository {
  constructor(pool, vault) {
    if (typeof pool?.query !== 'function') throw new TypeError('PostgreSQL pool is required');
    if (!vault || typeof vault.decrypt !== 'function') throw new TypeError('credential vault is required');
    this.pool = pool; this.vault = vault;
  }
  async target({ actorId, workspaceId, connectionId, numberId }) {
    const result = await this.pool.query(`SELECT p.id,p.workspace_id,p.encrypted_credentials,p.encryption_key_id,a.phone_number_id,n.id AS whatsapp_number_id
      FROM users u JOIN provider_connections p ON p.workspace_id=$2
      JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
      JOIN whatsapp_numbers n ON n.provider_connection_id=p.id AND n.workspace_id=p.workspace_id
        AND n.id=$4 AND n.external_session_id=a.phone_number_id
      WHERE u.id=$1 AND p.id=$3 AND p.provider='whatsapp_cloud' AND p.status='active'
        AND a.disconnected_at IS NULL AND ${this.managerPredicate()}`, [actorId, workspaceId, connectionId, numberId]);
    const row = result.rows[0];
    if (!row || result.rowCount !== 1) { const error = new Error('Meta media target was not found'); error.code = 'META_MEDIA_TARGET_NOT_FOUND'; throw error; }
    if (!row.encrypted_credentials) { const error = new Error('Meta credentials are unavailable'); error.code = 'META_CREDENTIALS_UNAVAILABLE'; throw error; }
    let secret;
    try { secret = this.vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id); } catch { const error = new Error('Meta credentials are unavailable'); error.code = 'META_CREDENTIALS_UNAVAILABLE'; throw error; }
    const accessToken = String(secret.accessToken || '').trim();
    if (!accessToken) { const error = new Error('Meta credentials are unavailable'); error.code = 'META_CREDENTIALS_UNAVAILABLE'; throw error; }
    return { workspaceId: row.workspace_id, connectionId: row.id, numberId: row.whatsapp_number_id, phoneNumberId: row.phone_number_id, accessToken };
  }
  managerPredicate() { return `u.active=true AND (u.role='admin' OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=p.workspace_id AND m.user_id=u.id AND m.role IN ('owner','admin')))`; }
}
module.exports = { MetaMediaRepository };

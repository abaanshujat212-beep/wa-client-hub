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
  async listMediaCleanupCandidates({ limit = 100, now = new Date() } = {}) {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 100);
    const result = await this.pool.query(`SELECT ma.id,ma.workspace_id,ma.provider_connection_id,ma.provider_media_id,ma.provider_media_delete_after,ma.provider_media_delete_attempts,
        p.encrypted_credentials,p.encryption_key_id
      FROM message_attachments ma
      JOIN messages m ON m.id=ma.message_id AND m.workspace_id=ma.workspace_id
      JOIN conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id
      JOIN whatsapp_numbers n ON n.id=c.whatsapp_number_id AND n.workspace_id=ma.workspace_id
      JOIN provider_connections p ON p.id=ma.provider_connection_id AND p.workspace_id=ma.workspace_id
        AND p.id=n.provider_connection_id
      JOIN meta_connection_assets ca ON ca.provider_connection_id=p.id AND ca.workspace_id=p.workspace_id
        AND ca.phone_number_id=n.external_session_id AND ca.disconnected_at IS NULL
      WHERE ma.provider_media_id IS NOT NULL AND ma.provider_media_deleted_at IS NULL
        AND ma.provider_media_delete_after <= $1 AND ma.provider_media_delete_attempts < 5
        AND p.provider='whatsapp_cloud' AND p.status='active'
      ORDER BY ma.provider_media_delete_after ASC,ma.created_at ASC,ma.id ASC
      LIMIT $2 FOR UPDATE OF ma SKIP LOCKED`, [now, take]);
    return result.rows.map((row) => {
      let accessToken = null;
      try { accessToken = String(this.vault.decrypt(row.encrypted_credentials, row.provider_connection_id, row.encryption_key_id)?.accessToken || '').trim() || null; } catch {}
      return { attachmentId: row.id, workspaceId: row.workspace_id, providerConnectionId: row.provider_connection_id, providerMediaId: row.provider_media_id, accessToken, attempts: Number(row.provider_media_delete_attempts || 0) };
    });
  }
  async markMediaCleanupDeleted({ attachmentId }) {
    const result = await this.pool.query(`UPDATE message_attachments SET provider_media_deleted_at=now(),provider_media_last_error=NULL WHERE id=$1 AND provider_media_deleted_at IS NULL RETURNING id`, [attachmentId]);
    return result.rowCount === 1;
  }
  async markMediaCleanupFailure({ attachmentId, code = 'META_MEDIA_CLEANUP_FAILED' }) {
    const safeCode = String(code).replace(/[^A-Z0-9_\-]/gi, '').slice(0, 120) || 'META_MEDIA_CLEANUP_FAILED';
    const result = await this.pool.query(`UPDATE message_attachments SET provider_media_delete_attempts=provider_media_delete_attempts+1,provider_media_last_error=$2 WHERE id=$1 AND provider_media_deleted_at IS NULL RETURNING id`, [attachmentId, safeCode]);
    return result.rowCount === 1;
  }
  managerPredicate() { return `u.active=true AND (u.role='admin' OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id=p.workspace_id AND m.user_id=u.id AND m.role IN ('owner','admin')))`; }
}
module.exports = { MetaMediaRepository };

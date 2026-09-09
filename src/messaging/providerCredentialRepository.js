class ProviderCredentialError extends Error { constructor(message, code) { super(message); this.name = 'ProviderCredentialError'; this.code = code; } }
class ProviderCredentialRepository {
  constructor(pool, vault) { if (!pool) throw new TypeError('pool is required'); if (!vault) throw new TypeError('vault is required'); this.pool = pool; this.vault = vault; }
  async resolveMeta({ workspaceId, providerConnectionId }) {
    const result = await this.pool.query(`SELECT p.id,p.workspace_id,p.status,p.encrypted_credentials,p.encryption_key_id,a.phone_number_id,a.waba_id FROM provider_connections p LEFT JOIN meta_connection_assets a ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id WHERE p.id=$1 AND p.workspace_id=$2 AND p.provider='whatsapp_cloud' AND p.status='active'`, [providerConnectionId, workspaceId]);
    const row = result.rows[0]; if (!row) return null;
    if (!row.encrypted_credentials) throw new ProviderCredentialError('Meta credentials are unavailable', 'META_CREDENTIALS_UNAVAILABLE');
    const decrypted = this.vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
    const accessToken = String(decrypted.accessToken || '').trim(); const phoneNumberId = String(row.phone_number_id || decrypted.phoneNumberId || '').trim(); const businessAccountId = String(row.waba_id || decrypted.businessAccountId || '').trim();
    if (!accessToken || !/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(businessAccountId)) throw new ProviderCredentialError('Meta credentials are incomplete', 'META_CREDENTIALS_INVALID');
    return { accessToken, phoneNumberId, businessAccountId };
  }
}
module.exports = { ProviderCredentialRepository, ProviderCredentialError };

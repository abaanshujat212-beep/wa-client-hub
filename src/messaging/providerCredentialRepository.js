class ProviderCredentialError extends Error {
  constructor(message, code) { super(message); this.name = "ProviderCredentialError"; this.code = code; }
}
class ProviderCredentialRepository {
  constructor(pool, vault) { if (!pool) throw new TypeError("pool is required"); if (!vault) throw new TypeError("vault is required"); this.pool = pool; this.vault = vault; }
  async resolveMeta({ workspaceId, providerConnectionId }) {
    const result = await this.pool.query(`SELECT id,workspace_id,provider,status,encrypted_credentials FROM provider_connections WHERE id=$1 AND workspace_id=$2 AND provider='whatsapp_cloud' AND status='active'`, [providerConnectionId, workspaceId]);
    const row = result.rows[0]; if (!row) return null;
    if (!row.encrypted_credentials) throw new ProviderCredentialError("Meta credentials are unavailable", "META_CREDENTIALS_UNAVAILABLE");
    const decrypted = this.vault.decrypt(row.encrypted_credentials, row.id);
    const accessToken = String(decrypted.accessToken || "").trim(); const phoneNumberId = String(decrypted.phoneNumberId || "").trim();
    if (!accessToken || !/^\d+$/.test(phoneNumberId)) throw new ProviderCredentialError("Meta credentials are incomplete", "META_CREDENTIALS_INVALID");
    return { accessToken, phoneNumberId, businessAccountId: String(decrypted.businessAccountId || "").trim() || null };
  }
}
module.exports = { ProviderCredentialRepository, ProviderCredentialError };

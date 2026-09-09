const crypto = require('node:crypto');
const { assertNumberCreation } = require('../db/numberCreationPolicy');
class MetaConnectionError extends Error { constructor(message, code) { super(message); this.name = 'MetaConnectionError'; this.code = code; } }
function normalizeInstall(input = {}) {
  const label = String(input.label || '').trim(); const phone = `+${String(input.phone || '').replace(/\D/g, '')}`;
  const phoneNumberId = String(input.phoneNumberId || '').trim(); const businessAccountId = String(input.businessAccountId || '').trim();
  const businessPortfolioId = input.businessPortfolioId == null ? null : String(input.businessPortfolioId).trim(); const accessToken = String(input.accessToken || '').trim();
  if (label.length < 2 || !/^\+\d{8,15}$/.test(phone) || !/^\d+$/.test(phoneNumberId) || !/^\d+$/.test(businessAccountId) || (businessPortfolioId && !/^\d+$/.test(businessPortfolioId)) || accessToken.length < 20) throw new MetaConnectionError('Valid Meta connection details are required', 'META_INSTALL_INVALID');
  return { label, phone, phoneNumberId, businessAccountId, businessPortfolioId, accessToken, verifiedName: String(input.verifiedName || '').trim() || null, expiresIn: Number.isFinite(Number(input.expiresIn)) && Number(input.expiresIn) > 0 ? Number(input.expiresIn) : null };
}
class MetaConnectionRepository {
  constructor(pool, vault) { if (!pool) throw new TypeError('pool is required'); if (!vault) throw new TypeError('vault is required'); this.pool = pool; this.vault = vault; }
  async install(input) {
    const value = normalizeInstall(input); const connectionId = crypto.randomUUID(); const numberId = crypto.randomUUID(); const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock($1)', [90421032]);
      const workspace = await assertNumberCreation(client, input.workspaceId, { actorId: input.actorId, requireManager: true, phone: value.phone });
      const encrypted = this.vault.encrypt({ accessToken: value.accessToken }, connectionId);
      await client.query(`INSERT INTO provider_connections(id,workspace_id,provider,label,encrypted_credentials,encryption_key_id,status,settings) VALUES($1,$2,'whatsapp_cloud',$3,$4,$5,'connecting','{}')`, [connectionId, input.workspaceId, value.label, encrypted.ciphertext, encrypted.keyId]);
      await client.query(`INSERT INTO meta_connection_assets(provider_connection_id,workspace_id,business_portfolio_id,waba_id,phone_number_id,display_phone_number,verified_name,token_type,token_expires_at,token_status) VALUES($1,$2,$3,$4,$5,$6,$7,'business',CASE WHEN $8::double precision IS NULL THEN NULL ELSE clock_timestamp()+($8::double precision*interval '1 second') END,'unverified')`, [connectionId, input.workspaceId, value.businessPortfolioId, value.businessAccountId, value.phoneNumberId, value.phone, value.verifiedName, value.expiresIn]);
      await client.query(`INSERT INTO whatsapp_numbers(id,owner_id,workspace_id,label,phone,provider_connection_id,external_session_id,automation_enabled) VALUES($1,$2,$3,$4,$5,$6,$7,false)`, [numberId, workspace.owner_id, input.workspaceId, value.label, value.phone, connectionId, value.phoneNumberId]);
      if (input.actorId) await client.query("INSERT INTO audit_logs(id,user_id,action,details) VALUES($1,$2,'meta.connection.installed',$3)", [crypto.randomUUID(), input.actorId, { workspaceId: input.workspaceId, connectionId, numberId }]);
      await client.query('COMMIT');
      return { connection: { id: connectionId, workspaceId: input.workspaceId, provider: 'whatsapp_cloud', label: value.label, status: 'connecting', hasCredentials: true }, number: { id: numberId, workspaceId: input.workspaceId, label: value.label, phone: value.phone, providerConnectionId: connectionId, automationEnabled: false } };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw new MetaConnectionError('Meta phone number is already connected', 'META_PHONE_ALREADY_CONNECTED');
      throw error;
    } finally { client.release(); }
  }
}
module.exports = { MetaConnectionRepository, MetaConnectionError, normalizeInstall };

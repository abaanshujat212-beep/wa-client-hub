const base = require('./ghlPrivatePilot');
const crypto = require('node:crypto');
function stableInstallationId(installationId, locationId) { return `ghl-installation-${crypto.createHash('sha256').update(`${installationId}:${locationId}`).digest('hex').slice(0, 40)}`; }
base.GhlPilotRepository.prototype.upsertInstallation = async function upsertInstallation({ workspaceId, installationId, companyId, locationId, credentials, scopes: grantedScopes, expiresAt }) {
  const id = stableInstallationId(installationId, locationId);
  const secret = this.vault.encrypt(credentials, id);
  const result = await this.pool.query(`INSERT INTO ghl_installations(id,installation_id,company_id,location_id,workspace_id,encrypted_credentials,encryption_key_id,scopes,access_token_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(installation_id,location_id) DO UPDATE SET company_id=EXCLUDED.company_id,workspace_id=EXCLUDED.workspace_id,encrypted_credentials=EXCLUDED.encrypted_credentials,encryption_key_id=EXCLUDED.encryption_key_id,scopes=EXCLUDED.scopes,access_token_expires_at=EXCLUDED.access_token_expires_at,status='active',updated_at=now() RETURNING *`, [id, installationId, companyId || null, locationId, workspaceId, secret.ciphertext, secret.keyId, grantedScopes, expiresAt]);
  return this.public(result.rows[0]);
};
module.exports = { ...base, stableInstallationId };

const { normalizeTokenResponse } = require('./ghlContract');
const fail = (code, message, status = 502) => Object.assign(new Error(message), { code, status });

class GhlAgencyInstallService {
  constructor({ pool, vault, client, provisioning, marketplaceInstall, env, fetchImpl = fetch }) {
    Object.assign(this, { pool, vault, client, provisioning, marketplaceInstall, env, fetchImpl });
  }
  async request(path, token, body) {
    const response = await this.fetchImpl(`${this.client.config.apiUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token.accessToken}`, Version: '2023-02-21', Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw fail('GHL_AGENCY_API_FAILED', `HighLevel agency request failed (HTTP ${response.status}). Check oauth.readonly and oauth.write permissions.`);
    return response.json();
  }
  async save(token, db = this.pool) {
    const secret = this.vault.encrypt(token, `ghl-agency:${token.companyId}`);
    await db.query(`INSERT INTO ghl_agency_installations(company_id,encrypted_credentials,encryption_key_id) VALUES($1,$2,$3)
      ON CONFLICT(company_id) DO UPDATE SET encrypted_credentials=EXCLUDED.encrypted_credentials,encryption_key_id=EXCLUDED.encryption_key_id,updated_at=now()`,
    [token.companyId, secret.ciphertext, secret.keyId]);
  }
  async load(companyId) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const { rows } = await db.query('SELECT * FROM ghl_agency_installations WHERE company_id=$1 FOR UPDATE', [companyId]);
      if (!rows[0]) { await db.query('COMMIT'); return null; }
      const row = rows[0];
      let token = this.vault.decrypt(row.encrypted_credentials, `ghl-agency:${companyId}`, row.encryption_key_id);
      if (token.expiresAt <= Date.now() + 60000) {
        const rotated = await this.client.tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refreshToken, user_type: 'Company' });
        if (rotated.companyId && rotated.companyId !== companyId) throw fail('GHL_AGENCY_ID_MISMATCH', 'Refreshed agency identity does not match');
        token = { ...token, ...rotated, companyId, userId: rotated.userId || token.userId, expiresAt: Date.now() + rotated.expiresIn * 1000 };
        await this.save(token, db);
      }
      await db.query('COMMIT'); return token;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async locations(token) {
    if (!this.env.GHL_APP_ID) throw fail('GHL_APP_ID_REQUIRED', 'Configure the Marketplace app ID', 503);
    const result = new Map();
    for (let page = 0; page < 1000; page++) {
      const query = new URLSearchParams({ companyId: token.companyId, appId: this.env.GHL_APP_ID, isInstalled: 'true', limit: '100', skip: String(page * 100) });
      const data = await this.request(`/oauth/installedLocations?${query}`, token);
      if (!Array.isArray(data.locations)) throw fail('GHL_AGENCY_LIST_INVALID', 'HighLevel returned an invalid installed-location list');
      let added = 0;
      for (const location of data.locations) {
        if (location.isInstalled !== true) continue;
        const id = String(location._id || location.id || location.locationId || '');
        if (id && !result.has(id)) { result.set(id, location); added++; }
      }
      if (data.locations.length < 100) return [...result.keys()];
      if (!added) throw fail('GHL_AGENCY_PAGINATION_FAILED', 'Installed-location pagination made no progress');
    }
    throw fail('GHL_AGENCY_PAGINATION_LIMIT', 'Installed-location pagination limit exceeded');
  }
  async provisionLocation(token, locationId, { fallbackUserId = null, correlate = false } = {}) {
    const locationToken = normalizeTokenResponse(await this.request('/oauth/locationToken', token, { companyId: token.companyId, locationId }));
    if (!locationToken.accessToken || !locationToken.refreshToken || locationToken.locationId !== locationId || (locationToken.companyId && locationToken.companyId !== token.companyId)) {
      throw fail('GHL_LOCATION_TOKEN_MISMATCH', 'Location token identity does not match the agency installation');
    }
    if (this.client.config.requiredScopes?.some(scope => !locationToken.scopes.includes(scope))) throw fail('GHL_SCOPES_INSUFFICIENT', 'Location token is missing required app permissions', 409);
    const identity = { companyId: token.companyId, locationId, installationId: `${token.companyId}:${locationId}`, ghlUserId: token.userId, email: null, roleType: 'admin' };
    if (correlate && !await this.marketplaceInstall.claim(identity)) throw fail('GHL_MARKETPLACE_INSTALL_NOT_CORRELATED', 'Waiting for the signed install event for this location', 409);
    return this.provisioning.provision({ identity, token: locationToken, grantedScopes: locationToken.scopes, fallbackUserId });
  }
  async install(token, options = {}) {
    if (token.userType !== 'Company' || !token.companyId || !token.userId || !token.refreshToken) throw fail('GHL_AGENCY_IDENTITY_REQUIRED', 'A verified Company token and installing user are required', 409);
    // Listing with the OAuth token proves the app/company boundary before persisting it.
    const locations = await this.locations(token);
    await this.save({ ...token, expiresAt: Date.now() + token.expiresIn * 1000 });
    const results = [];
    for (const locationId of locations) {
      try { await this.provisionLocation(token, locationId, options); results.push({ locationId, status: 'connected' }); }
      catch (error) { results.push({ locationId, status: 'failed', code: error.code || 'GHL_LOCATION_INSTALL_FAILED' }); }
    }
    return { connected: results.filter(r => r.status === 'connected').length, failed: results.filter(r => r.status === 'failed').length, results };
  }
  async onInstall(event) {
    const token = await this.load(event.companyId);
    if (!token) return;
    // Recheck current installation: a delayed webhook must not re-enable an uninstalled location.
    if (!(await this.locations(token)).includes(event.locationId)) return;
    await this.provisionLocation(token, event.locationId);
  }
}
module.exports = { GhlAgencyInstallService };

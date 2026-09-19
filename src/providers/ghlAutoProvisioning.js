const crypto = require('node:crypto');
const { GhlAgencyInstallService } = require('./ghlAgencyInstall');
const bcrypt = require('bcryptjs');
const express = require('express');
const base = require('./ghlPrivatePilotHardened');
const { OFFICIAL_SCOPES, grantedScopes } = require('./ghlContract');
const { GhlMarketplaceInstallService, createGhlMarketplaceInstallRouter } = require('./ghlMarketplaceInstall');

function stableId(installationId, locationId) {
  return `ghl-installation-${crypto.createHash('sha256').update(`${installationId}:${locationId}`).digest('hex').slice(0, 40)}`;
}

const ROLE_MAP = Object.freeze({
  agency_owner: 'admin', company_owner: 'admin', location_owner: 'admin',
  owner: 'admin', admin: 'admin', administrator: 'admin',
  user: 'agent', staff: 'agent', employee: 'agent', agent: 'agent',
});
function mapGhlRole(roleType) {
  const key = String(roleType || '').trim().toLowerCase();
  return { internalRole: ROLE_MAP[key] || 'agent', mapped: Boolean(ROLE_MAP[key]), source: key || null };
}
function requiresMarketplaceInstallCorrelation(env = process.env) {
  return String(env.GHL_ALLOW_UNCORRELATED_FIRST_INSTALL || '').trim().toLowerCase() !== 'true';
}
function normalizeIdentity({ token, profile, installationHint } = {}) {
  const locationId = String(token?.locationId || profile?.locationId || '').trim();
  const companyId = String(token?.companyId || profile?.companyId || '').trim() || null;
  const ghlUserId = String(token?.userId || profile?.userId || profile?.id || '').trim() || null;
  const email = String(profile?.email || token?.email || '').trim().toLowerCase() || null;
  const roleType = String(profile?.role || profile?.type || token?.userType || '').trim() || null;
  if (!locationId) throw Object.assign(new Error('Verified HighLevel location identity is unavailable'), { code: 'GHL_LOCATION_ID_UNVERIFIED', status: 409 });
  const installationId = String(token?.installationId || installationHint || `${companyId || 'company'}:${locationId}`).trim();
  return { installationId, locationId, companyId, ghlUserId, email, roleType };
}

async function fetchUserProfile(client, accessToken, userId, fetchImpl) {
  if (!userId) return null;
  const response = await fetchImpl(`${client.config.apiUrl}/users/${encodeURIComponent(userId)}`, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', version: client.config.apiVersion || '2023-02-21' } });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const user = payload.user || payload;
  return user && typeof user === 'object' ? user : null;
}

class GhlProvisioningService {
  constructor({ pool, vault, env = process.env, now = () => new Date(), bcryptImpl = bcrypt } = {}) {
    if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function' || !vault) throw new TypeError('GHL provisioning requires PostgreSQL and a credential vault');
    this.pool = pool; this.vault = vault; this.env = env; this.now = now; this.bcrypt = bcryptImpl;
  }
  async createState({ actorUserId = null, ttlMs = 10 * 60 * 1000 } = {}) {
    const raw = crypto.randomBytes(32).toString('base64url');
    await this.pool.query('INSERT INTO ghl_oauth_states(id,state_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,(SELECT id FROM workspaces WHERE owner_id=$3 ORDER BY created_at LIMIT 1),now()+($4*interval \'1 millisecond\'))', [`ghl-state-${crypto.randomUUID()}`, crypto.createHash('sha256').update(raw).digest('hex'), actorUserId, ttlMs]);
    return raw;
  }
  async claimState(rawState) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM ghl_oauth_states WHERE state_hash=$1 FOR UPDATE', [crypto.createHash('sha256').update(String(rawState)).digest('hex')]);
      const row = result.rows[0];
      if (!row || row.used_at || new Date(row.expires_at) <= this.now()) { await client.query('ROLLBACK'); return null; }
      await client.query('UPDATE ghl_oauth_states SET used_at=now() WHERE id=$1', [row.id]);
      await client.query('COMMIT');
      return row;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async ensureUser(client, identity, fallbackUserId) {
    if (!identity.ghlUserId && !fallbackUserId) throw Object.assign(new Error('Verified HighLevel user identity is unavailable; secure onboarding is required'), { code: 'GHL_USER_ID_UNVERIFIED', status: 409 });
    let user = null;
    if (identity.ghlUserId) {
      const linked = await client.query('SELECT u.*,x.email AS external_email FROM ghl_external_users x JOIN users u ON u.id=x.user_id WHERE x.location_id=$1 AND x.ghl_user_id=$2 FOR UPDATE', [identity.locationId, identity.ghlUserId]);
      user = linked.rows[0] || null;
    }
    if (!user && identity.email) {
      const existing = await client.query('SELECT * FROM users WHERE lower(email)=lower($1) FOR UPDATE', [identity.email]);
      user = existing.rows[0] || null;
      if (user && identity.ghlUserId) {
        const conflicting = await client.query('SELECT 1 FROM ghl_external_users WHERE location_id=$1 AND ghl_user_id<>$2 AND user_id=$3 LIMIT 1', [identity.locationId, identity.ghlUserId, user.id]);
        if (conflicting.rowCount) throw Object.assign(new Error('Verified HighLevel identity conflicts with an existing external account link'), { code: 'GHL_IDENTITY_CONFLICT', status: 409 });
      }
    }
    if (!user && fallbackUserId) {
      const fallback = await client.query('SELECT * FROM users WHERE id=$1 AND active=true FOR UPDATE', [fallbackUserId]);
      user = fallback.rows[0] || null;
    }
    if (!user) {
      const placeholder = await this.bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
      const result = await client.query('INSERT INTO users(id,name,email,password_hash,role,active,password_activation_required) VALUES($1,$2,$3,$4,\'client\',true,true) RETURNING *', [crypto.randomUUID(), String(identity.email || `GHL user ${identity.ghlUserId}`).slice(0, 120), identity.email || `ghl-${crypto.createHash('sha256').update(`${identity.locationId}:${identity.ghlUserId}`).digest('hex').slice(0, 24)}@activation.invalid`, placeholder]);
      user = result.rows[0];
    }
    return user;
  }
  async provision({ identity, token, grantedScopes, fallbackUserId = null }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ghl-location:${identity.locationId}`]);
      const existingResult = await client.query('SELECT * FROM ghl_installations WHERE location_id=$1 FOR UPDATE', [identity.locationId]);
      const existing = existingResult.rows[0] || null;
      if (existing?.company_id && identity.companyId && existing.company_id !== identity.companyId) throw Object.assign(new Error('HighLevel location is already bound to another verified company'), { code: 'GHL_CROSS_TENANT_REASSIGNMENT', status: 409 });
      const user = await this.ensureUser(client, identity, fallbackUserId);
      let workspaceId = existing?.workspace_id;
      let workspaceCreated = false;
      if (!workspaceId) {
        const plan = await client.query("SELECT id FROM plans WHERE id='team' OR id='business' ORDER BY CASE WHEN id='team' THEN 0 ELSE 1 END LIMIT 1");
        if (!plan.rowCount) throw Object.assign(new Error('No workspace plan is configured'), { code: 'GHL_WORKSPACE_PLAN_MISSING', status: 503 });
        workspaceId = crypto.randomUUID();
        await client.query('INSERT INTO workspaces(id,owner_id,name,plan_id,status) VALUES($1,$2,$3,$4,\'active\')', [workspaceId, user.id, `HighLevel ${identity.locationId}`, plan.rows[0].id]);
        await client.query('INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES($1,$2,$3,\'owner\')', [crypto.randomUUID(), workspaceId, user.id]);
        workspaceCreated = true;
      } else {
        const member = await client.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE', [workspaceId, user.id]);
        if (!member.rowCount) await client.query('INSERT INTO workspace_members(id,workspace_id,user_id,role) VALUES($1,$2,$3,$4)', [crypto.randomUUID(), workspaceId, user.id, mapGhlRole(identity.roleType).internalRole]);
        else if (member.rows[0].role === 'viewer' && mapGhlRole(identity.roleType).internalRole === 'admin') await client.query("UPDATE workspace_members SET role='admin' WHERE workspace_id=$1 AND user_id=$2 AND role='viewer'", [workspaceId, user.id]);
      }
      const installationId = existing?.installation_id || identity.installationId;
      const rowId = existing?.id || stableId(installationId, identity.locationId);
      const secret = this.vault.encrypt({ accessToken: token.accessToken, refreshToken: token.refreshToken, tokenType: token.tokenType }, rowId);
      await client.query(`INSERT INTO ghl_installations(id,installation_id,company_id,location_id,workspace_id,encrypted_credentials,encryption_key_id,scopes,access_token_expires_at,installing_ghl_user_id,installing_ghl_role_type,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
        ON CONFLICT(location_id) DO UPDATE SET installation_id=EXCLUDED.installation_id,company_id=COALESCE(EXCLUDED.company_id,ghl_installations.company_id),workspace_id=EXCLUDED.workspace_id,encrypted_credentials=EXCLUDED.encrypted_credentials,encryption_key_id=EXCLUDED.encryption_key_id,scopes=EXCLUDED.scopes,access_token_expires_at=EXCLUDED.access_token_expires_at,installing_ghl_user_id=EXCLUDED.installing_ghl_user_id,installing_ghl_role_type=EXCLUDED.installing_ghl_role_type,status='active',updated_at=now()`, [rowId, installationId, identity.companyId, identity.locationId, workspaceId, secret.ciphertext, secret.keyId, grantedScopes, new Date(Date.now() + Number(token.expiresIn || 3600) * 1000), identity.ghlUserId, identity.roleType]);
      if (identity.ghlUserId) await client.query(`INSERT INTO ghl_external_users(id,ghl_user_id,location_id,company_id,user_id,email,role_type,verified_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(location_id,ghl_user_id) DO UPDATE SET company_id=EXCLUDED.company_id,user_id=EXCLUDED.user_id,email=EXCLUDED.email,role_type=EXCLUDED.role_type,verified_at=now(),updated_at=now()`, [crypto.randomUUID(), identity.ghlUserId, identity.locationId, identity.companyId, user.id, identity.email, identity.roleType]);
      await client.query('INSERT INTO audit_logs(id,user_id,action,details) VALUES($1,$2,$3,$4)', [crypto.randomUUID(), user.id, workspaceCreated ? 'ghl.workspace.provisioned' : 'ghl.workspace.reused', { workspaceId, locationId: identity.locationId, companyId: identity.companyId, ghlUserId: identity.ghlUserId, roleType: identity.roleType }]);
      await client.query('COMMIT');
      return { workspaceId, userId: user.id, installationId, locationId: identity.locationId, companyId: identity.companyId, workspaceCreated, reused: Boolean(existing), activationRequired: Boolean(user.password_activation_required) };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

function createGhlAutoProvisioningRuntime({ store, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const runtime = base.createGhlPrivatePilotRuntime({ store, env, fetchImpl });
  if (!runtime.enabled) return runtime;
  const config = base.config(env);
  const service = new GhlProvisioningService({ pool: store.repository.pool, vault: runtime.repository.vault, env });
  const marketplaceInstall = new GhlMarketplaceInstallService({ pool: store.repository.pool, env });
  const agencyInstall = new GhlAgencyInstallService({ pool: store.repository.pool, vault: runtime.repository.vault, client: runtime.client, provisioning: service, marketplaceInstall, env, fetchImpl });
  const marketplaceInstallRouter = createGhlMarketplaceInstallRouter({ service: marketplaceInstall, env, onInstall: event => agencyInstall.onInstall(event) });
  const oauthRouter = express.Router();
  oauthRouter.get('/start', async (req, res) => {
    try {
      const user = req.session?.userId ? store.findUser(req.session.userId) : null;
      if (!user || !user.active) return res.status(401).json({ error: 'Sign in before connecting HighLevel' });
      const rawState = await service.createState({ actorUserId: user.id });
      const url = new URL(config.authUrl); url.searchParams.set('response_type', 'code'); url.searchParams.set('client_id', config.clientId); url.searchParams.set('redirect_uri', config.redirectUri); url.searchParams.set('scope', [...new Set([...config.requiredScopes, ...(req.query.media === '1' ? ['medias.readonly','medias.write','contacts.write','conversations/message.write'] : []), ...(req.query.agency === '1' ? ['oauth.readonly', 'oauth.write'] : [])])].join(' ')); url.searchParams.set('state', rawState); res.redirect(url.toString());
    } catch (error) { res.status(error.status || 503).json({ error: error.message, code: error.code || 'GHL_OAUTH_START_FAILED' }); }
  });
  oauthRouter.get('/callback', async (req, res) => {
    try {
      const rawState = String(req.query.state || '').trim();
      const state = rawState ? await service.claimState(rawState) : null;
      if (rawState && !state) return res.status(400).json({ error: 'HighLevel OAuth state is expired or already used' });
      const code = String(req.query.code || '').trim();
      if (!code) return res.status(400).json({ error: 'HighLevel OAuth callback code is required' });
      const token = await runtime.client.exchangeCode(code);
      const granted = token.scopes?.length ? token.scopes : config.requiredScopes;
      if (config.requiredScopes.some(scope => !granted.includes(scope))) return res.status(400).json({ error: 'HighLevel OAuth scopes are insufficient', code: 'GHL_SCOPES_INSUFFICIENT' });
      if (token.userType === 'Company') {
        const result = await agencyInstall.install(token, { fallbackUserId: state?.user_id || null, correlate: !state && requiresMarketplaceInstallCorrelation(env) });
        res.set('Cache-Control', 'no-store');
        const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        return res.status(result.failed ? 207 : 200).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agency installation</title><body><main><h1>Agency installation</h1><p>' + result.connected + ' locations connected. ' + result.failed + ' locations need attention.</p>' + (!result.results.length ? '<p>No installed locations were returned yet. Select sub-accounts in the GHL installation screen and retry.</p>' : '<ul>' + result.results.map(item => '<li>' + escape(item.locationId) + ': ' + escape(item.status) + (item.code ? ' (' + escape(item.code) + ')' : '') + '</li>').join('') + '</ul>') + '<p>You can open WA Hub inside each connected sub-account.</p><a href="/oauth/crm/start?agency=1">Retry agency connection</a> · <a href="/settings/integrations">Back to integrations</a></main></body></html>');
      }
      const profile = await fetchUserProfile(runtime.client, token.accessToken, token.userId, fetchImpl);
      const identity = normalizeIdentity({ token, profile });
      if (!state && requiresMarketplaceInstallCorrelation(env)) {
        const correlated = await marketplaceInstall.claim(identity);
        if (!correlated) throw Object.assign(new Error('The signed HighLevel App Install event has not been received for this exact app, company, location, and user'), { code: 'GHL_MARKETPLACE_INSTALL_NOT_CORRELATED', status: 409 });
      }
      await service.provision({ identity, token, grantedScopes: grantedScopes(granted.join(' ')), fallbackUserId: state?.user_id || null });
      const destination = config.appOrigin ? `${config.appOrigin.replace(/\/$/, '')}/settings/integrations?ghl=connected` : '/';
      res.redirect(destination);
    } catch (error) { res.status(error.status || 503).json({ error: error.message, code: error.code || 'GHL_OAUTH_CALLBACK_FAILED' }); }
  });
  return { ...runtime, oauthRouter, provisioning: service, agencyInstall, marketplaceInstall, marketplaceInstallRouter };
}

module.exports = { GhlProvisioningService, ROLE_MAP, mapGhlRole, requiresMarketplaceInstallCorrelation, normalizeIdentity, fetchUserProfile, stableId, createGhlAutoProvisioningRuntime };

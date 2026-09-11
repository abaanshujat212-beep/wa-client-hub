const express = require('express');
const base = require('./ghlPrivatePilot');
const crypto = require('node:crypto');
function stableInstallationId(installationId, locationId) { return `ghl-installation-${crypto.createHash('sha256').update(`${installationId}:${locationId}`).digest('hex').slice(0, 40)}`; }
function authUser(req, store) { const user = req.session?.userId && store.findUser(req.session.userId); return user && user.active ? user : null; }
function scopes(value) { return [...new Set(Array.isArray(value) ? value.map(String) : String(value || '').split(/[ ,]+/).filter(Boolean))]; }
function errorResponse(res, error) { const known = error instanceof base.GhlPilotError; return res.status(known ? error.status : 503).json({ error: known ? error.message : 'HighLevel service is temporarily unavailable', code: known ? error.code : 'GHL_PROVIDER_UNAVAILABLE' }); }
function patchTokenContract(client) {
  client.tokenRequest = async function tokenRequest(body) {
    const response = await this.fetchImpl(this.config.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ ...body, client_id: this.config.clientId, client_secret: this.config.clientSecret }).toString() });
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok || !data.access_token) throw new base.GhlPilotError('GHL_TOKEN_EXCHANGE_FAILED', 'HighLevel token exchange failed', 502);
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: Number(data.expires_in || 3600), tokenType: data.token_type || 'Bearer', scopes: scopes(data.scope), companyId: data.companyId || null, locationId: data.locationId || null, userId: data.userId || null };
  };
  client.exchangeCode = function exchangeCode(code) { return this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: this.config.redirectUri }); };
  client.refreshToken = function refreshToken(refreshToken) { return this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }); };
}
function createGhlPrivatePilotRuntime({ store, env = process.env, fetchImpl = globalThis.fetch }) {
  const runtime = base.createGhlPrivatePilotRuntime({ store, env, fetchImpl });
  if (!runtime.enabled) return runtime;
  patchTokenContract(runtime.client);
  const oauthRouter = express.Router();
  oauthRouter.get('/start', async (req, res) => { try { const user = authUser(req, store); const workspaceId = String(req.query.workspaceId || ''); if (!user || !store.canManageWorkspace(user, workspaceId)) return res.status(404).json({ error: 'Workspace not found' }); const c = base.config(env); if (!c.clientId || !c.clientSecret || !c.redirectUri) return res.status(503).json({ error: 'HighLevel OAuth is not configured', code: 'GHL_OAUTH_NOT_CONFIGURED' }); const state = await runtime.repository.createState({ userId: user.id, workspaceId }); const url = new URL(c.authUrl); url.searchParams.set('response_type', 'code'); url.searchParams.set('client_id', c.clientId); url.searchParams.set('redirect_uri', c.redirectUri); url.searchParams.set('scope', c.requiredScopes.join(' ')); url.searchParams.set('state', state); res.redirect(url.toString()); } catch (error) { errorResponse(res, error); } });
  oauthRouter.get('/callback', async (req, res) => { try { const user = authUser(req, store); const code = String(req.query.code || ''); const state = String(req.query.state || ''); if (!user || !code || !state) return res.status(400).json({ error: 'HighLevel OAuth callback is invalid' }); const claimed = await runtime.repository.claimState({ rawState: state, userId: user.id }); if (!claimed) return res.status(400).json({ error: 'HighLevel OAuth state is expired or already used' }); const token = await runtime.client.exchangeCode(code); const c = base.config(env); const granted = token.scopes.length ? token.scopes : c.requiredScopes; if (c.requiredScopes.some(scope => !granted.includes(scope))) return res.status(400).json({ error: 'HighLevel OAuth scopes are insufficient', code: 'GHL_SCOPES_INSUFFICIENT' }); const locationId = String(req.query.locationId || token.locationId || ''); const companyId = String(req.query.companyId || token.companyId || ''); if (!locationId) return res.status(400).json({ error: 'HighLevel location binding is required', code: 'GHL_LOCATION_REQUIRED' }); const installationId = String(req.query.installationId || `${companyId || 'company'}:${locationId}`); await runtime.repository.upsertInstallation({ workspaceId: claimed.workspace_id, installationId, companyId, locationId, credentials: { accessToken: token.accessToken, refreshToken: token.refreshToken, tokenType: token.tokenType }, scopes: granted, expiresAt: new Date(Date.now() + token.expiresIn * 1000) }); const target = c.appOrigin ? `${c.appOrigin.replace(/\/$/, '')}/settings/integrations?ghl=connected` : '/'; res.redirect(target); } catch (error) { errorResponse(res, error); } });
  return { ...runtime, oauthRouter, stableInstallationId };
}
module.exports = { ...base, createGhlPrivatePilotRuntime, stableInstallationId };

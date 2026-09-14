const express = require('express');
const { CredentialVault } = require('../security/credentialVault');
const { MetaGraphClient } = require('./metaGraphClient');
const { MetaCallingClient, MetaCallingError } = require('./metaCallingClient');
const { validCsrf, validateOrigin } = require('./metaSignupRoutes');

function enabled(env = process.env) { return env.META_CALLING_ENABLED === 'true'; }

function createMetaCallingRouter({ enabled: isEnabled = false, env = process.env, store, origin, fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router();
  if (!isEnabled) {
    router.use((_req, res) => res.status(404).json({ error: 'Meta Calling is not enabled' }));
    return router;
  }
  if (!validateOrigin(origin) || store?.driver !== 'postgres' || typeof store?.repository?.pool?.query !== 'function') throw new TypeError('Enabled Meta Calling requires an exact origin and PostgreSQL store');
  const vault = new CredentialVault({ env });
  const graph = new MetaGraphClient({ graphVersion: env.META_GRAPH_VERSION, fetchImpl });
  const calling = new MetaCallingClient({ graphClient: graph, enabled: true });
  const pool = store.repository.pool;

  async function resolveTarget(req, res) {
    const user = req.session?.userId ? store.findUser(req.session.userId) : null;
    if (!user || !user.active) { res.status(401).json({ error: 'Please sign in' }); return null; }
    const workspaceId = String(req.body?.workspaceId || req.query.workspaceId || '').trim();
    const connectionId = String(req.params.connectionId || '').trim();
    if (!workspaceId || !store.canManageWorkspace(user, workspaceId) || !/^[0-9a-f-]{36}$/i.test(connectionId)) { res.status(404).json({ error: 'Meta connection not found' }); return null; }
    const result = await pool.query(`SELECT p.id,p.workspace_id,p.encrypted_credentials,p.encryption_key_id,
      a.waba_id,a.phone_number_id
      FROM provider_connections p JOIN meta_connection_assets a
        ON a.provider_connection_id=p.id AND a.workspace_id=p.workspace_id
      WHERE p.id=$1 AND p.workspace_id=$2 AND p.provider='whatsapp_cloud'
        AND p.status IN ('active','degraded') AND a.disconnected_at IS NULL`, [connectionId, workspaceId]);
    const row = result.rows[0];
    if (!row || !row.encrypted_credentials) { res.status(404).json({ error: 'Meta connection not found' }); return null; }
    const credentials = vault.decrypt(row.encrypted_credentials, row.id, row.encryption_key_id);
    if (!credentials.accessToken) { res.status(409).json({ error: 'Meta credentials are unavailable', code: 'META_CREDENTIALS_UNAVAILABLE' }); return null; }
    return { user, workspaceId, connectionId, phoneNumberId: row.phone_number_id, wabaId: row.waba_id, accessToken: credentials.accessToken };
  }

  router.get('/:connectionId/calling/readiness', async (req, res) => {
    try {
      const target = await resolveTarget(req, res); if (!target) return;
      const settings = await graph.request({ path: [target.phoneNumberId, 'settings'], accessToken: target.accessToken });
      const subscriptions = await graph.request({ path: [target.wabaId, 'subscribed_apps'], accessToken: target.accessToken, query: { limit: 100 } });
      let permissions = null;
      const recipient = String(req.query.recipient || '').replace(/\D/g, '');
      if (recipient) permissions = await graph.request({ path: [target.phoneNumberId, 'call_permissions'], accessToken: target.accessToken, query: { user_wa_id: recipient } });
      return res.json({ connectionId: target.connectionId, wabaId: target.wabaId, phoneNumberId: target.phoneNumberId, settings, subscriptions, permissions });
    } catch (error) {
      return res.status(error?.providerStatus === 401 || error?.providerStatus === 403 ? 502 : 503).json({ error: 'Meta Calling readiness is unavailable', code: error?.code || 'META_CALLING_READINESS_FAILED' });
    }
  });

  router.post('/:connectionId/calling/action', express.json({ limit: '256kb', strict: true }), async (req, res) => {
    if (req.get('origin') !== origin || !validCsrf(req.session?.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' });
    try {
      const target = await resolveTarget(req, res); if (!target) return;
      const result = await calling.action({ phoneNumberId: target.phoneNumberId, accessToken: target.accessToken, ...req.body });
      return res.status(202).json({ accepted: true, action: String(req.body.action || '').toLowerCase(), phoneNumberId: target.phoneNumberId, result });
    } catch (error) {
      if (error instanceof MetaCallingError) return res.status(error.status || 400).json({ error: error.message, code: error.code });
      return res.status(error?.providerStatus === 401 || error?.providerStatus === 403 ? 502 : 503).json({ error: 'Meta Calling action failed', code: error?.code || 'META_CALLING_ACTION_FAILED' });
    }
  });

  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { enabled, createMetaCallingRouter };

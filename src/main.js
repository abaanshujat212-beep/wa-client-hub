require('dotenv').config();
const serverModule = require('./server');
const { createGhlPrivatePilotRuntime } = require('./providers/ghlPrivatePilotHardened');
const { createGhlInboundBridge } = require('./providers/ghlInboundBridge');
const { createMetaSignupRuntime } = require('./messaging/metaSignupRuntime');
const { createMetaWebhookRuntime } = require('./messaging/metaWebhookRuntime');
const { createYCloudWebhookRuntime } = require('./messaging/ycloudWebhookRuntime');
const { prependExactRouter } = require('./messaging/prependExactRouter');

// Keep the public Marketplace callback vendor-neutral even when a deployment omitted the env override.
const appOrigin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
if (!process.env.GHL_REDIRECT_URI && appOrigin) process.env.GHL_REDIRECT_URI = `${appOrigin}/oauth/crm/callback`;

const ghl = createGhlPrivatePilotRuntime({ env: process.env, store: serverModule.store });
const ghlInbound = ghl.enabled ? createGhlInboundBridge({ pool: serverModule.store.repository.pool, deliverInboundWhatsApp: ghl.deliverInboundWhatsApp }) : null;
const inbound = ghlInbound ? ghlInbound.deliver.bind(ghlInbound) : null;
const metaWebhook = createMetaWebhookRuntime({ env: process.env, store: serverModule.store, onInboundMessage: inbound });
prependExactRouter(serverModule.app, '/webhooks/meta/whatsapp', metaWebhook.router);
const ycloudWebhook = createYCloudWebhookRuntime({ env: process.env, store: serverModule.store, onInboundMessage: inbound });
prependExactRouter(serverModule.app, '/webhooks/ycloud/whatsapp', ycloudWebhook.router);
const metaSignup = createMetaSignupRuntime({ env: process.env, store: serverModule.store });
serverModule.app.use('/api/meta/signup', metaSignup.router);
serverModule.app.use('/api/meta/connections/:connectionId/templates', metaSignup.templatesRouter);
serverModule.app.use('/api/meta/connections/:connectionId/media', metaSignup.mediaRouter);
serverModule.app.use('/api/meta/connections', metaSignup.connectionsRouter);
prependExactRouter(serverModule.app, '/webhooks/ghl/events', ghl.eventsRouter);
prependExactRouter(serverModule.app, '/webhooks/ghl/messages', ghl.messagesRouter);

// Readiness is intentionally redacted: it reports binding state, never credentials or raw vault data.
if (ghl.enabled && ghl.apiRouter && serverModule.store.driver === 'postgres') {
  ghl.apiRouter.get('/readiness', async (req, res) => {
    const user = req.session?.userId && serverModule.store.findUser(req.session.userId);
    const workspaceId = String(req.query.workspaceId || '');
    if (!user || !user.active) return res.status(401).json({ error: 'Please sign in' });
    if (!workspaceId || !serverModule.store.canManageWorkspace(user, workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const result = await serverModule.store.repository.pool.query(`
        SELECT i.installation_id, i.company_id, i.location_id, i.workspace_id, i.status,
               i.scopes, i.access_token_expires_at,
               m.whatsapp_number_id, m.provider_connection_id, m.conversation_provider_id,
               n.label AS number_label, n.phone AS number_phone, n.automation_enabled,
               p.provider, p.status AS provider_status
          FROM ghl_installations i
          LEFT JOIN ghl_number_mappings m ON m.installation_id = i.id
            AND m.installation_id IS NOT NULL
          LEFT JOIN whatsapp_numbers n ON n.id = m.whatsapp_number_id
            AND n.workspace_id = i.workspace_id
            AND n.provider_connection_id = m.provider_connection_id
          LEFT JOIN provider_connections p ON p.id = m.provider_connection_id
            AND p.workspace_id = i.workspace_id
         WHERE i.workspace_id = $1
         ORDER BY i.updated_at DESC`, [workspaceId]);
      const requiredScopes = ghl.officialScopes || ['conversations.write'];
      const installations = result.rows.map(row => {
        const scopeReady = requiredScopes.every(scope => (row.scopes || []).includes(scope));
        const mappingReady = Boolean(row.whatsapp_number_id && row.provider_connection_id && row.conversation_provider_id && row.provider_status === 'active');
        return {
          installationId: row.installation_id,
          companyId: row.company_id,
          locationId: row.location_id,
          workspaceId: row.workspace_id,
          status: row.status,
          scopes: row.scopes || [],
          accessTokenExpiresAt: row.access_token_expires_at,
          mappingReady,
          whatsappNumberId: row.whatsapp_number_id || null,
          numberLabel: row.number_label || null,
          numberPhone: row.number_phone || null,
          providerConnectionId: row.provider_connection_id || null,
          provider: row.provider || null,
          providerStatus: row.provider_status || null,
          conversationProviderId: row.conversation_provider_id || null,
          automationEnabled: Boolean(row.automation_enabled),
          oauthReady: row.status === 'active' && scopeReady,
          ready: row.status === 'active' && scopeReady && mappingReady
        };
      });
      res.json({
        configured: Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET && process.env.GHL_REDIRECT_URI),
        publicOrigin: appOrigin || null,
        redirectUri: process.env.GHL_REDIRECT_URI || null,
        requiredScopes,
        unsupportedScopes: ['conversations.read', 'contacts.read', 'locations.read'],
        webhooks: {
          events: `${appOrigin}/webhooks/ghl/events`,
          messages: `${appOrigin}/webhooks/ghl/messages`
        },
        installations,
        mappingCount: installations.filter(item => item.mappingReady).length,
        ready: Boolean(installations.some(item => item.ready))
      });
    } catch (error) {
      res.status(503).json({ error: 'HighLevel readiness is temporarily unavailable', code: 'GHL_READINESS_UNAVAILABLE' });
    }
  });
}

serverModule.app.use('/oauth/crm', ghl.oauthRouter);
// Deprecated compatibility alias only; Marketplace configuration and generated authorization requests use /oauth/crm.
serverModule.app.use('/oauth/highlevel', ghl.oauthRouter);
serverModule.app.use('/api/ghl', ghl.apiRouter);
serverModule.app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/meta/signup/') && !req.path.startsWith('/api/meta/connections/')) return next(error);
  const large = error?.type === 'entity.too.large';
  return res.status(large ? 413 : 400).json({ error: large ? 'Meta request is too large' : 'Invalid Meta request' });
});
serverModule.app.use('/api', (_req, res) => res.status(404).json({ error: 'Feature is not enabled' }));

async function runMain() {
  const server = await serverModule.start();
  metaSignup.start();
  metaWebhook.start();
  ycloudWebhook.start();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    metaSignup.stop();
    metaWebhook.stop();
    ycloudWebhook.stop();
    await new Promise(resolve => server.close(resolve));
    await serverModule.dependencies.close();
    if (typeof serverModule.store.close === 'function') await serverModule.store.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) runMain().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { ...serverModule, metaSignup, metaWebhook, ycloudWebhook, ghl, ghlInbound, runMain };

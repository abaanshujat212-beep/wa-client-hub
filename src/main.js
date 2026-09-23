require('dotenv').config();
const serverModule = require('./server');
const { createGhlAutoProvisioningRuntime } = require('./providers/ghlAutoProvisioning');
const { createGhlEmbeddedRouter, createActivationRouter, createAssignmentRouter } = require('./providers/ghlEmbeddedSso');
const { GhlMessageSync, createSyncRouter } = require('./providers/ghlMessageSync');
const { createGhlCallRouter, enabled: ghlCallingEnabled } = require('./providers/ghlCallProvider');
const { createMetaSignupRuntime } = require('./messaging/metaSignupRuntime');
const { createMetaCallingRouter, enabled: metaCallingEnabled } = require('./messaging/metaCallingRoutes');
const { createMetaWebhookRuntime } = require('./messaging/metaWebhookRuntime');
const { createYCloudWebhookRuntime } = require('./messaging/ycloudWebhookRuntime');
const { createMetaLifecycleRouter } = require('./messaging/metaLifecycleRoutes');
const { prependExactRouter } = require('./messaging/prependExactRouter');

const appOrigin = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
if (!process.env.GHL_REDIRECT_URI && appOrigin) process.env.GHL_REDIRECT_URI = `${appOrigin}/oauth/crm/callback`;
const openWaEnabled = String(process.env.OPENWA_ENABLED || 'false').toLowerCase() === 'true';
const metaSignupEnabled = String(process.env.META_SIGNUP_ENABLED || 'false').toLowerCase() === 'true';
const ycloudEnabled = String(process.env.YCLOUD_ENABLED || 'false').toLowerCase() === 'true';
serverModule.app.get('/api/features', (req, res) => { const user = req.session?.userId && serverModule.store.findUser(req.session.userId); if (!user || !user.active) return res.status(401).json({ error: 'Please sign in' }); res.json({ openwaEnabled: openWaEnabled, metaSignupEnabled: metaSignupEnabled, ycloudEnabled: ycloudEnabled }); });

const ghl = createGhlAutoProvisioningRuntime({ env: process.env, store: serverModule.store });
if (ghl.enabled) {
  const { createWorkflowActions, locationToken } = require('./providers/ghlWorkflowActions');
  const workflow = createWorkflowActions({ pool: serverModule.store.repository.pool, ghl });
  prependExactRouter(serverModule.app, '/webhooks/ghl/workflow-action', workflow.router);
  prependExactRouter(serverModule.app, '/webhooks/ghl/workflow-fields', workflow.fieldsRouter);
  serverModule.app.get('/api/ghl/workflow-config', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const user = req.session?.userId && serverModule.store.findUser(req.session.userId);
    if (!user?.active || user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    try {
      const locationId = String(req.query.locationId || '');
      const row = (await serverModule.store.repository.pool.query("SELECT 1 FROM ghl_installations WHERE location_id=$1 AND status='active'", [locationId])).rows[0];
      if (!row) return res.status(404).json({ error: 'Installed location not found' });
      res.json({ url: `${appOrigin}/webhooks/ghl/workflow-action`, header: 'x-tenx-workflow-key', value: locationToken(locationId), locationId });
    } catch { res.status(503).json({ error: 'Workflow configuration unavailable' }); }
  });
}
const ghlTriggers = ghl.enabled ? require('./providers/ghlWorkflowTriggers').createWorkflowTriggers({pool:serverModule.store.repository.pool}) : null;
if (ghlTriggers) prependExactRouter(serverModule.app, '/webhooks/ghl/workflow-subscription', ghlTriggers.router);
const ghlSync = ghl.enabled ? new GhlMessageSync({pool:serverModule.store.repository.pool,runtime:ghl}) : null;
const ghlInbound = null;
const inbound = null;
const ghlCalls = createGhlCallRouter({ enabled: ghlCallingEnabled(process.env), pool: serverModule.store.repository.pool, publicKey: process.env.GHL_PUBLIC_KEY });
prependExactRouter(serverModule.app, '/webhooks/ghl/calls', ghlCalls);
const metaWebhook = createMetaWebhookRuntime({ env: process.env, store: serverModule.store, onInboundMessage: inbound });
prependExactRouter(serverModule.app, '/webhooks/meta/whatsapp', metaWebhook.router);
const ycloudWebhook = createYCloudWebhookRuntime({ env: process.env, store: serverModule.store, onInboundMessage: inbound });
prependExactRouter(serverModule.app, '/webhooks/ycloud/whatsapp', ycloudWebhook.router);
const metaSignup = createMetaSignupRuntime({ env: process.env, store: serverModule.store });
serverModule.app.use('/api/meta/signup', metaSignup.router);
serverModule.app.use('/api/meta/connections/:connectionId/templates', metaSignup.templatesRouter);
serverModule.app.use('/api/meta/connections/:connectionId/media', metaSignup.mediaRouter);
serverModule.app.use('/api/calling', require('./messaging/metaCallingAccess').createCallingDirectoryRouter({pool:serverModule.store.repository.pool,enabled:metaCallingEnabled(process.env)}));
const metaCalling = createMetaCallingRouter({ enabled: metaCallingEnabled(process.env), env: process.env, store: serverModule.store, origin: appOrigin });
serverModule.app.use('/api/meta/connections/:connectionId/calling', metaCalling);
serverModule.app.use('/api/meta/connections', metaSignup.connectionsRouter);
const metaLifecycle = createMetaLifecycleRouter({ enabled: serverModule.store.driver === 'postgres', pool: serverModule.store.repository.pool, appSecret: process.env.META_APP_SECRET, publicOrigin: appOrigin || 'https://wa.10xcollab.com' });
serverModule.app.use('/meta', metaLifecycle);

if (serverModule.store.driver === 'postgres' && ghl.marketplaceInstallRouter) prependExactRouter(serverModule.app, '/webhooks/ghl/install', ghl.marketplaceInstallRouter);
prependExactRouter(serverModule.app, '/webhooks/ghl/events', ghl.eventsRouter);
prependExactRouter(serverModule.app, '/webhooks/ghl/messages', ghl.messagesRouter);

if (serverModule.store.driver === 'postgres') {
  const ghlEmbedded = createGhlEmbeddedRouter({ pool: serverModule.store.repository.pool, store: serverModule.store, env: process.env });
  const activation = createActivationRouter({ pool: serverModule.store.repository.pool, store: serverModule.store });
  const assignments = createAssignmentRouter({ pool: serverModule.store.repository.pool, store: serverModule.store });
  serverModule.app.use('/api/ghl/embedded', ghlEmbedded);
  serverModule.app.use('/api/activation', activation);
  serverModule.app.use('/api/workspaces', assignments);
}

if (ghl.enabled && ghl.apiRouter && serverModule.store.driver === 'postgres') {
  serverModule.app.use('/api/ghl/message-sync',createSyncRouter({service:ghlSync,store:serverModule.store}));
  serverModule.app.use('/api/ghl/team', require('./providers/ghlTeam').createGhlTeamRouter({pool:serverModule.store.repository.pool,store:serverModule.store,runtime:ghl}));
  ghl.apiRouter.get('/readiness', async (req, res) => {
    const user = req.session?.userId && serverModule.store.findUser(req.session.userId);
    const workspaceId = String(req.query.workspaceId || '');
    if (!user || !user.active) return res.status(401).json({ error: 'Please sign in' });
    if (!workspaceId || !serverModule.store.canManageWorkspace(user, workspaceId)) return res.status(404).json({ error: 'Workspace not found' });
    try {
      const result = await serverModule.store.repository.pool.query(`
        SELECT i.installation_id, i.company_id, i.location_id, i.workspace_id, i.status,
               i.scopes, i.access_token_expires_at, i.installing_ghl_user_id, i.installing_ghl_role_type,
               m.whatsapp_number_id, m.provider_connection_id, m.conversation_provider_id,
               n.label AS number_label, n.phone AS number_phone, n.automation_enabled,
               p.provider, p.status AS provider_status
          FROM ghl_installations i
          LEFT JOIN ghl_number_mappings m ON m.installation_id = i.id
          LEFT JOIN whatsapp_numbers n ON n.id = m.whatsapp_number_id AND n.workspace_id = i.workspace_id AND n.provider_connection_id = m.provider_connection_id
          LEFT JOIN provider_connections p ON p.id = m.provider_connection_id AND p.workspace_id = i.workspace_id
         WHERE i.workspace_id = $1 ORDER BY i.updated_at DESC`, [workspaceId]);
      const requiredScopes = ghl.officialScopes || ['conversations.write'];
      const installations = result.rows.map(row => { const scopeReady = requiredScopes.every(scope => (row.scopes || []).includes(scope)); const mappingReady = Boolean(row.whatsapp_number_id && row.provider_connection_id && row.conversation_provider_id && row.provider_status === 'active'); return { installationId: row.installation_id, companyId: row.company_id, locationId: row.location_id, workspaceId: row.workspace_id, status: row.status, scopes: row.scopes || [], accessTokenExpiresAt: row.access_token_expires_at, installingGhlUserId: row.installing_ghl_user_id || null, installingGhlRoleType: row.installing_ghl_role_type || null, mappingReady, whatsappNumberId: row.whatsapp_number_id || null, numberLabel: row.number_label || null, numberPhone: row.number_phone || null, providerConnectionId: row.provider_connection_id || null, provider: row.provider || null, providerStatus: row.provider_status || null, conversationProviderId: row.conversation_provider_id || null, automationEnabled: Boolean(row.automation_enabled), oauthReady: row.status === 'active' && scopeReady, ready: row.status === 'active' && scopeReady && mappingReady }; });
      res.json({ configured: Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET && process.env.GHL_REDIRECT_URI), publicOrigin: appOrigin || null, redirectUri: process.env.GHL_REDIRECT_URI || null, requiredScopes, unsupportedScopes: ['conversations.read', 'contacts.read', 'locations.read'], webhooks: { install: `${appOrigin}/webhooks/ghl/install`, events: `${appOrigin}/webhooks/ghl/events`, messages: `${appOrigin}/webhooks/ghl/messages`, calls: `${appOrigin}/webhooks/ghl/calls` }, installations, mappingCount: installations.filter(item => item.mappingReady).length, ready: Boolean(installations.some(item => item.ready)) });
    } catch { res.status(503).json({ error: 'HighLevel readiness is temporarily unavailable', code: 'GHL_READINESS_UNAVAILABLE' }); }
  });
}

serverModule.app.use('/oauth/crm', ghl.oauthRouter);
serverModule.app.use('/oauth/highlevel', ghl.oauthRouter);
serverModule.app.use('/api/ghl', ghl.apiRouter);
serverModule.app.use((error, req, res, next) => { if (!req.path.startsWith('/api/meta/signup/') && !req.path.startsWith('/api/meta/connections/')) return next(error); const large = error?.type === 'entity.too.large'; return res.status(large ? 413 : 400).json({ error: large ? 'Meta request is too large' : 'Invalid Meta request' }); });
serverModule.app.use('/api', (_req, res) => res.status(404).json({ error: 'Feature is not enabled' }));

async function runMain() {
  const server = await serverModule.start(); metaSignup.start(); metaWebhook.start(); ycloudWebhook.start(); ghlSync?.start(); ghlTriggers?.start(); let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; metaSignup.stop(); metaWebhook.stop(); ycloudWebhook.stop(); ghlSync?.stop(); ghlTriggers?.stop(); await new Promise(resolve => server.close(resolve)); await serverModule.dependencies.close(); if (typeof serverModule.store.close === 'function') await serverModule.store.close(); process.exit(0); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); return server;
}
if (require.main === module) runMain().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { ...serverModule, metaSignup, metaLifecycle, metaWebhook, ycloudWebhook, metaCalling, ghl, ghlInbound, ghlSync, ghlCalls, runMain };

const { MetaSignupProtection } = require('./metaSignupProtection');
const { validateOrigin } = require('./metaSignupRoutes');

function enabled(env) { return env.META_SIGNUP_ENABLED === 'true'; }
function parseInterval(value) {
  if (value === undefined || value === '') return 300000;
  if (!/^\d+$/.test(String(value))) throw new Error('META_SIGNUP_CLEANUP_INTERVAL_MS must be an integer');
  const interval = Number(value);
  if (!Number.isSafeInteger(interval) || interval < 60000 || interval > 3600000) throw new Error('META_SIGNUP_CLEANUP_INTERVAL_MS must be between 60000 and 3600000');
  return interval;
}
function validateMetaSignupConfig(env = process.env, store) {
  if (!enabled(env)) return { enabled: false };
  const issues = [];
  if (store?.driver !== 'postgres' || typeof store?.repository?.pool?.query !== 'function') issues.push('PostgreSQL storage is required');
  if (!validateOrigin(env.APP_ORIGIN)) issues.push('APP_ORIGIN must be one exact HTTPS origin');
  if (!/^v\d+\.\d+$/.test(String(env.META_GRAPH_VERSION || ''))) issues.push('META_GRAPH_VERSION must be explicit');
  if (!/^\d+$/.test(String(env.META_APP_ID || ''))) issues.push('META_APP_ID must contain digits');
  if (String(env.META_APP_SECRET || '').length < 20) issues.push('META_APP_SECRET is missing or too short');
  let interval;
  try { interval = parseInterval(env.META_SIGNUP_CLEANUP_INTERVAL_MS); } catch (error) { issues.push(error.message); }
  if (issues.length) throw new Error(`Meta signup configuration error: ${issues.join('; ')}`);
  return { enabled: true, origin: env.APP_ORIGIN, interval };
}
function createMetaSignupRuntime({ env = process.env, store, logger = console, fetchImpl = globalThis.fetch } = {}) {
  const config = validateMetaSignupConfig(env, store);
  const hidden = (_req, res) => res.status(404).json({ error: 'Not found' });
  if (!config.enabled) return { enabled: false, router: hidden, connectionsRouter: hidden, templatesRouter: hidden, start() {}, stop() {}, status: () => ({ enabled: false, cleanup: 'disabled' }) };
  const { MetaEmbeddedSignupService } = require('./metaEmbeddedSignupService');
  const { createMetaSignupRouter } = require('./metaSignupRoutes');
  const { createMetaConnectionRouter } = require('./metaConnectionRoutes');
  const { createMetaTemplateSyncRouter } = require('./metaTemplateSyncRoutes');
  const { MetaConnectionLifecycleRepository } = require('./metaConnectionLifecycleRepository');
  const { MetaConnectionDiagnosticsService } = require('./metaConnectionDiagnosticsService');
  const { MetaGraphClient } = require('./metaGraphClient');
  const { MetaTemplateSyncRepository } = require('./metaTemplateSyncRepository');
  const { MetaTemplateSyncService } = require('./metaTemplateSyncService');
  const { CredentialVault } = require('../security/credentialVault');
  const pool = store.repository.pool;
  const signupService = new MetaEmbeddedSignupService({ graphVersion: env.META_GRAPH_VERSION, appId: env.META_APP_ID, appSecret: env.META_APP_SECRET }); signupService.assertConfigured();
  const vault = new CredentialVault({ env }); const protection = new MetaSignupProtection(pool);
  const repository = new MetaConnectionLifecycleRepository(pool, vault);
  const diagnostics = new MetaConnectionDiagnosticsService({ repository, graphVersion: env.META_GRAPH_VERSION });
  const graphClient = new MetaGraphClient({ graphVersion: env.META_GRAPH_VERSION, fetchImpl });
  const templateRepository = new MetaTemplateSyncRepository(pool, vault);
  const templateService = new MetaTemplateSyncService({ repository: templateRepository, graphClient });
  const router = createMetaSignupRouter({ enabled: true, pool, signupService, vault, origin: config.origin, publicConfig: { appId: env.META_APP_ID, configId: env.META_EMBEDDED_SIGNUP_CONFIG_ID, graphVersion: env.META_GRAPH_VERSION } });
  const connectionsRouter = createMetaConnectionRouter({ enabled: true, pool, repository, diagnostics, origin: config.origin });
  const templatesRouter = createMetaTemplateSyncRouter({ enabled: true, pool, service: templateService, origin: config.origin });
  let timer = null; let running = false; let lastSuccessAt = null; let lastFailureAt = null;
  async function cleanup() {
    if (running) return; running = true;
    try { const counts = await protection.cleanup(500); lastSuccessAt = new Date().toISOString(); logger.info?.('Meta signup cleanup completed', counts); }
    catch { lastFailureAt = new Date().toISOString(); logger.error?.('Meta signup cleanup failed'); }
    finally { running = false; }
  }
  return { enabled: true, router, connectionsRouter, templatesRouter,
    start() { if (timer) return; void cleanup(); timer = setInterval(() => void cleanup(), config.interval); timer.unref?.(); },
    stop() { if (timer) clearInterval(timer); timer = null; },
    status: () => ({ enabled: true, cleanup: running ? 'running' : 'scheduled', lastSuccessAt, lastFailureAt }), cleanup };
}
module.exports = { createMetaSignupRuntime, validateMetaSignupConfig, parseInterval, enabled };

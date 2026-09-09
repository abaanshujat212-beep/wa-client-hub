const { validCsrf, validateOrigin } = require('./metaSignupRoutes');
const { MetaSignupProtection } = require('./metaSignupProtection');

function validScope(body) {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === 1 && typeof body.workspaceId === 'string' &&
    body.workspaceId.length > 0 && body.workspaceId.length <= 256);
}
function lifecycleError(error) {
  const code = String(error?.code || '');
  if (code === 'META_CONNECTION_NOT_FOUND') return { status: 404, body: { error: 'Meta connection not found', code } };
  if (code === 'META_ACTIVATION_NOT_READY') return { status: 409, body: { error: 'Meta connection is not ready for activation', code } };
  if (code === 'META_DIAGNOSTICS_AUTH_FAILED' || code === 'META_DIAGNOSTICS_ASSET_MISMATCH') return { status: 502, body: { error: 'Meta diagnostics failed', code } };
  if (code === 'META_CREDENTIALS_UNAVAILABLE') return { status: 409, body: { error: 'Meta credentials are unavailable', code } };
  return { status: 503, body: { error: 'Meta connection is temporarily unavailable', code: 'META_CONNECTION_UNAVAILABLE' } };
}
function createMetaConnectionRouter({ enabled = false, pool, repository, diagnostics, origin } = {}) {
  const express = require('express'); const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (enabled !== true) { router.use((_req, res) => res.status(404).json({ error: 'Not found' })); return router; }
  if (!validateOrigin(origin) || typeof pool?.query !== 'function' || typeof repository?.status !== 'function' || typeof diagnostics?.run !== 'function') throw new TypeError('Enabled Meta lifecycle dependencies are required');
  const protection = new MetaSignupProtection(pool);
  async function actor(req, res) {
    if (typeof req.session?.userId !== 'string' || !req.session.userId || req.session.userId.length > 256 || typeof req.sessionID !== 'string' || !req.sessionID) { res.status(401).json({ error: 'Please sign in' }); return null; }
    try { const current = (await pool.query('SELECT id FROM users WHERE id=$1 AND active=true', [req.session.userId])).rows[0]; if (!current) { res.status(401).json({ error: 'Please sign in' }); return null; } return current; }
    catch { res.status(503).json({ error: 'Meta connection is temporarily unavailable', code: 'META_CONNECTION_UNAVAILABLE' }); return null; }
  }
  const writeGuard = async (req, res, next) => {
    if (req.get('origin') !== origin || !validCsrf(req.session?.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' });
    const current = await actor(req, res); if (!current) return; req.user = current;
    try { const admission = await protection.consume(current.id, 'complete'); if (!admission.allowed) return res.set('Retry-After', String(admission.retryAfter)).status(429).json({ error: 'Too many Meta connection operations', code: 'META_CONNECTION_RATE_LIMITED' }); if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' }); next(); }
    catch { return res.status(503).json({ error: 'Meta connection is temporarily unavailable', code: 'META_CONNECTION_UNAVAILABLE' }); }
  };
  router.get('/:connectionId', async (req, res) => {
    const current = await actor(req, res); if (!current) return;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!workspaceId || workspaceId.length > 256 || !/^[0-9a-f-]{36}$/i.test(req.params.connectionId)) return res.status(400).json({ error: 'Valid connection scope is required' });
    try { const value = await repository.status({ actorId: current.id, workspaceId, connectionId: req.params.connectionId }); if (!value) return res.status(404).json({ error: 'Meta connection not found' }); res.json(value); }
    catch (error) { const mapped = lifecycleError(error); res.status(mapped.status).json(mapped.body); }
  });
  router.post('/:connectionId/diagnostics', writeGuard, express.json({ limit: '2kb', strict: true }), async (req, res) => {
    if (!validScope(req.body) || !/^[0-9a-f-]{36}$/i.test(req.params.connectionId)) return res.status(400).json({ error: 'Valid connection scope is required' });
    try { res.json(await diagnostics.run({ actorId: req.user.id, workspaceId: req.body.workspaceId, connectionId: req.params.connectionId })); }
    catch (error) { const mapped = lifecycleError(error); res.status(mapped.status).json(mapped.body); }
  });
  router.post('/:connectionId/activate', writeGuard, express.json({ limit: '2kb', strict: true }), async (req, res) => {
    if (!validScope(req.body) || !/^[0-9a-f-]{36}$/i.test(req.params.connectionId)) return res.status(400).json({ error: 'Valid connection scope is required' });
    try { res.json(await repository.activate({ actorId: req.user.id, workspaceId: req.body.workspaceId, connectionId: req.params.connectionId })); }
    catch (error) { const mapped = lifecycleError(error); res.status(mapped.status).json(mapped.body); }
  });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => { const large = error?.type === 'entity.too.large'; res.status(large ? 413 : 400).json({ error: large ? 'Meta connection request is too large' : 'Invalid Meta connection request' }); });
  return router;
}
module.exports = { createMetaConnectionRouter, validScope, lifecycleError };

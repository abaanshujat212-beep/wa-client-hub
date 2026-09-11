const { validCsrf, validateOrigin } = require('./metaSignupRoutes');

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

function validScope(body) {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === 2 && validId(body.workspaceId) && validId(body.numberId));
}

function mapError(error) {
  const code = String(error?.code || '');
  if (code === 'META_CONNECTION_NOT_FOUND') return { status: 404, body: { error: 'Meta connection or number not found', code } };
  if (code === 'META_TEMPLATE_BINDING_CHANGED') return { status: 409, body: { error: 'Meta template target changed; retry the synchronization', code } };
  if (code === 'META_CREDENTIALS_UNAVAILABLE') return { status: 409, body: { error: 'Meta credentials are unavailable', code } };
  if (code === 'META_TEMPLATE_PAYLOAD_INVALID' || code === 'META_TEMPLATE_PAGE_LIMIT') return { status: 502, body: { error: 'Meta returned an invalid template catalog', code: 'META_TEMPLATE_SYNC_INVALID' } };
  if (code.startsWith('META_HTTP_') || code === 'META_TIMEOUT' || code === 'META_NETWORK_ERROR' || code === 'META_TEMPLATE_SYNC_UNAVAILABLE') return { status: 503, body: { error: 'Meta template synchronization is temporarily unavailable', code: 'META_TEMPLATE_SYNC_UNAVAILABLE' } };
  return { status: 503, body: { error: 'Meta template synchronization is temporarily unavailable', code: 'META_TEMPLATE_SYNC_UNAVAILABLE' } };
}

function createMetaTemplateSyncRouter({ enabled = false, pool, service, origin } = {}) {
  const express = require('express');
  const router = express.Router({ mergeParams: true });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (enabled !== true) { router.use((_req, res) => res.status(404).json({ error: 'Not found' })); return router; }
  if (!validateOrigin(origin) || typeof pool?.query !== 'function' || typeof service?.sync !== 'function' || typeof service?.list !== 'function') throw new TypeError('Enabled Meta template sync requires HTTPS origin, PostgreSQL and service');

  async function currentActor(req, res) {
    if (!validId(req.params.connectionId) || typeof req.session?.userId !== 'string' || !req.session.userId || typeof req.sessionID !== 'string' || !req.sessionID) { res.status(401).json({ error: 'Please sign in' }); return null; }
    try {
      const actor = (await pool.query('SELECT id FROM users WHERE id=$1 AND active=true', [req.session.userId])).rows[0];
      if (!actor) { res.status(401).json({ error: 'Please sign in' }); return null; }
      return actor;
    } catch { res.status(503).json({ error: 'Meta template synchronization is temporarily unavailable', code: 'META_TEMPLATE_SYNC_UNAVAILABLE' }); return null; }
  }

  const writeGuard = async (req, res, next) => {
    if (req.get('origin') !== origin || !validCsrf(req.session?.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' });
    if (!await currentActor(req, res)) return;
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' });
    next();
  };

  router.get('/', async (req, res) => {
    const actor = await currentActor(req, res); if (!actor) return;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    const numberId = typeof req.query.numberId === 'string' ? req.query.numberId : '';
    if (!validScope({ workspaceId, numberId })) return res.status(400).json({ error: 'Exact workspace and number scope is required' });
    try {
      res.json(await service.list({ actorId: actor.id, workspaceId, connectionId: req.params.connectionId, numberId }));
    } catch (error) {
      const mapped = mapError(error); res.status(mapped.status).json(mapped.body);
    }
  });

  router.post('/sync', writeGuard, require('express').json({ limit: '4kb', strict: true }), async (req, res) => {
    if (!validScope(req.body)) return res.status(400).json({ error: 'Exact workspace and number scope is required' });
    try {
      const result = await service.sync({ actorId: req.session.userId, workspaceId: req.body.workspaceId, connectionId: req.params.connectionId, numberId: req.body.numberId });
      res.json(result);
    } catch (error) {
      const mapped = mapError(error); res.status(mapped.status).json(mapped.body);
    }
  });

  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => { const large = error?.type === 'entity.too.large'; res.status(large ? 413 : 400).json({ error: large ? 'Template sync request is too large' : 'Invalid template sync request' }); });
  return router;
}

module.exports = { createMetaTemplateSyncRouter, validId, validScope, mapError };

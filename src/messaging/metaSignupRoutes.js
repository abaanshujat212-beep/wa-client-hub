const crypto = require('node:crypto');
const { NumberCreationPolicy } = require('../db/numberCreationPolicy');
const { MetaSignupStateRepository } = require('./metaSignupStateRepository');
const { MetaConnectionRepository } = require('./metaConnectionRepository');
const { MetaSignupProtection } = require('./metaSignupProtection');
const { MetaOnboardingRepository } = require('./metaOnboardingRepository');
const { createMetaSignupHandlers } = require('./metaSignupOrchestrator');

function validCsrf(expected, supplied) {
  return typeof expected === 'string' && typeof supplied === 'string' &&
    /^[a-f0-9]{48}$/.test(expected) && /^[a-f0-9]{48}$/.test(supplied) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
function validStateBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === 1 && typeof body.state === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(body.state);
}
function validBody(action, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (action === 'cancel') return validStateBody(body);
  const fields = action === 'start' ? ['workspaceId', 'label'] : ['state', 'code', 'businessAccountId', 'phoneNumberId'];
  if (Object.keys(body).some(key => !fields.includes(key))) return false;
  if (action === 'start') return typeof body.workspaceId === 'string' && body.workspaceId.length > 0 && body.workspaceId.length <= 256 && typeof body.label === 'string' && body.label.trim().length >= 2 && body.label.length <= 200;
  return typeof body.state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.state) &&
    typeof body.code === 'string' && body.code.length > 0 && body.code.length <= 4096 &&
    ['businessAccountId', 'phoneNumberId'].every(key => typeof body[key] === 'string' && /^\d{1,64}$/.test(body[key]));
}
function validateOrigin(origin) {
  try { const url = new URL(origin); return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password; }
  catch { return false; }
}
function validPublicConfig(value) {
  return value && /^\d{1,64}$/.test(value.appId) && /^\d{1,64}$/.test(value.configId) && /^v\d+\.\d+$/.test(value.graphVersion);
}
function createMetaSignupRouter({ enabled = false, pool, signupService, vault, origin, publicConfig } = {}) {
  const express = require('express');
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (enabled !== true) { router.use((_req, res) => res.status(404).json({ error: 'Not found' })); return router; }
  if (!validateOrigin(origin) || typeof pool?.query !== 'function' || typeof pool?.connect !== 'function' || typeof signupService?.exchangeAndVerify !== 'function' || typeof vault?.encrypt !== 'function') throw new TypeError('Enabled Meta signup requires HTTPS origin, PostgreSQL, signup service and vault');
  const protection = new MetaSignupProtection(pool);
  const authorization = new NumberCreationPolicy(pool);
  const states = new MetaSignupStateRepository(pool);
  const onboarding = new MetaOnboardingRepository(pool);
  const handlers = createMetaSignupHandlers({ authorization, stateRepository: states, signupService, connectionRepository: new MetaConnectionRepository(pool, vault) });
  async function currentActor(req, res) {
    if (typeof req.session?.userId !== 'string' || !req.session.userId || req.session.userId.length > 256 || typeof req.sessionID !== 'string' || !req.sessionID || req.sessionID.length > 256) { res.status(401).json({ error: 'Please sign in' }); return null; }
    try { const actor = (await pool.query('SELECT id,active FROM users WHERE id=$1 AND active=true', [req.session.userId])).rows[0]; if (!actor) { res.status(401).json({ error: 'Please sign in' }); return null; } req.user = actor; return actor; }
    catch { res.status(503).json({ error: 'Meta signup is temporarily unavailable', code: 'META_SIGNUP_UNAVAILABLE' }); return null; }
  }
  const guard = action => async (req, res, next) => {
    if (typeof req.session?.userId !== 'string' || !req.session.userId || typeof req.sessionID !== 'string' || !req.sessionID) return res.status(401).json({ error: 'Please sign in' });
    if (req.get('origin') !== origin || !validCsrf(req.session.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' });
    const actor = await currentActor(req, res); if (!actor) return;
    try { const admission = await protection.consume(actor.id, action === 'start' ? 'start' : 'complete'); if (!admission.allowed) return res.set('Retry-After', String(admission.retryAfter)).status(429).json({ error: 'Too many signup attempts', code: 'META_SIGNUP_RATE_LIMITED' }); if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' }); next(); }
    catch { return res.status(503).json({ error: 'Meta signup is temporarily unavailable', code: 'META_SIGNUP_UNAVAILABLE' }); }
  };
  router.get('/config', async (req, res) => {
    if (!await currentActor(req, res)) return;
    if (!validPublicConfig(publicConfig)) return res.status(404).json({ error: 'Not found' });
    res.json({ appId: publicConfig.appId, configId: publicConfig.configId, graphVersion: publicConfig.graphVersion });
  });
  router.get('/status', async (req, res) => {
    const actor = await currentActor(req, res); if (!actor) return;
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!workspaceId || workspaceId.length > 256) return res.status(400).json({ error: 'Valid workspace is required' });
    try { if (!await authorization.canManageWorkspace(actor, workspaceId)) return res.status(404).json({ error: 'Workspace not found' }); res.json(await onboarding.status(actor.id, workspaceId)); }
    catch { res.status(503).json({ error: 'Meta signup is temporarily unavailable', code: 'META_SIGNUP_UNAVAILABLE' }); }
  });
  for (const action of ['start', 'complete']) router.post(`/${action}`, guard(action), express.json({ limit: '16kb', strict: true }), (req, res, next) => {
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > 16384) return res.status(413).json({ error: 'Signup request is too large' });
    if (!validBody(action, req.body)) return res.status(400).json({ error: 'Valid signup details are required' });
    return handlers[action](req, res, next);
  });
  router.post('/cancel', guard('cancel'), express.json({ limit: '2kb', strict: true }), async (req, res) => {
    if (!validBody('cancel', req.body)) return res.status(400).json({ error: 'Valid signup state is required' });
    try { await states.cancel({ state: req.body.state, sessionId: req.sessionID, actorId: req.user.id }); res.status(204).end(); }
    catch { res.status(503).json({ error: 'Meta signup is temporarily unavailable', code: 'META_SIGNUP_UNAVAILABLE' }); }
  });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => { const large = error?.type === 'entity.too.large'; res.status(large ? 413 : 400).json({ error: large ? 'Signup request is too large' : 'Invalid signup request' }); });
  return router;
}
module.exports = { createMetaSignupRouter, validCsrf, validBody, validateOrigin, validPublicConfig };

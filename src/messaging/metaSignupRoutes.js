const crypto = require('node:crypto');
const { NumberCreationPolicy } = require('../db/numberCreationPolicy');
const { MetaSignupStateRepository } = require('./metaSignupStateRepository');
const { MetaConnectionRepository } = require('./metaConnectionRepository');
const { MetaSignupProtection } = require('./metaSignupProtection');
const { createMetaSignupHandlers } = require('./metaSignupOrchestrator');

function validCsrf(expected, supplied) {
  return typeof expected === 'string' && typeof supplied === 'string' &&
    /^[a-f0-9]{48}$/.test(expected) && /^[a-f0-9]{48}$/.test(supplied) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}
function validBody(action, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const fields = action === 'start' ? ['workspaceId', 'label'] : ['state', 'code', 'businessAccountId', 'phoneNumberId'];
  if (Object.keys(body).some(key => !fields.includes(key))) return false;
  if (action === 'start') return typeof body.workspaceId === 'string' && body.workspaceId.length > 0 && body.workspaceId.length <= 256 && typeof body.label === 'string' && body.label.trim().length >= 2 && body.label.length <= 200;
  return typeof body.state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.state) &&
    typeof body.code === 'string' && body.code.length > 0 && body.code.length <= 4096 &&
    ['businessAccountId', 'phoneNumberId'].every(key => typeof body[key] === 'string' && /^\d{1,64}$/.test(body[key]));
}
function validateOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

// Mount AFTER the existing persisted-session middleware. The factory is inert
// unless explicitly enabled; the main server does not mount it in this slice.
function createMetaSignupRouter({ enabled = false, pool, signupService, vault, origin } = {}) {
  const express = require('express');
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (enabled !== true) {
    router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    return router;
  }
  if (!validateOrigin(origin) || typeof pool?.query !== 'function' || typeof pool?.connect !== 'function' ||
      typeof signupService?.exchangeAndVerify !== 'function' || typeof vault?.encrypt !== 'function') {
    throw new TypeError('Enabled Meta signup requires HTTPS origin, PostgreSQL, signup service and vault');
  }
  const protection = new MetaSignupProtection(pool);
  const handlers = createMetaSignupHandlers({ authorization: new NumberCreationPolicy(pool),
    stateRepository: new MetaSignupStateRepository(pool), signupService,
    connectionRepository: new MetaConnectionRepository(pool, vault) });
  const guard = action => async (req, res, next) => {
    if (typeof req.session?.userId !== 'string' || !req.session.userId || req.session.userId.length > 256 ||
        typeof req.sessionID !== 'string' || !req.sessionID || req.sessionID.length > 256) return res.status(401).json({ error: 'Please sign in' });
    if (req.get('origin') !== origin || !validCsrf(req.session.csrfToken, req.get('x-csrf-token'))) return res.status(403).json({ error: 'Security token or origin is invalid' });
    try {
      const actor = (await pool.query('SELECT id,active FROM users WHERE id=$1 AND active=true', [req.session.userId])).rows[0];
      if (!actor) return res.status(401).json({ error: 'Please sign in' });
      req.user = actor; // Never trust body/query actor IDs or cached request roles.
      const admission = await protection.consume(actor.id, action);
      if (!admission.allowed) return res.set('Retry-After', String(admission.retryAfter)).status(429).json({ error: 'Too many signup attempts', code: 'META_SIGNUP_RATE_LIMITED' });
      if (!req.is('application/json')) return res.status(415).json({ error: 'JSON body required' });
      next();
    } catch { return res.status(503).json({ error: 'Meta signup is temporarily unavailable', code: 'META_SIGNUP_UNAVAILABLE' }); }
  };
  for (const action of ['start', 'complete']) router.post(`/${action}`, guard(action), express.json({ limit: '16kb', strict: true }), (req, res, next) => {
    // Also enforce the small body limit when the main app has already parsed JSON.
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > 16384) return res.status(413).json({ error: 'Signup request is too large' });
    if (!validBody(action, req.body)) return res.status(400).json({ error: 'Valid signup details are required' });
    return handlers[action](req, res, next);
  });
  router.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  router.use((error, _req, res, _next) => {
    const large = error?.type === 'entity.too.large';
    res.status(large ? 413 : 400).json({ error: large ? 'Signup request is too large' : 'Invalid signup request' });
  });
  return router;
}
module.exports = { createMetaSignupRouter, validCsrf, validBody, validateOrigin };

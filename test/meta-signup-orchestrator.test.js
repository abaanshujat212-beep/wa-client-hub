const test = require('node:test');
const assert = require('node:assert/strict');
const { createMetaSignupHandlers } = require('../src/messaging/metaSignupOrchestrator');
function response() { return { statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } }; }
function fixture() {
  const calls = []; const claims = new Map(); let allowed = true; let clock = 1000;
  const stateRepository = {
    async create(input) { claims.set(input.state, { ...input, processing: false, expiresAt: clock + input.ttlMs }); return { expiresAt: new Date(clock + input.ttlMs).toISOString() }; },
    async claim({ state, sessionId, actorId }) { const row = claims.get(state); if (!row || row.sessionId !== sessionId || row.actorId !== actorId || row.expiresAt <= clock || row.processing) return null; row.processing = true; return { workspaceId: row.workspaceId, label: row.label }; },
    async release({ state }) { const row = claims.get(state); if (!row || !row.processing) return false; row.processing = false; return true; },
    async complete({ state }) { const row = claims.get(state); if (!row || !row.processing) return false; claims.delete(state); return true; },
  };
  const authorization = { canManageWorkspace: () => allowed };
  const signupService = { async exchangeAndVerify(input) { calls.push(['exchange', input]); return { accessToken: 'fixture-token-not-a-real-credential', metaUserId: '555', businessAccountId: '987', phoneNumberId: '123', displayPhoneNumber: '+923001112222' }; } };
  const connectionRepository = { async install(input) { calls.push(['install', input]); return { connection: { id: 'connection-a', status: 'connecting' }, number: { id: 'number-a', phone: input.phone } }; } };
  const dependencies = { authorization, stateRepository, signupService, connectionRepository };
  const handlers = createMetaSignupHandlers(dependencies);
  const request = (body = {}) => ({ user: { id: 'owner-a', active: true }, sessionID: 'session-a', session: {}, body });
  async function start() { const res = response(); await handlers.start(request({ workspaceId: 'workspace-a', label: 'Official WA', state: undefined }), res); assert.equal(res.statusCode, 201); return res.body.state; }
  return { calls, claims, handlers, dependencies, request, start, setAllowed(value) { allowed = value; }, expire() { clock = 700000; } };
}
test('signup keeps tenant-bound state until verified installation succeeds', async () => {
  const f = fixture(); const state = await f.start(); const res = response();
  await f.handlers.complete(f.request({ state, code: 'one-time', workspaceId: 'tampered', businessAccountId: '987', phoneNumberId: '123' }), res);
  assert.equal(res.statusCode, 201); assert.equal(f.calls[1][1].workspaceId, 'workspace-a'); assert.equal(f.calls[1][1].metaUserId, '555'); assert.equal(f.claims.size, 0);
  const replay = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), replay); assert.equal(replay.statusCode, 409);
});
test('provider failure releases the claim and allows a safe retry, then replay is rejected', async () => {
  const f = fixture(); const state = await f.start(); let first = true;
  f.dependencies.signupService.exchangeAndVerify = async input => { f.calls.push(['exchange', input]); if (first) { first = false; throw Object.assign(new Error('temporary network failure'), { code: 'META_CODE_EXCHANGE_FAILED' }); } return { accessToken: 'fixture-token-not-real', metaUserId: '555', businessAccountId: '987', phoneNumberId: '123', displayPhoneNumber: '+923001112222' }; };
  const failed = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), failed); assert.equal(failed.statusCode, 502); assert.equal(f.claims.get(state).processing, false);
  const success = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), success); assert.equal(success.statusCode, 201); assert.equal(f.claims.size, 0);
});
test('install failure releases the claim and does not create a duplicate on retry', async () => {
  const f = fixture(); const state = await f.start(); let first = true;
  f.dependencies.connectionRepository.install = async input => { f.calls.push(['install', input]); if (first) { first = false; throw new Error('temporary database failure'); } return { connection: { id: 'connection-a', status: 'connecting' }, number: { id: 'number-a', phone: input.phone } }; };
  const failed = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), failed); assert.equal(failed.statusCode, 503); assert.equal(f.claims.get(state).processing, false);
  const success = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), success); assert.equal(success.statusCode, 201); assert.equal(f.calls.filter(([name]) => name === 'install').length, 2);
});
test('concurrent completions claim once and install once', async () => {
  const f = fixture(); const state = await f.start(); const a = response(); const b = response();
  await Promise.all([f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), a), f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), b)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]); assert.equal(f.calls.filter(([name]) => name === 'exchange').length, 1); assert.equal(f.calls.filter(([name]) => name === 'install').length, 1);
});
test('authorization is checked after claim and a revoked tenant can retry only after authorization returns', async () => {
  const f = fixture(); const state = await f.start(); f.setAllowed(false); const denied = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), denied); assert.equal(denied.statusCode, 404); assert.equal(f.claims.get(state).processing, false); f.setAllowed(true); const success = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), success); assert.equal(success.statusCode, 201);
});
test('missing display phone releases the claim instead of burning it', async () => {
  const f = fixture(); const state = await f.start(); f.dependencies.signupService.exchangeAndVerify = async () => ({}); const failed = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), failed); assert.equal(failed.statusCode, 422); assert.equal(f.claims.get(state).processing, false);
});
test('invalid, expired, wrong-session, wrong-actor, and unauthenticated requests fail before exchange', async () => {
  for (const mode of ['missing', 'expired', 'wrong-session', 'wrong-actor', 'unauthenticated']) { const f = fixture(); const state = await f.start(); const req = f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }); if (mode === 'missing') delete req.body.state; if (mode === 'expired') f.expire(); if (mode === 'wrong-session') req.sessionID = 'other'; if (mode === 'wrong-actor') req.user.id = 'other'; if (mode === 'unauthenticated') delete req.user; const res = response(); await f.handlers.complete(req, res); assert.equal(res.statusCode, mode === 'unauthenticated' ? 401 : 409); assert.equal(f.calls.length, 0); }
});
test('provider errors are redacted', async () => { const f = fixture(); const state = await f.start(); f.dependencies.signupService.exchangeAndVerify = async () => { throw Object.assign(new Error('password=hidden'), { code: 'UNKNOWN_SECRET' }); }; const res = response(); await f.handlers.complete(f.request({ state, code: 'one-time', businessAccountId: '987', phoneNumberId: '123' }), res); assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.body), /hidden|UNKNOWN_SECRET/); assert.equal(f.claims.get(state).processing, false); });
test('start rejects unauthorized and malformed requests without issuing claims', async () => { const f = fixture(); f.setAllowed(false); const denied = response(); await f.handlers.start(f.request({ workspaceId: 'workspace-a', label: 'Official' }), denied); assert.equal(denied.statusCode, 404); const malformed = response(); await f.handlers.start(f.request(), malformed); assert.equal(malformed.statusCode, 400); assert.equal(f.claims.size, 0); });

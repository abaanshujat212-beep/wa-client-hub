const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaConnectionDiagnosticsService } = require('../src/messaging/metaConnectionDiagnosticsService');
function response(status, payload) { return { ok: status >= 200 && status < 300, status, async json() { return payload; } }; }

test('diagnostics verifies exact phone, webhook, and safe Calling readiness', async () => {
  const saved = []; const requests = [];
  const repository = { async diagnosticsTarget() { return { connectionId: 'c', workspaceId: 'w', wabaId: '987', phoneNumberId: '123', accessToken: 'secret-provider-token' }; }, async recordDiagnostics(input) { saved.push(input); return { id: 'c', status: 'connecting', tokenStatus: input.result.tokenStatus, webhookSubscribed: input.result.webhookSubscribed }; } };
  const service = new MetaConnectionDiagnosticsService({ repository, graphVersion: 'v23.0', fetchImpl: async (url, options) => { requests.push({ url, options }); if (requests.length === 1) return response(200, { id: '123', display_phone_number: '+923001112222', verified_name: 'Example', quality_rating: 'GREEN' }); if (requests.length === 2) return response(200, { data: [{ id: 'app', fields: ['messages', 'calls'] }] }); return response(200, { calling: { enabled: true, inbound_enabled: true } }); } });
  const result = await service.run({ actorId: 'owner', workspaceId: 'w', connectionId: 'c' });
  assert.equal(result.id, 'c');
  assert.equal(result.callingReadiness.provider, 'meta');
  assert.equal(result.callingReadiness.callsWebhookSubscribed, 'ready');
  assert.equal(result.callingReadiness.callingEnabled, 'ready');
  assert.equal(result.callingReadiness.canReceiveCalls, true);
  assert.equal(result.callingReadiness.canBusinessInitiateCall, false);
  assert.ok(result.callingReadiness.blockingReasons.includes('CALL_PERMISSION_NOT_CHECKED'));
  assert.equal(requests[2].url, 'https://graph.facebook.com/v23.0/123/settings');
  assert.equal(requests[0].options.headers.authorization, 'Bearer secret-provider-token');
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-token|accessToken|wabaId|phoneNumberId/);
  assert.equal(saved[0].result.code, 'META_DIAGNOSTICS_OK');
});

test('Calling settings failures remain redacted and do not erase messaging diagnostics', async () => {
  const repository = { async diagnosticsTarget() { return { connectionId: 'c', wabaId: '987', phoneNumberId: '123', accessToken: 'secret-provider-token' }; }, async recordDiagnostics(input) { return { id: 'c', status: 'connecting', code: input.result.code }; } };
  const service = new MetaConnectionDiagnosticsService({ repository, graphVersion: 'v23.0', fetchImpl: async (_url, _options) => { if (this?.unused) return null; return response(200, { id: '123', display_phone_number: '+923001112222' }); } });
  let count = 0;
  service.fetch = async (_url, _options) => { count += 1; if (count === 1) return response(200, { id: '123' }); if (count === 2) return response(200, { data: [{ id: 'app' }] }); return response(403, { error: { message: 'secret-provider-token is not authorized' } }); };
  const result = await service.run({ actorId: 'owner', workspaceId: 'w', connectionId: 'c' });
  assert.equal(result.callingReadiness.canReceiveCalls, false);
  assert.deepEqual(result.callingReadiness.blockingReasons, ['META_DIAGNOSTICS_AUTH_FAILED', 'CALL_PERMISSION_NOT_CHECKED']);
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-token|authorized/);
});

test('base diagnostic provider failures are redacted and persist only fixed state', async () => {
  const saved = []; const repository = { async diagnosticsTarget() { return { connectionId: 'c', wabaId: '987', phoneNumberId: '123', accessToken: 'secret-provider-token' }; }, async recordDiagnostics(input) { saved.push(input); } };
  const service = new MetaConnectionDiagnosticsService({ repository, graphVersion: 'v23.0', fetchImpl: async () => response(401, { error: { message: 'secret-provider-token expired' } }) });
  await assert.rejects(service.run({ actorId: 'owner', workspaceId: 'w', connectionId: 'c' }), error => error.code === 'META_DIAGNOSTICS_AUTH_FAILED' && !error.message.includes('secret'));
  assert.equal(saved[0].result.tokenStatus, 'invalid'); assert.doesNotMatch(JSON.stringify(saved), /secret-provider-token|expired/);
});

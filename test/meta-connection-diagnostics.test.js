const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaConnectionDiagnosticsService } = require('../src/messaging/metaConnectionDiagnosticsService');
function response(status, payload) { return { ok: status >= 200 && status < 300, status, async json() { return payload; } }; }
test('diagnostics verifies exact phone and webhook and returns only safe status', async () => {
  const saved = []; const requests = [];
  const repository = { async diagnosticsTarget() { return { connectionId: 'c', workspaceId: 'w', wabaId: '987', phoneNumberId: '123', accessToken: 'secret-provider-token' }; }, async recordDiagnostics(input) { saved.push(input); return { id: 'c', status: 'connecting', tokenStatus: input.result.tokenStatus, webhookSubscribed: input.result.webhookSubscribed }; } };
  const service = new MetaConnectionDiagnosticsService({ repository, graphVersion: 'v23.0', fetchImpl: async (url, options) => { requests.push({ url, options }); return requests.length === 1 ? response(200, { id: '123', display_phone_number: '+923001112222', verified_name: 'Example', quality_rating: 'GREEN' }) : response(200, { data: [{ id: 'app' }] }); } });
  const result = await service.run({ actorId: 'owner', workspaceId: 'w', connectionId: 'c' });
  assert.deepEqual(result, { id: 'c', status: 'connecting', tokenStatus: 'valid', webhookSubscribed: true });
  assert.equal(requests[0].options.headers.authorization, 'Bearer secret-provider-token');
  assert.doesNotMatch(JSON.stringify(result), /secret-provider-token|accessToken|wabaId|phoneNumberId/);
  assert.equal(saved[0].result.code, 'META_DIAGNOSTICS_OK');
});
test('diagnostic provider failures are redacted and persist only fixed state', async () => {
  const saved = []; const repository = { async diagnosticsTarget() { return { connectionId: 'c', wabaId: '987', phoneNumberId: '123', accessToken: 'secret-provider-token' }; }, async recordDiagnostics(input) { saved.push(input); } };
  const service = new MetaConnectionDiagnosticsService({ repository, graphVersion: 'v23.0', fetchImpl: async () => response(401, { error: { message: 'secret-provider-token expired' } }) });
  await assert.rejects(service.run({ actorId: 'owner', workspaceId: 'w', connectionId: 'c' }), error => error.code === 'META_DIAGNOSTICS_AUTH_FAILED' && !error.message.includes('secret'));
  assert.equal(saved[0].result.tokenStatus, 'invalid'); assert.doesNotMatch(JSON.stringify(saved), /secret-provider-token|expired/);
});

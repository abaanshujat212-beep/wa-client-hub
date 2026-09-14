const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaCallingClient, MetaCallingError, buildCallActionBody } = require('../src/messaging/metaCallingClient');

test('builds an audio WebRTC connect action', () => {
  assert.deepEqual(buildCallActionBody({ action: 'connect', to: '+923001234567', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0' }), {
    messaging_product: 'whatsapp',
    action: 'connect',
    to: '923001234567',
    connection: { webrtc: { sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0' } },
  });
});

test('rejects missing SDP for accept', () => {
  assert.throws(() => buildCallActionBody({ action: 'accept', callId: 'call-1' }), error => error instanceof MetaCallingError && error.code === 'META_SDP_REQUIRED');
});

test('routes a terminate action to the phone-number calls endpoint', async () => {
  const calls = [];
  const client = new MetaCallingClient({ enabled: true, graphClient: { request: async request => { calls.push(request); return { success: true }; } } });
  const result = await client.action({ phoneNumberId: '123456789', accessToken: 'server-token', action: 'terminate', callId: 'call-1' });
  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls[0], { path: ['123456789', 'calls'], accessToken: 'server-token', method: 'POST', body: { messaging_product: 'whatsapp', action: 'terminate', call_id: 'call-1' } });
});

test('keeps Meta Calling disabled by default', async () => {
  const client = new MetaCallingClient({ graphClient: { request: async () => ({}) } });
  await assert.rejects(() => client.action({ phoneNumberId: '123', accessToken: 'server-token', action: 'terminate', callId: 'call-1' }), error => error.code === 'META_CALLING_DISABLED');
});

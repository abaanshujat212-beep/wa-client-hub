const test = require('node:test');
const assert = require('node:assert/strict');
const { CanonicalSendService } = require('../src/messaging/canonicalSendService');

function dispatch() { return { workspaceId: 'w', conversationId: 'c', numberId: 'n', providerConnectionId: 'p', provider: 'whatsapp_cloud', providerStatus: 'active', automationEnabled: true, contactPhone: '+923001112222' }; }
function serviceFixture({ policy = { consented: true, suppressed: false, sessionOpen: true }, reservation = { created: true, attempt: { id: 'a', status: 'reserved' } } } = {}) {
  const calls = [];
  const repository = {
    async resolveConversationDispatch() { return dispatch(); },
    async reserveOutbound(input) { calls.push(['reserve', input]); return reservation; },
    async markDispatching(input) { calls.push(['dispatching', input]); },
    async markProviderAccepted(input) { calls.push(['accepted', input]); },
    async failOutbound(input) { calls.push(['failed', input]); },
    async recordOutbound(input) { calls.push(['record', input]); return { id: 'm', status: 'accepted' }; }
  };
  const adapter = { async sendMedia(input) { calls.push(['send', input]); return { externalMessageId: 'external-media', rawStatus: 'accepted' }; } };
  return { calls, service: new CanonicalSendService({ repository, adapters: { whatsapp_cloud: adapter }, policy: { async evaluateText() { return policy; } } }) };
}

test('canonical media send enforces the session policy and persists exact attachment reference', async () => {
  const { service, calls } = serviceFixture();
  const result = await service.sendMedia({ workspaceIds: ['w'], conversationId: 'c', media: { mediaId: 'media-1', type: 'image', caption: 'Receipt', filename: 'receipt.jpg', sizeBytes: 11, sha256: 'a'.repeat(64) }, idempotencyKey: 'media-1' });
  assert.equal(result.duplicate, false);
  assert.equal(calls.find(call => call[0] === 'send')[1].media.mediaId, 'media-1');
  const recorded = calls.find(call => call[0] === 'record')[1];
  assert.equal(recorded.type, 'image');
  assert.deepEqual(recorded.attachment, { mediaId: 'media-1', type: 'image', filename: 'receipt.jpg', sizeBytes: 11, sha256: 'a'.repeat(64) });
});

test('canonical media send rejects closed sessions before reservation', async () => {
  const { service, calls } = serviceFixture({ policy: { consented: true, suppressed: false, sessionOpen: false } });
  await assert.rejects(service.sendMedia({ workspaceIds: ['w'], conversationId: 'c', media: { mediaId: 'media-1', type: 'image' }, idempotencyKey: 'media-2' }), error => error.code === 'SESSION_TEMPLATE_REQUIRED');
  assert.equal(calls.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { CanonicalTemplateService } = require('../src/messaging/canonicalTemplateService');

const placeholder = value => '{' + '{' + value + '}' + '}';
function dispatch() { return { conversationId: 'c', workspaceId: 'w', numberId: 'n', contactPhone: '+923001112222', automationEnabled: true, providerConnectionId: 'p', provider: 'ycloud', providerStatus: 'active' }; }
function approved() { return { id: 't', status: 'APPROVED', parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: `Hello ${placeholder(1)}` }] }; }
function createService({ reservation, sendTemplate = async () => ({ externalMessageId: 'ext', rawStatus: 'queued' }), recordOutbound = async () => ({ id: 'm', external_message_id: 'ext' }) }) {
  let dispatchCount = 0;
  const repository = { resolveConversationDispatch: async () => dispatch(), reserveOutbound: async () => reservation, markDispatching: async () => {}, markProviderAccepted: async () => {}, recordOutbound, failOutbound: async () => {} };
  const service = new CanonicalTemplateService({ repository, catalog: { resolveApproved: async () => approved() }, policy: { evaluateText: async () => ({ consented: true, suppressed: false, sessionOpen: false }) }, adapters: new Map([['ycloud', { sendTemplate: async input => { dispatchCount += 1; return sendTemplate(input); } }]]) });
  return { service, getDispatchCount: () => dispatchCount };
}

test('template validation occurs before reservation and provider dispatch', async () => {
  let reserved = false;
  let sent = false;
  const service = new CanonicalTemplateService({ repository: { resolveConversationDispatch: async () => dispatch(), reserveOutbound: async () => { reserved = true; } }, catalog: { resolveApproved: async () => approved() }, policy: { evaluateText: async () => ({ consented: true, suppressed: false, sessionOpen: false }) }, adapters: new Map([['ycloud', { sendTemplate: async () => { sent = true; } }]]) });
  await assert.rejects(() => service.sendTemplate({ workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en', parameters: [] }, idempotencyKey: 'k' }), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
  assert.equal(reserved, false);
  assert.equal(sent, false);
});

test('approved templates may send outside session through exact provider', async () => {
  const { service, getDispatchCount } = createService({ reservation: { created: true, attempt: { id: 'a' } } });
  const result = await service.sendTemplate({ actorId: 'system', workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en', parameters: ['Ada'] }, idempotencyKey: 'k', origin: 'campaign' });
  assert.equal(result.duplicate, false);
  assert.equal(getDispatchCount(), 1);
});

test('successful duplicate replay never redispatches', async () => {
  const { service, getDispatchCount } = createService({ reservation: { created: false, attempt: {} } });
  service.repository.reserveOutbound = async ({ requestHash }) => ({ created: false, attempt: { id: 'a', request_hash: requestHash, status: 'accepted', message_id: 'm', external_message_id: 'ext' } });
  const result = await service.sendTemplate({ workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en', parameters: ['Ada'] }, idempotencyKey: 'k' });
  assert.equal(result.duplicate, true);
  assert.equal(result.message.id, 'm');
  assert.equal(getDispatchCount(), 0);
});

test('prior failed attempt surfaces terminal idempotent failure without redispatch', async () => {
  const { service, getDispatchCount } = createService({ reservation: { created: false, attempt: {} } });
  service.repository.reserveOutbound = async ({ requestHash }) => ({ created: false, attempt: { id: 'a', request_hash: requestHash, status: 'failed' } });
  await assert.rejects(() => service.sendTemplate({ workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en', parameters: ['Ada'] }, idempotencyKey: 'k' }), error => error.code === 'IDEMPOTENT_SEND_FAILED');
  assert.equal(getDispatchCount(), 0);
});

test('provider-accepted attempt recovers persistence without redispatch', async () => {
  let recorded = 0;
  const { service, getDispatchCount } = createService({ reservation: { created: false, attempt: {} }, recordOutbound: async input => { recorded += 1; assert.equal(input.externalMessageId, 'ext'); return { id: 'm', external_message_id: 'ext' }; } });
  service.repository.reserveOutbound = async ({ requestHash }) => ({ created: false, attempt: { id: 'a', request_hash: requestHash, status: 'provider_accepted', external_message_id: 'ext', raw_provider_status: 'queued', message_id: null } });
  const result = await service.sendTemplate({ workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en', parameters: ['Ada'] }, idempotencyKey: 'k' });
  assert.equal(result.recovered, true);
  assert.equal(recorded, 1);
  assert.equal(getDispatchCount(), 0);
});

test('template dispatch blocks suppression and missing consent before catalog lookup', async () => {
  for (const policy of [{ consented: true, suppressed: true }, { consented: false, suppressed: false }]) {
    let catalog = false;
    const service = new CanonicalTemplateService({ repository: { resolveConversationDispatch: async () => dispatch() }, catalog: { resolveApproved: async () => { catalog = true; } }, policy: { evaluateText: async () => policy }, adapters: new Map([['ycloud', { sendTemplate: async () => {} }]]) });
    await assert.rejects(() => service.sendTemplate({ workspaceIds: ['w'], conversationId: 'c', template: { name: 'hello_world', language: 'en' }, idempotencyKey: 'k' }), error => ['CONTACT_SUPPRESSED', 'CONSENT_REQUIRED'].includes(error.code));
    assert.equal(catalog, false);
  }
});

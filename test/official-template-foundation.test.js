const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTemplate, validateApprovedTemplate, TemplateCatalog } = require('../src/messaging/templateCatalog');
const { MetaCloudApiAdapter } = require('../src/messaging/metaCloudApiAdapter');
const { YCloudMessagingAdapter } = require('../src/messaging/ycloudMessagingAdapter');

const placeholder = value => '{' + '{' + value + '}' + '}';
const positional = { parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: `Hello ${placeholder(1)}, order ${placeholder(2)}` }] };
const named = { parameter_format: 'NAMED', components: [{ type: 'BODY', text: `Hello ${placeholder('customer_name')}, order ${placeholder('order_id')}` }] };

test('template normalization rejects malformed, null, and missing-text parameters', () => {
  assert.deepEqual(normalizeTemplate({ name: 'order_update', language: 'en_US', parameters: ['Ada', { text: '42', parameterName: 'order_id' }] }), { name: 'order_update', language: 'en_US', components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }, { type: 'text', text: '42', parameter_name: 'order_id' }] }] });
  for (const parameters of [[null], [{}], [{ parameterName: 'name' }], [{ text: null }], { text: 'not-an-array' }]) {
    assert.throws(() => normalizeTemplate({ name: 'order_update', language: 'en', parameters }), error => error.code === 'TEMPLATE_PARAMETERS_INVALID');
  }
  assert.throws(() => normalizeTemplate({ name: 'Bad Name', language: 'en' }), error => error.code === 'TEMPLATE_INVALID');
});

test('approved component count and positional format are exact', () => {
  assert.doesNotThrow(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: ['Ada', '42'] }), positional));
  assert.throws(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: ['Ada'] }), positional), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
  assert.throws(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: ['Ada', '42', 'extra'] }), positional), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
  assert.throws(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: [{ text: 'Ada', parameterName: 'customer_name' }, '42'] }), positional), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
});

test('approved named parameters require exact names and order', () => {
  const valid = [{ text: 'Ada', parameterName: 'customer_name' }, { text: '42', parameterName: 'order_id' }];
  assert.doesNotThrow(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: valid }), named));
  const wrongOrder = [{ text: '42', parameterName: 'order_id' }, { text: 'Ada', parameterName: 'customer_name' }];
  assert.throws(() => validateApprovedTemplate(normalizeTemplate({ name: 'order_update', language: 'en', parameters: wrongOrder }), named), error => error.code === 'TEMPLATE_PARAMETERS_MISMATCH');
});

test('catalog lookup binds approved template to exact workspace connection and number', async () => {
  let params;
  const catalog = new TemplateCatalog({ async query(_sql, values) { params = values; return { rowCount: 1, rows: [{ id: 't' }] }; } });
  assert.deepEqual(await catalog.resolveApproved({ workspaceId: 'w', providerConnectionId: 'p', numberId: 'n', name: 'hello', language: 'en' }), { id: 't' });
  assert.deepEqual(params, ['w', 'p', 'n', 'hello', 'en']);
});

test('Meta and YCloud emit equivalent official template payloads', async () => {
  let metaBody;
  let yBody;
  const template = { name: 'hello_world', language: 'en', parameters: ['Ada'] };
  const meta = new MetaCloudApiAdapter({ credentialResolver: { async resolveMeta() { return { accessToken: 'token', phoneNumberId: '123' }; } }, graphClient: { async request(input) { metaBody = input.body; return { messages: [{ id: 'm' }] }; } } });
  await meta.sendTemplate({ connection: { provider: 'whatsapp_cloud', workspaceId: 'w', providerConnectionId: 'p', externalSessionId: '123' }, to: '+923001112222', template });
  const ycloud = new YCloudMessagingAdapter({ enabled: true, credentialResolver: { async resolveYCloud() { return { apiKey: 'fixture-api-key-not-production', numberId: 'n', businessPhone: '+923009990000' }; } }, httpClient: { async request(input) { yBody = input.body; return { id: 'y' }; } } });
  await ycloud.sendTemplate({ connection: { provider: 'ycloud', workspaceId: 'w', providerConnectionId: 'p', numberId: 'n' }, to: '+923001112222', template, idempotencyKey: 'k' });
  assert.equal(metaBody.type, 'template');
  assert.equal(yBody.type, 'template');
  assert.deepEqual(metaBody.template, yBody.template);
  assert.equal(yBody.externalId, 'k');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { MetaGraphClient, validQuery } = require('../src/messaging/metaGraphClient');
const { MetaTemplateSyncService, normalizeRemoteTemplate } = require('../src/messaging/metaTemplateSyncService');

function response(payload) { return { ok: true, status: 200, async json() { return payload; } }; }
const remote = (patch = {}) => ({ id: '123', name: 'order_update', language: 'en_US', status: 'APPROVED', category: 'UTILITY', parameter_format: 'POSITIONAL', components: [{ type: 'BODY', text: 'Hello' }], ...patch });

test('Graph query values are encoded and unsafe query shapes fail before fetch', async () => {
  let url;
  const client = new MetaGraphClient({ graphVersion: 'v99.0', maxRetries: 0, fetchImpl: async value => { url = value; return response({ data: [] }); } });
  await client.request({ path: ['123', 'message_templates'], accessToken: 'server-token', query: { fields: 'id,name', limit: 100, after: 'a+b/c=' } });
  assert.equal(url, 'https://graph.facebook.com/v99.0/123/message_templates?fields=id%2Cname&limit=100&after=a%2Bb%2Fc%3D');
  assert.throws(() => validQuery({ '../token': 'x' }), /query/);
  assert.throws(() => validQuery({ fields: { secret: true } }), /query/);
});

test('template sync paginates by opaque cursor and replaces one exact catalog', async () => {
  const calls = [];
  let replaced;
  const repository = {
    async target(scope) { assert.deepEqual(scope, { actorId: 'u', workspaceId: 'w', connectionId: 'p' }); return { wabaId: '123', accessToken: 'secret' }; },
    async replace(scope, templates) { replaced = { scope, templates }; return templates; }
  };
  const graphClient = { async request(input) { calls.push(input); return calls.length === 1 ? { data: [remote()], paging: { next: 'untrusted-url', cursors: { after: 'cursor-1' } } } : { data: [remote({ id: '124', name: 'receipt_ready', language: 'en' })] }; } };
  const result = await new MetaTemplateSyncService({ repository, graphClient }).sync({ actorId: 'u', workspaceId: 'w', connectionId: 'p' });
  assert.equal(result.count, 2);
  assert.equal(calls[1].query.after, 'cursor-1');
  assert.equal(calls[1].accessToken, 'secret');
  assert.equal(replaced.templates[0].parameterFormat, 'POSITIONAL');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('invalid or duplicate provider templates fail closed without persistence', async () => {
  let writes = 0;
  const repository = { async target() { return { wabaId: '123', accessToken: 'secret' }; }, async replace() { writes += 1; } };
  for (const data of [[remote({ status: 'UNKNOWN' })], [remote(), remote({ id: 'duplicate' })], [{ ...remote(), components: null }]]) {
    const service = new MetaTemplateSyncService({ repository, graphClient: { async request() { return { data }; } } });
    await assert.rejects(service.sync({ actorId: 'u', workspaceId: 'w', connectionId: 'p' }), error => error.code === 'META_TEMPLATE_PAYLOAD_INVALID');
  }
  assert.equal(writes, 0);
});

test('remote template normalization retains only bounded catalog fields', () => {
  assert.deepEqual(normalizeRemoteTemplate(remote({ ignored_secret: 'do-not-store' })), { officialTemplateId: '123', name: 'order_update', language: 'en_US', status: 'APPROVED', category: 'UTILITY', parameterFormat: 'POSITIONAL', components: [{ type: 'BODY', text: 'Hello' }] });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { validId, validScope, mapError } = require('../src/messaging/metaTemplateSyncRoutes');

test('template sync route accepts only exact bounded identifiers', () => {
  assert.equal(validId('workspace-1'), true);
  assert.equal(validId(''), false);
  assert.equal(validId('../workspace'), false);
  assert.equal(validId('x'.repeat(257)), false);
  assert.equal(validScope({ workspaceId: 'workspace-1', numberId: 'number-1' }), true);
  assert.equal(validScope({ workspaceId: 'workspace-1', numberId: 'number-1', extra: 'nope' }), false);
  assert.equal(validScope({ workspaceId: 'workspace-1' }), false);
});

test('template sync errors are mapped without exposing provider details', () => {
  assert.deepEqual(mapError({ code: 'META_TEMPLATE_PAYLOAD_INVALID' }), { status: 502, body: { error: 'Meta returned an invalid template catalog', code: 'META_TEMPLATE_SYNC_INVALID' } });
  assert.deepEqual(mapError({ code: 'META_HTTP_500', message: 'secret provider response' }), { status: 503, body: { error: 'Meta template synchronization is temporarily unavailable', code: 'META_TEMPLATE_SYNC_UNAVAILABLE' } });
  assert.equal(JSON.stringify(mapError({ code: 'META_HTTP_500', message: 'server-token' })).includes('server-token'), false);
});

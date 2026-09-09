const test = require('node:test');
const assert = require('node:assert/strict');
const { validScope, lifecycleError } = require('../src/messaging/metaConnectionRoutes');
test('lifecycle route bodies accept one explicit workspace only', () => {
  assert.equal(validScope({ workspaceId: 'workspace-a' }), true);
  for (const value of [null, [], {}, { workspaceId: '' }, { workspaceId: 'w', actorId: 'admin' }]) assert.equal(validScope(value), false);
});
test('lifecycle errors expose fixed safe messages only', () => {
  assert.deepEqual(lifecycleError(Object.assign(new Error('provider token=secret'), { code: 'META_ACTIVATION_NOT_READY' })), { status: 409, body: { error: 'Meta connection is not ready for activation', code: 'META_ACTIVATION_NOT_READY' } });
  assert.doesNotMatch(JSON.stringify(lifecycleError(new Error('provider token=secret'))), /provider|token=secret/);
});

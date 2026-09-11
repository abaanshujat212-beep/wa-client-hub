const test = require('node:test');
const assert = require('node:assert/strict');
const { exactScope, validUpload, mapError } = require('../src/messaging/metaMediaRoutes');

test('Meta media routes require exact workspace and number scope', () => {
  assert.equal(exactScope({ workspaceId: 'workspace-1', numberId: 'number-1' }), true);
  assert.equal(exactScope({ workspaceId: 'workspace-1', numberId: 'number-1', extra: 'nope' }), false);
  assert.equal(exactScope({ workspaceId: '../workspace', numberId: 'number-1' }), false);
});

test('Meta media upload validation is bounded and rejects unexpected fields', () => {
  const valid = { workspaceId: 'workspace-1', numberId: 'number-1', mimeType: 'image/png', filename: 'photo.png', data: 'YQ==' };
  assert.equal(validUpload(valid), true);
  assert.equal(validUpload({ ...valid, extra: 'nope' }), false);
  assert.equal(validUpload({ ...valid, data: 42 }), false);
});

test('Meta media errors do not expose provider details', () => {
  assert.deepEqual(mapError({ code: 'META_HTTP_500', message: 'server token' }), { status: 503, body: { error: 'Meta media service is temporarily unavailable', code: 'META_MEDIA_UNAVAILABLE' } });
  assert.equal(JSON.stringify(mapError({ code: 'META_HTTP_500', message: 'server token' })).includes('server token'), false);
});

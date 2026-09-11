const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { exactScope, validUpload, validMultipartUpload, mapError, multipartPartLimit, createMetaMediaRouter } = require('../src/messaging/metaMediaRoutes');

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

test('Meta media multipart validation accepts bytes but not encoded or extra fields', () => {
  const valid = { workspaceId: 'workspace-1', numberId: 'number-1', mimeType: 'image/png', filename: 'photo.png', bytes: Buffer.from('a') };
  assert.equal(validMultipartUpload(valid), true);
  assert.equal(validMultipartUpload({ ...valid, bytes: 'YQ==' }), false);
  assert.equal(validMultipartUpload({ ...valid, extra: true }), false);
});

test('Meta media multipart limits follow the allowlisted media types', () => {
  assert.equal(multipartPartLimit({ contentType: 'image/png' }), 5 * 1024 * 1024);
  assert.equal(multipartPartLimit({ contentType: 'audio/mpeg' }), 16 * 1024 * 1024);
  assert.equal(multipartPartLimit({ contentType: 'application/pdf' }), 100 * 1024 * 1024);
  assert.equal(multipartPartLimit({ contentType: 'application/x-unknown' }), 100 * 1024 * 1024);
});

test('Meta media errors do not expose provider details', () => {
  assert.deepEqual(mapError({ code: 'META_HTTP_500', message: 'server token' }), { status: 503, body: { error: 'Meta media service is temporarily unavailable', code: 'META_MEDIA_UNAVAILABLE' } });
  assert.deepEqual(mapError({ code: 'META_MEDIA_MULTIPART_TOO_LARGE' }), { status: 413, body: { error: 'Meta media request is too large', code: 'META_MEDIA_REQUEST_TOO_LARGE' } });
  assert.equal(JSON.stringify(mapError({ code: 'META_HTTP_500', message: 'server token' })).includes('server token'), false);
});

test('Meta media content route returns bytes without exposing the temporary provider URL', async () => {
  const express = require('express'); const app = express();
  app.use((_req, _res, next) => { _req.session = { userId: 'user-1' }; _req.sessionID = 'session-1'; next(); });
  app.use('/api/meta/connections/:connectionId/media', createMetaMediaRouter({ enabled: true, origin: 'https://app.test', pool: { async query() { return { rows: [{ id: 'user-1' }] }; } }, repository: { async target() { return { accessToken: 'server-token', phoneNumberId: 'phone-1' }; } }, service: { async upload() {}, async retrieve() { return { mediaId: 'media-1', mimeType: 'image/jpeg', mediaType: 'image', sizeBytes: 3, sha256: 'a'.repeat(64), url: 'https://lookaside.fbsbx.com/temporary' }; }, async download() { return { contentType: 'image/jpeg', bytes: Buffer.from([1, 2, 3]) }; }, async remove() {} } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    let response = await fetch(`http://127.0.0.1:${server.address().port}/api/meta/connections/connection-1/media/media-1/content?workspaceId=workspace-1&numberId=number-1`);
    assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/jpeg'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([1, 2, 3]));
    response = await fetch(`http://127.0.0.1:${server.address().port}/api/meta/connections/connection-1/media/media-1?workspaceId=workspace-1&numberId=number-1`);
    assert.equal(response.status, 200); const body = await response.json(); assert.equal('url' in body, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

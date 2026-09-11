const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MetaMediaService, MetaMediaError, normalizeUpload, providerUrl } = require('../src/messaging/metaMediaService');

const data = Buffer.from('hello-media').toString('base64');

test('Meta media upload validates bounds and sends a multipart server-side payload', async () => {
  const calls = [];
  const service = new MetaMediaService({ graphClient: { async request(input) { calls.push(input); return { id: 'media-123' }; } } });
  const result = await service.upload({ accessToken: 'server-token', phoneNumberId: 'phone-123', mimeType: 'image/jpeg', filename: 'photo.jpg', data });
  assert.equal(result.mediaId, 'media-123');
  assert.equal(calls[0].path.join('/'), 'phone-123/media');
  assert.equal(calls[0].accessToken, 'server-token');
  assert.equal(calls[0].formData.get('messaging_product'), 'whatsapp');
  assert.equal(calls[0].formData.get('type'), 'image/jpeg');
  assert.equal(calls[0].formData.get('file').name, 'photo.jpg');
});

test('Meta media upload accepts bounded binary bytes without base64 amplification', async () => {
  const calls = [];
  const bytes = Buffer.from([0, 1, 2, 255]);
  const service = new MetaMediaService({ graphClient: { async request(input) { calls.push(input); return { id: 'media-binary' }; } } });
  const result = await service.upload({ accessToken: 'server-token', phoneNumberId: 'phone-123', mimeType: 'image/png', filename: 'photo.png', bytes });
  assert.equal(result.mediaId, 'media-binary');
  assert.equal(result.sizeBytes, bytes.length);
  assert.equal(result.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(calls[0].formData.get('file').size, bytes.length);
});

test('Meta media retrieve validates provider metadata and CDN URL', async () => {
  const service = new MetaMediaService({ graphClient: { async request() { return { id: 'media-123', mime_type: 'image/jpeg', file_size: 11, sha256: 'a'.repeat(64), url: 'https://lookaside.fbsbx.com/media/temporary' }; } } });
  const result = await service.retrieve({ accessToken: 'server-token', mediaId: 'media-123' });
  assert.deepEqual(result, { mediaId: 'media-123', mimeType: 'image/jpeg', mediaType: 'image', sizeBytes: 11, sha256: 'a'.repeat(64), url: 'https://lookaside.fbsbx.com/media/temporary' });
});

test('Meta media delete and malformed metadata fail closed', async () => {
  let deleted;
  const service = new MetaMediaService({ graphClient: { async request(input) { deleted = input; return { success: true }; } } });
  assert.deepEqual(await service.remove({ accessToken: 'server-token', mediaId: 'media-123' }), { mediaId: 'media-123', deleted: true });
  assert.equal(deleted.method, 'DELETE');
  assert.throws(() => normalizeUpload({ phoneNumberId: '../escape', mimeType: 'image/jpeg', filename: 'x.jpg', data }), error => error instanceof MetaMediaError && error.code === 'META_MEDIA_NUMBER_INVALID');
  assert.throws(() => providerUrl('https://127.0.0.1/internal'), error => error.code === 'META_MEDIA_RESPONSE_INVALID');
  const invalid = new MetaMediaService({ graphClient: { async request() { return { id: 'media-123', mime_type: 'image/jpeg', file_size: 11, sha256: 'bad', url: 'https://lookaside.fbsbx.com/media/temporary' }; } } });
  await assert.rejects(invalid.retrieve({ accessToken: 'server-token', mediaId: 'media-123' }), error => error.code === 'META_MEDIA_RESPONSE_INVALID');
});

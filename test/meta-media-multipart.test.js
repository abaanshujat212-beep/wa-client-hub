const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const { MetaMediaMultipartError, boundaryFromContentType, parseMetaMediaMultipart } = require('../src/messaging/metaMediaMultipart');

function multipart(boundary, body) {
  return `--${boundary}\r\n${body}\r\n--${boundary}--\r\n`;
}

function field(name, value) {
  return `Content-Disposition: form-data; name="${name}"\r\n\r\n${value}`;
}

function file(name, filename, content, contentType = 'application/octet-stream') {
  return `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n${content}`;
}

test('multipart parser handles fields, binary file data, and chunk-split boundaries', async () => {
  const boundary = '----meta-test-boundary';
  const data = Buffer.from([0, 1, 2, 255, 10, 13]);
  const encoded = Buffer.concat([
    Buffer.from(`--${boundary}\r\n${field('workspaceId', 'workspace-1')}\r\n--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="upload"; filename="photo.bin"\r\nContent-Type: image/png\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const chunks = Array.from({ length: encoded.length }, (_, index) => encoded.subarray(index, index + 1));
  const result = await parseMetaMediaMultipart(Readable.from(chunks), `multipart/form-data; boundary="${boundary}"`);
  assert.deepEqual(result.fields, { workspaceId: 'workspace-1' });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'upload');
  assert.equal(result.files[0].filename, 'photo.bin');
  assert.equal(result.files[0].contentType, 'image/png');
  assert.deepEqual(result.files[0].data, data);
  assert.equal(result.files[0].sha256, createHash('sha256').update(data).digest('hex'));
});

test('multipart parser preserves repeated fields and rejects a part over its byte limit', async () => {
  const boundary = 'meta-limit';
  const body = multipart(boundary, `${field('tag', 'one')}\r\n--${boundary}\r\n${field('tag', 'two')}`);
  const result = await parseMetaMediaMultipart(Readable.from([body]), `multipart/form-data; boundary=${boundary}`);
  assert.deepEqual(result.fields.tag, ['one', 'two']);
  await assert.rejects(parseMetaMediaMultipart(Readable.from([multipart(boundary, file('upload', 'x.bin', '12345'))]), `multipart/form-data; boundary=${boundary}`, { maxPartBytes: 4 }), error => error instanceof MetaMediaMultipartError && error.code === 'META_MEDIA_MULTIPART_PART_TOO_LARGE');
});

test('multipart parser enforces total bytes and fails closed on truncation', async () => {
  const boundary = 'meta-total';
  await assert.rejects(parseMetaMediaMultipart(Readable.from([multipart(boundary, field('x', '123456'))]), `multipart/form-data; boundary=${boundary}`, { maxBytes: 10 }), error => error.code === 'META_MEDIA_MULTIPART_TOO_LARGE');
  await assert.rejects(parseMetaMediaMultipart(Readable.from([`--${boundary}\r\n${field('x', 'value')}\r\n--${boundary}`]), `multipart/form-data; boundary=${boundary}`), error => error.code === 'META_MEDIA_MULTIPART_TRUNCATED');
});

test('multipart parser validates content type and boundary', () => {
  assert.equal(boundaryFromContentType('multipart/form-data; boundary="abc"'), 'abc');
  assert.throws(() => boundaryFromContentType('application/json'), error => error.code === 'META_MEDIA_MULTIPART_TYPE_INVALID');
  assert.throws(() => boundaryFromContentType('multipart/form-data'), error => error.code === 'META_MEDIA_MULTIPART_BOUNDARY_INVALID');
});

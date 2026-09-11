const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createMetaMediaRouter } = require('../src/messaging/metaMediaRoutes');

function multipartBody(boundary, fields, file) {
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`));
  chunks.push(file.bytes);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function fixture() {
  const express = require('express');
  const app = express();
  const calls = { targets: [], uploads: [] };
  app.use((req, _res, next) => {
    req.session = { userId: 'user-1', csrfToken: 'csrf-1' };
    req.sessionID = 'session-1';
    next();
  });
  app.use('/api/meta/connections/:connectionId/media', createMetaMediaRouter({
    enabled: true,
    origin: 'https://app.test',
    pool: { async query() { return { rows: [{ id: 'user-1' }] }; } },
    repository: { async target(input) { calls.targets.push(input); return { accessToken: 'server-token', phoneNumberId: 'phone-1' }; } },
    service: {
      async upload(input) { calls.uploads.push(input); return { mediaId: 'media-1', sizeBytes: input.bytes?.length || 0 }; },
      async retrieve() { return { mediaId: 'media-1', mimeType: 'image/png', mediaType: 'image', sizeBytes: 3, sha256: 'a'.repeat(64), url: 'https://lookaside.fbsbx.com/temporary' }; },
      async download() { return { contentType: 'image/png', bytes: Buffer.from([0, 1, 2]) }; },
      async remove() { return { mediaId: 'media-1', deleted: true }; },
    },
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { app, calls, url: `http://127.0.0.1:${server.address().port}/api/meta/connections/connection-1/media`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('authenticated multipart upload preserves exact scope and binary bytes', async () => {
  const f = await fixture();
  try {
    const boundary = '----meta-test-boundary';
    const bytes = Buffer.from([0, 1, 2, 255]);
    const response = await fetch(f.url, {
      method: 'POST',
      headers: { origin: 'https://app.test', 'x-csrf-token': 'csrf-1', 'content-type': `multipart/form-data; boundary=${boundary}` },
      body: multipartBody(boundary, { workspaceId: 'workspace-1', numberId: 'number-1' }, { filename: 'photo.png', contentType: 'image/png', bytes }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(f.calls.targets, [{ actorId: 'user-1', workspaceId: 'workspace-1', connectionId: 'connection-1', numberId: 'number-1' }]);
    assert.deepEqual(f.calls.uploads[0].bytes, bytes);
    assert.equal(f.calls.uploads[0].accessToken, 'server-token');
    assert.equal(f.calls.uploads[0].phoneNumberId, 'phone-1');
  } finally { await f.close(); }
});

test('authenticated media writes fail closed for a foreign origin before provider access', async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.url, {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'x-csrf-token': 'csrf-1', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'workspace-1', numberId: 'number-1', mimeType: 'image/png', filename: 'photo.png', data: 'YQ==' }),
    });
    assert.equal(response.status, 403);
    assert.equal(f.calls.targets.length, 0);
    assert.equal(f.calls.uploads.length, 0);
  } finally { await f.close(); }
});

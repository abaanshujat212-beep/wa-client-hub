const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseSignedRequest, validMetaUserId } = require('../src/messaging/metaLifecycleRoutes');
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${signature}.${body}`;
}
test('Meta signed requests verify with the configured app secret', () => {
  const secret = 'fixture-meta-app-secret-not-real';
  const signed = sign({ algorithm: 'HMAC-SHA256', user_id: '123456789' }, secret);
  assert.deepEqual(parseSignedRequest(signed, secret), { algorithm: 'HMAC-SHA256', user_id: '123456789' });
  assert.throws(() => parseSignedRequest(signed, 'wrong-meta-app-secret-not-real'), /Invalid signed request/);
  assert.throws(() => parseSignedRequest(`${signed}x`, secret), /Invalid signed request/);
});
test('Meta lifecycle identifiers are strictly scoped to numeric app-scoped IDs', () => {
  assert.equal(validMetaUserId('123'), true);
  assert.equal(validMetaUserId(''), false);
  assert.equal(validMetaUserId('123/other'), false);
  assert.equal(validMetaUserId('1'.repeat(129)), false);
});

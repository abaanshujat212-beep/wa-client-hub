const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMetaSignupConfig, parseInterval, parseMediaCleanupInterval, parseMediaCleanupBatch, enabled } = require('../src/messaging/metaSignupRuntime');
const postgres = { driver: 'postgres', repository: { pool: { query() {} } } };
const valid = { META_SIGNUP_ENABLED: 'true', APP_ORIGIN: 'https://hub.example.test', META_GRAPH_VERSION: 'v23.0', META_APP_ID: '123456789', META_APP_SECRET: 'x'.repeat(20), CONNECTOR_MASTER_KEY: Buffer.alloc(32).toString('base64') };
test('signup is enabled by one exact explicit value only', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', true]) assert.equal(enabled({ META_SIGNUP_ENABLED: value }), false);
  assert.equal(enabled(valid), true); assert.deepEqual(validateMetaSignupConfig({}, {}), { enabled: false });
});
test('enabled config requires Postgres, exact HTTPS origin and complete Meta values', () => {
  assert.deepEqual(validateMetaSignupConfig(valid, postgres), { enabled: true, origin: valid.APP_ORIGIN, interval: 300000, mediaCleanupInterval: 3600000, mediaCleanupBatch: 100 });
  for (const patch of [{ APP_ORIGIN: 'http://hub.example.test' }, { APP_ORIGIN: 'https://hub.example.test/' }, { META_GRAPH_VERSION: '' }, { META_GRAPH_VERSION: 'latest' }, { META_APP_ID: 'app-id' }, { META_APP_SECRET: 'short' }, { META_SIGNUP_CLEANUP_INTERVAL_MS: '5000' }, { META_MEDIA_CLEANUP_INTERVAL_MS: '299999' }, { META_MEDIA_CLEANUP_BATCH_SIZE: '101' }]) assert.throws(() => validateMetaSignupConfig({ ...valid, ...patch }, postgres), /Meta signup configuration error/);
  assert.throws(() => validateMetaSignupConfig(valid, { driver: 'json' }), /PostgreSQL/);
});
test('cleanup intervals and batches are finite and bounded', () => {
  assert.equal(parseInterval(), 300000); assert.equal(parseInterval('60000'), 60000); assert.equal(parseInterval('3600000'), 3600000);
  assert.equal(parseMediaCleanupInterval(), 3600000); assert.equal(parseMediaCleanupInterval('300000'), 300000); assert.equal(parseMediaCleanupInterval('86400000'), 86400000);
  assert.equal(parseMediaCleanupBatch(), 100); assert.equal(parseMediaCleanupBatch('1'), 1); assert.equal(parseMediaCleanupBatch('100'), 100);
  for (const value of ['0', '59999', '3600001', '1.5', 'abc', -1]) assert.throws(() => parseInterval(value));
  for (const value of ['0', '299999', '86400001', '1.5', 'abc', -1]) assert.throws(() => parseMediaCleanupInterval(value));
  for (const value of ['0', '101', '1.5', 'abc', -1]) assert.throws(() => parseMediaCleanupBatch(value));
});
test('disabled runtime does not access store, secrets, timers or provider dependencies', () => {
  const { createMetaSignupRuntime } = require('../src/messaging/metaSignupRuntime');
  const runtime = createMetaSignupRuntime({ env: {}, store: null });
  assert.equal(runtime.enabled, false); assert.deepEqual(runtime.status(), { enabled: false, cleanup: 'disabled', mediaCleanup: 'disabled' });
  runtime.start(); runtime.stop();
});

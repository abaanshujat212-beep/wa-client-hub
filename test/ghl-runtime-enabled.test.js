const test = require('node:test');
const assert = require('node:assert/strict');
const { createGhlPrivatePilotRuntime } = require('../src/providers/ghlPrivatePilot');

test('GHL PostgreSQL runtime explicitly reports enabled', () => {
  const store = { driver: 'postgres', repository: { pool: { query() {} } } };
  const runtime = createGhlPrivatePilotRuntime({
    store,
    env: { CONNECTOR_MASTER_KEY: Buffer.alloc(32, 1).toString('base64') }
  });
  assert.equal(runtime.enabled, true);
});

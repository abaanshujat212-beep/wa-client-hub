const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const connectionString = process.env.TEST_DATABASE_URL;
test('enabled main runtime constructs with real Postgres, runs bounded cleanup and stops idempotently', { skip: !connectionString, timeout: 30000 }, async () => {
  const { Pool } = require('pg');
  const { runMigrations } = require('../src/db/migrate');
  const { createMetaSignupRuntime } = require('../src/messaging/metaSignupRuntime');
  const schema = `runtime_${crypto.randomBytes(8).toString('hex')}`;
  const admin = new Pool({ connectionString }); const pool = new Pool({ connectionString, options: `-c search_path=${schema}` }); const logs = [];
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await runMigrations(pool);
    const runtime = createMetaSignupRuntime({ env: { META_SIGNUP_ENABLED: 'true', APP_ORIGIN: 'https://hub.example.test', META_GRAPH_VERSION: 'v23.0', META_APP_ID: '123456789', META_APP_SECRET: 'fixture-app-secret-not-real', CONNECTOR_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'), CONNECTOR_KEY_ID: 'fixture', META_SIGNUP_CLEANUP_INTERVAL_MS: '60000' }, store: { driver: 'postgres', repository: { pool } }, logger: { info(message, counts) { logs.push({ message, counts }); }, error(message) { logs.push({ message }); } } });
    assert.equal(runtime.enabled, true); assert.equal(typeof runtime.router, 'function');
    await runtime.cleanup(); assert.match(runtime.status().lastSuccessAt, /^\d{4}-/);
    assert.deepEqual(logs[0], { message: 'Meta signup cleanup completed', counts: { states: 0, buckets: 0 } });
    runtime.start(); runtime.start(); runtime.stop(); runtime.stop(); assert.equal(runtime.status().enabled, true);
    assert.doesNotMatch(JSON.stringify(logs), /fixture-app-secret|CONNECTOR_MASTER_KEY/);
    assert.throws(() => createMetaSignupRuntime({ env: { ...process.env, META_SIGNUP_ENABLED: 'true' }, store: { driver: 'json' } }), /configuration error/);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});

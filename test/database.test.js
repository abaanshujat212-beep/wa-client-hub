const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { databaseConfig, assertDatabaseConfig } = require('../src/db/config');
const { checksum } = require('../src/db/migrate');

test('databaseConfig defaults to JSON storage', () => {
  const config = databaseConfig({});
  assert.equal(config.driver, 'json');
  assert.equal(config.connectionString, '');
  assert.equal(config.max, 10);
});

test('assertDatabaseConfig requires a PostgreSQL URL', () => {
  assert.throws(() => assertDatabaseConfig({ driver: 'postgres', connectionString: '' }), /DATABASE_URL/);
  assert.doesNotThrow(() => assertDatabaseConfig({ driver: 'postgres', connectionString: 'postgresql://localhost/test' }));
  assert.throws(() => assertDatabaseConfig({ driver: 'sqlite', connectionString: '' }), /Unsupported/);
});

test('migration checksum is stable SHA-256', () => {
  assert.equal(checksum('SELECT 1;'), crypto.createHash('sha256').update('SELECT 1;').digest('hex'));
});

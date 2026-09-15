const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseConfig, assertDatabaseConfig } = require('../src/db/config');

test('discrete PostgreSQL fields preserve URI-reserved passwords', () => {
  const config = databaseConfig({ STORE_DRIVER: 'postgres', DATABASE_HOST: 'localhost', DATABASE_PORT: '5432', DATABASE_NAME: 'wa_hub', DATABASE_USER: 'wa_hub', DATABASE_PASSWORD: 'p@ss#word?with/slash' });
  assert.equal(config.connectionString, '');
  assert.equal(config.password, 'p@ss#word?with/slash');
  assert.doesNotThrow(() => assertDatabaseConfig(config));
});

test('PostgreSQL configuration rejects incomplete discrete credentials', () => {
  assert.throws(() => assertDatabaseConfig(databaseConfig({ STORE_DRIVER: 'postgres', DATABASE_HOST: 'localhost', DATABASE_NAME: 'wa_hub', DATABASE_USER: 'wa_hub' })), /DATABASE_URL|DATABASE_HOST/);
});

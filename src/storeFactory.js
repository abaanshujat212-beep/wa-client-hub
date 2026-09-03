const Store = require('./store');
const PostgresStore = require('./db/postgresStore');
const { databaseConfig, assertDatabaseConfig } = require('./db/config');

function createStore(rootDir, env = process.env) {
  const config = assertDatabaseConfig(databaseConfig(env));
  if (config.driver === 'postgres') return new PostgresStore(rootDir, config);
  const store = new Store(rootDir);
  store.driver = 'json';
  return store;
}

module.exports = { createStore };

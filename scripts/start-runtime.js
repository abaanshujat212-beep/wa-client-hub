const { Client } = require('pg');
const { createClient } = require('redis');
const { databaseConfig } = require('../src/db/config');

const DEFAULT_RETRY_MS = 2_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkPostgres(env = process.env) {
  const config = databaseConfig(env);
  if (config.driver !== 'postgres') return;
  const client = new Client({
    ...(config.connectionString ? { connectionString: config.connectionString } : {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    }),
    ssl: config.ssl,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkRedis(env = process.env) {
  const url = String(env.REDIS_URL || '').trim();
  if (!url) return;
  const client = createClient({ url, socket: { connectTimeout: 3_000, reconnectStrategy: false } });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.ping();
  } finally {
    if (client.isOpen) await client.quit().catch(() => client.disconnect());
  }
}

async function waitForRuntime({ env = process.env, retryMs = DEFAULT_RETRY_MS, sleep = delay, log = console.log } = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      await checkPostgres(env);
      await checkRedis(env);
      log('Runtime dependencies are ready.');
      return;
    } catch (error) {
      const reason = error?.code || error?.message || 'dependency unavailable';
      log(`Waiting for runtime dependencies (attempt ${attempt}): ${reason}`);
      await sleep(retryMs);
    }
  }
}

async function startRuntime(options) {
  await waitForRuntime(options);
  return require('../src/main').runMain();
}

if (require.main === module) {
  startRuntime().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { checkPostgres, checkRedis, waitForRuntime, startRuntime };

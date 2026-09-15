function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value) !== '') ?? '';
}

function databaseConfig(env = process.env) {
  const host = firstNonEmpty(env.DATABASE_HOST, env.DB_HOST, env.PGHOST);
  const port = Number(firstNonEmpty(env.DATABASE_PORT, env.DB_PORT, env.PGPORT, 5432));
  const database = firstNonEmpty(env.DATABASE_NAME, env.DB_NAME, env.PGDATABASE);
  const user = firstNonEmpty(env.DATABASE_USER, env.DB_USER, env.PGUSER);
  const password = firstNonEmpty(env.DATABASE_PASSWORD, env.DB_PASSWORD, env.PGPASSWORD);
  const discrete = Boolean(host || database || user || password);
  return {
    driver: String(env.STORE_DRIVER || "json").toLowerCase(),
    // Discrete fields deliberately win over DATABASE_URL so URI-reserved passwords are safe.
    connectionString: discrete ? "" : String(env.DATABASE_URL || ""),
    host: host || undefined,
    port: Number.isFinite(port) ? port : 5432,
    database: database || undefined,
    user: user || undefined,
    password: password || undefined,
    ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    max: Math.max(1, Number(env.DATABASE_POOL_MAX || 10))
  };
}

function assertDatabaseConfig(config = databaseConfig()) {
  if (!['json', 'postgres'].includes(config.driver)) throw new Error(`Unsupported STORE_DRIVER: ${config.driver}`);
  const discreteReady = config.host && config.database && config.user && config.password !== undefined;
  if (config.driver === 'postgres' && !config.connectionString && !discreteReady) {
    throw new Error('DATABASE_URL or DATABASE_HOST/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD is required when STORE_DRIVER=postgres');
  }
  return config;
}

module.exports = { databaseConfig, assertDatabaseConfig };

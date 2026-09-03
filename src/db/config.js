function databaseConfig(env = process.env) {
  return {
    driver: String(env.STORE_DRIVER || "json").toLowerCase(),
    connectionString: env.DATABASE_URL || "",
    ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    max: Math.max(1, Number(env.DATABASE_POOL_MAX || 10))
  };
}

function assertDatabaseConfig(config = databaseConfig()) {
  if (!['json', 'postgres'].includes(config.driver)) throw new Error(`Unsupported STORE_DRIVER: ${config.driver}`);
  if (config.driver === 'postgres' && !config.connectionString) throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  return config;
}

module.exports = { databaseConfig, assertDatabaseConfig };

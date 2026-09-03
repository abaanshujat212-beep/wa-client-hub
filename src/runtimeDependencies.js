const { createClient } = require("redis");

function createRuntimeDependencies(env = process.env) {
  const redisUrl = String(env.REDIS_URL || "").trim();
  const redis = redisUrl ? createClient({ url: redisUrl }) : null;
  let redisError = null;

  if (redis) redis.on("error", (error) => { redisError = error; });

  return {
    redis,
    async connect() {
      if (!redis) return;
      await redis.connect();
      await redis.ping();
      redisError = null;
    },
    async readiness(store) {
      const checks = { database: store.driver === "postgres" ? "up" : "not_configured", redis: redis ? "up" : "not_configured" };
      try {
        if (store.driver === "postgres") await store.repository.pool.query("SELECT 1");
      } catch (_error) {
        checks.database = "down";
      }
      try {
        if (redis) await redis.ping();
      } catch (_error) {
        checks.redis = "down";
      }
      return { ok: !Object.values(checks).includes("down"), checks };
    },
    status() {
      return { configured: Boolean(redis), ready: redis ? redis.isReady && !redisError : null };
    },
    async close() {
      if (redis?.isOpen) await redis.quit();
    }
  };
}

module.exports = { createRuntimeDependencies };

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRuntimeDependencies } = require("../src/runtimeDependencies");

test("runtime dependencies allow local operation without Redis", async () => {
  const dependencies = createRuntimeDependencies({});
  const store = { driver: "json" };
  await dependencies.connect();
  assert.deepEqual(await dependencies.readiness(store), {
    ok: true,
    checks: { database: "not_configured", redis: "not_configured" }
  });
  assert.deepEqual(dependencies.status(), { configured: false, ready: null });
  await dependencies.close();
});

test("readiness reports a failed PostgreSQL check", async () => {
  const dependencies = createRuntimeDependencies({});
  const store = {
    driver: "postgres",
    repository: { pool: { query: async () => { throw new Error("offline"); } } }
  };
  assert.deepEqual(await dependencies.readiness(store), {
    ok: false,
    checks: { database: "down", redis: "not_configured" }
  });
});

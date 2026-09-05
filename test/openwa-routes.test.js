const test = require("node:test");
const assert = require("node:assert/strict");
const { createOpenWaRouter, safeSecretEqual, normalizeEnvelope } = require("../src/openwa/routes");

function fixture() {
  return { store: {}, repository: {}, client: {}, webhookSecret: "valid-secret", requireAuth: (_req, _res, next) => next(), requireManage: () => false };
}

test("OpenWA router exposes only the controlled adapter surface", () => {
  const router = createOpenWaRouter(fixture());
  const routes = router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
  assert.deepEqual(routes, ["POST /webhook", "POST /numbers/:numberId/enable", "GET /numbers/:numberId/status", "POST /numbers/:numberId/send", "POST /numbers/:numberId/send-media"]);
});

test("OpenWA webhook secrets fail closed", () => {
  assert.equal(safeSecretEqual("valid-secret", "valid-secret"), true);
  assert.equal(safeSecretEqual("wrong", "valid-secret"), false);
  assert.equal(safeSecretEqual("", ""), false);
});

test("OpenWA v4 events normalize to the canonical v5-shaped envelope", () => {
  assert.deepEqual(normalizeEnvelope({ sessionId: "primary", event: "onMessage", data: { id: "m1", body: "hello" }, ts: 123 }), {
    webhookId: undefined,
    sessionId: "primary",
    event: "message.any",
    payload: { message: { id: "m1", body: "hello" } },
    timestamp: 123
  });
});

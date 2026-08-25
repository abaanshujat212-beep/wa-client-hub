const test = require("node:test");
const assert = require("node:assert/strict");
const { createSwichRouter } = require("../src/billing/swichRoutes");

test("createSwichRouter exports expected routes", () => {
  const router = createSwichRouter({ store: { addAudit(){} } });
  assert.equal(typeof router, "function");
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/token-test"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/checkout"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/inquire/:transactionId"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/webhook"));
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStripeRouter } = require("../src/billing/stripeRoutes");

test("createStripeRouter exports expected routes", () => {
  const router = createStripeRouter({ store: { addAudit(){}, findWorkspace(){}, updateWorkspace(){} } });
  assert.equal(typeof router, "function");
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/token-test"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/checkout"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/webhook"));
});

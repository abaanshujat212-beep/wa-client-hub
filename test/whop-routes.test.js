const test = require("node:test");
const assert = require("node:assert/strict");
const { createWhopRouter } = require("../src/billing/whopRoutes");

test("createWhopRouter exports expected routes", () => {
  const router = createWhopRouter({ store: { addAudit(){}, findWorkspace(){}, updateWorkspace(){} } });
  assert.equal(typeof router, "function");
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/token-test"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/membership/:membershipId"));
  assert.ok(router.stack.some((layer) => layer.route && layer.route.path === "/webhook"));
});

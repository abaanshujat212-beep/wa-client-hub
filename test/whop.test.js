const test = require("node:test");
const assert = require("node:assert/strict");
const { whopConfig, assertWhopConfigured, mapWhopStatus, buildWhopHeaders } = require("../src/billing/whop");

test("whopConfig uses default API base URL", () => {
  const config = whopConfig({});
  assert.equal(config.apiBaseUrl, "https://api.whop.com/api/v2");
});

test("assertWhopConfigured requires API key", () => {
  assert.throws(() => assertWhopConfigured({ apiKey: "" }), /API key/);
  assert.doesNotThrow(() => assertWhopConfigured({ apiKey: "test-key" }));
});

test("mapWhopStatus maps membership statuses", () => {
  assert.equal(mapWhopStatus("active"), "active");
  assert.equal(mapWhopStatus("trialing"), "active");
  assert.equal(mapWhopStatus("incomplete"), "pending");
  assert.equal(mapWhopStatus("payment_failed"), "past_due");
  assert.equal(mapWhopStatus("expired"), "canceled");
  assert.equal(mapWhopStatus("unpaid"), "unpaid");
});

test("buildWhopHeaders returns bearer auth header", () => {
  const headers = buildWhopHeaders({ apiKey: "abc" });
  assert.equal(headers.authorization, "Bearer abc");
  assert.equal(headers["content-type"], "application/json");
});

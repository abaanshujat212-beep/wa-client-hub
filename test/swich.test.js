const test = require("node:test");
const assert = require("node:assert/strict");
const { swichConfig, assertSwichConfigured, mapSwichStatus } = require("../src/billing/swich");

test("swichConfig uses sandbox defaults", () => {
  const config = swichConfig({});
  assert.equal(config.apiBaseUrl, "https://sandbox-api.swichnow.com");
  assert.equal(config.authUrl, "https://sandbox-auth.swichnow.com");
  assert.equal(config.checkoutUrl, "https://sandbox-api.checkout.swichnow.com");
});

test("assertSwichConfigured requires credentials", () => {
  assert.throws(() => assertSwichConfigured({ clientId: "", clientSecret: "" }), /credentials/);
  assert.doesNotThrow(() => assertSwichConfigured({ clientId: "id", clientSecret: "secret" }));
});

test("mapSwichStatus maps payment statuses", () => {
  assert.equal(mapSwichStatus("success"), "active");
  assert.equal(mapSwichStatus("pending"), "pending");
  assert.equal(mapSwichStatus("failed"), "past_due");
  assert.equal(mapSwichStatus("expired"), "canceled");
});

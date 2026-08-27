const test = require("node:test");
const assert = require("node:assert/strict");
const { stripeConfig, assertStripeConfigured, mapStripeStatus, stripePlanLookup } = require("../src/billing/stripe");

test("stripeConfig reads env", () => {
  const cfg = stripeConfig({ STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec" });
  assert.equal(cfg.secretKey, "sk_test");
  assert.equal(cfg.webhookSecret, "whsec");
});

test("assertStripeConfigured requires secret key", () => {
  assert.throws(() => assertStripeConfigured({ secretKey: "" }), /secret key/);
  assert.doesNotThrow(() => assertStripeConfigured({ secretKey: "sk_test" }));
});

test("mapStripeStatus maps subscription statuses", () => {
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("trialing"), "trialing");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("canceled"), "canceled");
  assert.equal(mapStripeStatus("unpaid"), "unpaid");
});

test("stripePlanLookup maps app plans", () => {
  assert.equal(stripePlanLookup("starter"), "wa_starter_monthly");
  assert.equal(stripePlanLookup("team"), "wa_team_monthly");
});

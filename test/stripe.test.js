const test = require("node:test");
const assert = require("node:assert/strict");
const { stripeConfig, assertStripeConfigured, assertStripeWebhookConfigured, mapStripeStatus, stripePlanLookup, findStripePrice, stripeObjectId } = require("../src/billing/stripe");

test("stripeConfig reads env", () => {
  const cfg = stripeConfig({ STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec" });
  assert.equal(cfg.secretKey, "sk_test");
  assert.equal(cfg.webhookSecret, "whsec");
});

test("assertStripeConfigured requires secret key", () => {
  assert.throws(() => assertStripeConfigured({ secretKey: "" }), /secret key/);
  assert.doesNotThrow(() => assertStripeConfigured({ secretKey: "sk_test" }));
});

test("assertStripeWebhookConfigured requires both Stripe secrets", () => {
  assert.throws(() => assertStripeWebhookConfigured({ secretKey: "sk_test", webhookSecret: "" }), /webhook secret/);
  assert.doesNotThrow(() => assertStripeWebhookConfigured({ secretKey: "sk_test", webhookSecret: "whsec_test" }));
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

test("findStripePrice resolves a plan lookup key", async () => {
  const calls = [];
  const price = await findStripePrice({ prices: { list: async (query) => { calls.push(query); return { data: [{ id: "price_team" }] }; } } }, "team");
  assert.equal(price.id, "price_team");
  assert.deepEqual(calls[0].lookup_keys, ["wa_team_monthly"]);
});

test("findStripePrice rejects missing configured prices", async () => {
  await assert.rejects(() => findStripePrice({ prices: { list: async () => ({ data: [] }) } }, "starter"), /No active Stripe price/);
});

test("stripeObjectId normalizes expanded Stripe objects", () => {
  assert.equal(stripeObjectId("cus_1"), "cus_1");
  assert.equal(stripeObjectId({ id: "sub_1" }), "sub_1");
  assert.equal(stripeObjectId(null), null);
});

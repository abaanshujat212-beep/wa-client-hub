const test = require("node:test");
const assert = require("node:assert/strict");
const billing = require("../src/billing");

test("billing provider normalization supports configured providers", () => {
  assert.equal(billing.normalizeBillingProvider("stripe"), "stripe");
  assert.equal(billing.normalizeBillingProvider("whop"), "whop");
  assert.equal(billing.normalizeBillingProvider("swich"), "swich");
  assert.equal(billing.normalizeBillingProvider("unknown"), "manual");
});

test("billing status controls resource creation", () => {
  assert.equal(billing.canAddPaidResource("active"), true);
  assert.equal(billing.canAddPaidResource("manual"), true);
  assert.equal(billing.canAddPaidResource("pending"), false);
  assert.equal(billing.canAddPaidResource("past_due"), false);
  assert.equal(billing.canAddPaidResource("canceled"), false);
});

test("default billing uses manual by default", () => {
  assert.deepEqual(billing.defaultBilling(), {
    billingProvider: "manual",
    billingStatus: "manual",
    billingCustomerId: null,
    billingSubscriptionId: null,
    billingPlanId: null,
    currentPeriodEnd: null
  });
});

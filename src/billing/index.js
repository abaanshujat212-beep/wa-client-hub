const PROVIDERS = ["manual", "stripe", "whop", "swich"];
const BILLING_STATUSES = ["manual", "trialing", "active", "pending", "past_due", "canceled", "unpaid"];

function normalizeBillingProvider(provider) {
  const value = String(provider || "manual").toLowerCase();
  return PROVIDERS.includes(value) ? value : "manual";
}

function normalizeBillingStatus(status) {
  const value = String(status || "manual").toLowerCase();
  return BILLING_STATUSES.includes(value) ? value : "pending";
}

function canUseBillingStatus(status) {
  return ["manual", "trialing", "active", "pending"].includes(normalizeBillingStatus(status));
}

function canAddPaidResource(status) {
  return ["manual", "trialing", "active"].includes(normalizeBillingStatus(status));
}

function defaultBilling(provider = "manual") {
  const billingProvider = normalizeBillingProvider(provider);
  return {
    billingProvider,
    billingStatus: billingProvider === "manual" ? "manual" : "pending",
    billingCustomerId: null,
    billingSubscriptionId: null,
    billingPlanId: null,
    currentPeriodEnd: null
  };
}

function decorateBilling(row = {}) {
  return {
    ...defaultBilling(row.billingProvider),
    ...row,
    billingProvider: normalizeBillingProvider(row.billingProvider),
    billingStatus: normalizeBillingStatus(row.billingStatus)
  };
}

module.exports = {
  PROVIDERS,
  BILLING_STATUSES,
  normalizeBillingProvider,
  normalizeBillingStatus,
  canUseBillingStatus,
  canAddPaidResource,
  defaultBilling,
  decorateBilling
};

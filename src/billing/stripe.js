function stripeConfig(env = process.env) {
  return {
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    successUrl: env.STRIPE_SUCCESS_URL || "",
    cancelUrl: env.STRIPE_CANCEL_URL || ""
  };
}

function assertStripeConfigured(config = stripeConfig()) {
  if (!config.secretKey) throw new Error("Stripe secret key is not configured");
}

function mapStripeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["active", "trialing"].includes(value)) return value;
  if (["incomplete", "incomplete_expired", "pending"].includes(value)) return "pending";
  if (["past_due"].includes(value)) return "past_due";
  if (["canceled", "cancelled"].includes(value)) return "canceled";
  if (["unpaid"].includes(value)) return "unpaid";
  return "pending";
}

function stripePlanLookup(planId) {
  return {
    starter: "wa_starter_monthly",
    team: "wa_team_monthly",
    business: "wa_business_monthly",
    dedicated: "wa_dedicated_monthly"
  }[planId] || "wa_team_monthly";
}

module.exports = { stripeConfig, assertStripeConfigured, mapStripeStatus, stripePlanLookup };

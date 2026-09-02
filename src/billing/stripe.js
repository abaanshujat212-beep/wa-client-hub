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

function assertStripeWebhookConfigured(config = stripeConfig()) {
  assertStripeConfigured(config);
  if (!config.webhookSecret) throw new Error("Stripe webhook secret is not configured");
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

function createStripeClient(config = stripeConfig()) {
  assertStripeConfigured(config);
  const Stripe = require("stripe");
  return new Stripe(config.secretKey);
}

async function findStripePrice(stripe, planId) {
  const lookupKey = stripePlanLookup(planId);
  const result = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 1 });
  const price = result.data?.[0];
  if (!price) throw new Error(`No active Stripe price found for lookup key ${lookupKey}`);
  return price;
}

function stripeObjectId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

module.exports = { stripeConfig, assertStripeConfigured, assertStripeWebhookConfigured, mapStripeStatus, stripePlanLookup, createStripeClient, findStripePrice, stripeObjectId };

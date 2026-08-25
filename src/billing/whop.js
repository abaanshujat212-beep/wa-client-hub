const DEFAULT_WHOP = {
  apiBaseUrl: "https://api.whop.com/api/v2"
};

function whopConfig(env = process.env) {
  return {
    apiBaseUrl: env.WHOP_API_BASE_URL || DEFAULT_WHOP.apiBaseUrl,
    apiKey: env.WHOP_API_KEY || "",
    webhookSecret: env.WHOP_WEBHOOK_SECRET || ""
  };
}

function assertWhopConfigured(config = whopConfig()) {
  if (!config.apiKey) throw new Error("Whop API key is not configured");
}

function mapWhopStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["active", "trialing", "valid"].includes(value)) return "active";
  if (["pending", "incomplete"].includes(value)) return "pending";
  if (["past_due", "payment_failed"].includes(value)) return "past_due";
  if (["canceled", "cancelled", "expired", "terminated"].includes(value)) return "canceled";
  if (["unpaid"].includes(value)) return "unpaid";
  return "pending";
}

function buildWhopHeaders(config = whopConfig()) {
  assertWhopConfigured(config);
  return {
    authorization: `Bearer ${config.apiKey}`,
    "content-type": "application/json"
  };
}

async function getWhopMembership(membershipId, config = whopConfig(), fetchImpl = fetch) {
  if (!membershipId) throw new Error("Whop membership ID is required");
  const response = await fetchImpl(`${config.apiBaseUrl}/memberships/${membershipId}`, {
    method: "GET",
    headers: buildWhopHeaders(config)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.message || "Whop membership request failed");
  return payload;
}

module.exports = { whopConfig, assertWhopConfigured, mapWhopStatus, buildWhopHeaders, getWhopMembership };

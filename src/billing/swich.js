const DEFAULT_SWICH = {
  apiBaseUrl: "https://sandbox-api.swichnow.com",
  authUrl: "https://sandbox-auth.swichnow.com",
  checkoutUrl: "https://sandbox-api.checkout.swichnow.com"
};

function swichConfig(env = process.env) {
  return {
    apiBaseUrl: env.SWICH_API_BASE_URL || DEFAULT_SWICH.apiBaseUrl,
    authUrl: env.SWICH_AUTH_URL || DEFAULT_SWICH.authUrl,
    checkoutUrl: env.SWICH_CHECKOUT_URL || DEFAULT_SWICH.checkoutUrl,
    clientId: env.SWICH_CLIENT_ID || "",
    clientSecret: env.SWICH_CLIENT_SECRET || "",
    webhookSecret: env.SWICH_WEBHOOK_SECRET || "",
    successUrl: env.SWICH_SUCCESS_URL || "",
    cancelUrl: env.SWICH_CANCEL_URL || ""
  };
}

function assertSwichConfigured(config = swichConfig()) {
  if (!config.clientId || !config.clientSecret) throw new Error("Swich client credentials are not configured");
}

async function getSwichAccessToken(config = swichConfig(), fetchImpl = fetch) {
  assertSwichConfigured(config);
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  const response = await fetchImpl(`${config.authUrl}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || "Swich token request failed");
  return payload.access_token;
}

function mapSwichStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["paid", "success", "successful", "captured", "completed"].includes(value)) return "active";
  if (["pending", "initiated", "created", "processing"].includes(value)) return "pending";
  if (["failed", "declined"].includes(value)) return "past_due";
  if (["canceled", "cancelled", "expired", "reversed", "void"].includes(value)) return "canceled";
  return "pending";
}

module.exports = { swichConfig, assertSwichConfigured, getSwichAccessToken, mapSwichStatus };

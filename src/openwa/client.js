class OpenWaClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.OPENWA_BASE_URL || "").replace(/\/$/, "");
    this.apiKey = options.apiKey || process.env.OPENWA_API_KEY || "";
    this.sessionId = options.sessionId || process.env.OPENWA_SESSION_ID || "primary";
    this.webhookUrl = options.webhookUrl || process.env.OPENWA_WEBHOOK_URL || "";
    this.webhookSecret = options.webhookSecret || process.env.OPENWA_WEBHOOK_SECRET || "";
    this.fetch = options.fetch || global.fetch;
  }

  assertConfigured() {
    if (!this.baseUrl || !this.apiKey) throw new Error("OpenWA is not configured");
  }

  async call(method, args = {}) {
    this.assertConfigured();
    const response = await this.fetch(`${this.baseUrl}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ args })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(`OpenWA ${method} failed (${response.status})`);
    return payload.data ?? payload;
  }

  status() { return this.call("getConnectionState"); }
  registerWebhook() {
    if (!this.webhookUrl || !this.webhookSecret) throw new Error("OpenWA webhook URL and secret are required");
    return this.call("registerWebhook", { url: this.webhookUrl, events: "all", requestConfig: { headers: { "X-Webhook-Secret": this.webhookSecret } }, concurrency: 5 });
  }
  sendText(to, content) { return this.call("sendText", { to, content }); }
  sendFile(to, file, filename, caption = "") { return this.call("sendFile", { to, file, filename, caption, waitForId: true }); }
}

module.exports = { OpenWaClient };

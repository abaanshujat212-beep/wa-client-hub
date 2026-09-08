function providerError(message, code, status) { const error = new Error(message); error.code = code; if (status) error.providerStatus = status; return error; }
function normalizeRecipient(value) { const recipient = String(value || "").replace(/\D/g, ""); if (!/^\d{8,15}$/.test(recipient)) throw providerError("Invalid WhatsApp recipient", "INVALID_RECIPIENT"); return recipient; }
class MetaCloudApiAdapter {
  constructor({ credentialResolver, graphVersion, fetchImpl = globalThis.fetch, baseUrl = "https://graph.facebook.com" }) { if (!credentialResolver || typeof credentialResolver.resolveMeta !== "function") throw new TypeError("credentialResolver.resolveMeta is required"); if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required"); this.credentialResolver = credentialResolver; this.graphVersion = String(graphVersion || "").trim(); this.fetch = fetchImpl; this.baseUrl = String(baseUrl).replace(/\/$/, ""); }
  async sendText({ connection, to, text }) {
    if (connection.provider !== "whatsapp_cloud") throw providerError("Meta adapter received a non-Meta connection", "PROVIDER_MISMATCH");
    if (!/^v\d+\.\d+$/.test(this.graphVersion)) throw providerError("Meta Graph API version is not configured", "META_GRAPH_VERSION_REQUIRED");
    const recipient = normalizeRecipient(to);
    const credentials = await this.credentialResolver.resolveMeta({ workspaceId: connection.workspaceId, providerConnectionId: connection.providerConnectionId });
    if (!credentials) throw providerError("Meta provider connection is unavailable", "META_CONNECTION_UNAVAILABLE");
    if (String(connection.externalSessionId || "") !== credentials.phoneNumberId) throw providerError("Meta phone-number mapping does not match the conversation", "PROVIDER_MAPPING_MISMATCH");
    const response = await this.fetch(`${this.baseUrl}/${this.graphVersion}/${credentials.phoneNumberId}/messages`, { method: "POST", headers: { authorization: `Bearer ${credentials.accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "text", text: { preview_url: false, body: text } }) });
    let payload = null; try { payload = await response.json(); } catch {}
    if (!response.ok) throw providerError(`Meta Cloud API rejected the message (HTTP ${response.status})`, `META_HTTP_${response.status}`, response.status);
    const externalMessageId = String(payload?.messages?.[0]?.id || "").trim();
    if (!externalMessageId) throw providerError("Meta Cloud API response did not include a message ID", "META_RESPONSE_INVALID");
    return { externalMessageId, rawStatus: "accepted" };
  }
}
module.exports = { MetaCloudApiAdapter, normalizeRecipient };

const { MetaGraphClient, validVersion } = require('./metaGraphClient');
const { normalizeTemplate } = require('./templateCatalog');
const { normalizeMediaReference } = require('./mediaReference');

function providerError(message, code, status) { const error = new Error(message); error.code = code; if (status) error.providerStatus = status; return error; }
function normalizeRecipient(value) { const recipient = String(value || '').replace(/\D/g, ''); if (!/^\d{8,15}$/.test(recipient)) throw providerError('Invalid WhatsApp recipient', 'INVALID_RECIPIENT'); return recipient; }

class MetaCloudApiAdapter {
  constructor({ credentialResolver, graphVersion, fetchImpl = globalThis.fetch, baseUrl = 'https://graph.facebook.com', graphClient = null, timeoutMs, maxRetries } = {}) {
    if (!credentialResolver || typeof credentialResolver.resolveMeta !== 'function') throw new TypeError('credentialResolver.resolveMeta is required');
    this.credentialResolver = credentialResolver;
    this.graphVersion = String(graphVersion || '').trim();
    this.graphClient = graphClient || new MetaGraphClient({ graphVersion, fetchImpl, baseUrl, timeoutMs, maxRetries });
    this.ownsGraphClient = !graphClient;
  }

  async credentials(connection) {
    if (connection.provider !== 'whatsapp_cloud') throw providerError('Meta adapter received a non-Meta connection', 'PROVIDER_MISMATCH');
    if (this.ownsGraphClient) validVersion(this.graphVersion);
    const value = await this.credentialResolver.resolveMeta({ workspaceId: connection.workspaceId, providerConnectionId: connection.providerConnectionId });
    if (!value) throw providerError('Meta provider connection is unavailable', 'META_CONNECTION_UNAVAILABLE');
    if (String(connection.externalSessionId || '') !== value.phoneNumberId) throw providerError('Meta phone-number mapping does not match the conversation', 'PROVIDER_MAPPING_MISMATCH');
    return value;
  }

  async sendText({ connection, to, text }) {
    const recipient = normalizeRecipient(to); const c = await this.credentials(connection);
    const payload = await this.graphClient.request({ path: [c.phoneNumberId, 'messages'], accessToken: c.accessToken, method: 'POST', body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'text', text: { preview_url: false, body: text } } });
    return this.result(payload);
  }

  async sendTemplate({ connection, to, template }) {
    const recipient = normalizeRecipient(to); const c = await this.credentials(connection); const value = normalizeTemplate(template);
    const payload = await this.graphClient.request({ path: [c.phoneNumberId, 'messages'], accessToken: c.accessToken, method: 'POST', body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: 'template', template: { name: value.name, language: { code: value.language }, components: value.components } } });
    return this.result(payload);
  }

  async sendMedia({ connection, to, media }) {
    const recipient = normalizeRecipient(to); const c = await this.credentials(connection); const value = normalizeMediaReference(media);
    const content = { id: value.mediaId, ...(value.caption ? { caption: value.caption } : {}), ...(value.filename && value.type === 'document' ? { filename: value.filename } : {}) };
    const payload = await this.graphClient.request({ path: [c.phoneNumberId, 'messages'], accessToken: c.accessToken, method: 'POST', body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, type: value.type, [value.type]: content } });
    return this.result(payload);
  }

  result(payload) {
    const externalMessageId = String(payload?.messages?.[0]?.id || '').trim();
    if (!externalMessageId) throw providerError('Meta Cloud API response did not include a message ID', 'META_RESPONSE_INVALID');
    return { externalMessageId, rawStatus: 'accepted' };
  }
}

module.exports = { MetaCloudApiAdapter, normalizeRecipient };

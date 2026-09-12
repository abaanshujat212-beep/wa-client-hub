const { normalizeCallingReadiness, unavailableCallingReadiness } = require('./metaCallingReadiness');

class MetaDiagnosticsError extends Error {
  constructor(message, code) { super(message); this.name = 'MetaDiagnosticsError'; this.code = code; }
}
class MetaConnectionDiagnosticsService {
  constructor({ repository, graphVersion, fetchImpl = globalThis.fetch, baseUrl = 'https://graph.facebook.com' }) {
    if (!repository || typeof fetchImpl !== 'function' || !/^v\d+\.\d+$/.test(String(graphVersion || ''))) throw new TypeError('Diagnostics repository, fetch and Graph version are required');
    this.repository = repository; this.graphVersion = graphVersion; this.fetch = fetchImpl; this.baseUrl = String(baseUrl).replace(/\/$/, '');
  }
  async request(path, accessToken) {
    const response = await this.fetch(`${this.baseUrl}/${this.graphVersion}/${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
    let payload = null; try { payload = await response.json(); } catch {}
    if (!response.ok) throw new MetaDiagnosticsError('Meta diagnostics request failed', response.status === 401 || response.status === 403 ? 'META_DIAGNOSTICS_AUTH_FAILED' : 'META_DIAGNOSTICS_UNAVAILABLE');
    return payload || {};
  }
  async run(scope) {
    const target = await this.repository.diagnosticsTarget(scope);
    if (!target) throw new MetaDiagnosticsError('Meta connection not found', 'META_CONNECTION_NOT_FOUND');
    try {
      const fields = encodeURIComponent('id,display_phone_number,verified_name,quality_rating,name_status,code_verification_status');
      const phone = await this.request(`${target.phoneNumberId}?fields=${fields}`, target.accessToken);
      if (String(phone.id) !== target.phoneNumberId) throw new MetaDiagnosticsError('Meta asset verification failed', 'META_DIAGNOSTICS_ASSET_MISMATCH');
      const subscriptions = await this.request(`${target.wabaId}/subscribed_apps?limit=100`, target.accessToken);
      const webhookSubscribed = Array.isArray(subscriptions.data) && subscriptions.data.length > 0;
      let callingReadiness;
      try {
        const settings = await this.request(`${target.phoneNumberId}/settings`, target.accessToken);
        callingReadiness = normalizeCallingReadiness({ settings, subscriptions });
      } catch (error) {
        callingReadiness = unavailableCallingReadiness(error instanceof MetaDiagnosticsError ? error.code : undefined);
      }
      const result = {
        healthy: webhookSubscribed, tokenStatus: 'valid', webhookSubscribed,
        accountStatus: 'connected', qualityRating: String(phone.quality_rating || '').trim() || null,
        displayPhoneNumber: String(phone.display_phone_number || '').trim() || null,
        verifiedName: String(phone.verified_name || '').trim() || null,
        code: webhookSubscribed ? 'META_DIAGNOSTICS_OK' : 'META_WEBHOOK_NOT_SUBSCRIBED',
      };
      const saved = await this.repository.recordDiagnostics({ ...scope, result });
      return { ...saved, callingReadiness };
    } catch (error) {
      const code = error instanceof MetaDiagnosticsError ? error.code : 'META_DIAGNOSTICS_UNAVAILABLE';
      await this.repository.recordDiagnostics({ ...scope, result: { healthy: false, tokenStatus: code === 'META_DIAGNOSTICS_AUTH_FAILED' ? 'invalid' : 'unverified', webhookSubscribed: false, accountStatus: 'unknown', qualityRating: null, displayPhoneNumber: null, verifiedName: null, code } });
      throw new MetaDiagnosticsError('Meta diagnostics could not be completed', code);
    }
  }
}
module.exports = { MetaConnectionDiagnosticsService, MetaDiagnosticsError };

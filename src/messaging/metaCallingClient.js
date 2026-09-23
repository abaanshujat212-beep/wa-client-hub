const ACTIONS = new Set(['connect', 'pre_accept', 'accept', 'reject', 'terminate']);

class MetaCallingError extends Error {
  constructor(code, message = 'Meta Calling request is invalid', status = 400) {
    super(message);
    this.name = 'MetaCallingError';
    this.code = code;
    this.status = status;
  }
}

function normalizeSdp(value) {
  const sdp = String(value || '');
  if (!sdp || sdp.length > 200000 || !sdp.startsWith('v=0')) throw new MetaCallingError('META_SDP_REQUIRED', 'A valid WebRTC SDP value is required', 400);
  return sdp;
}

function normalizeCallId(value) {
  const callId = String(value || '').trim();
  if (!callId || callId.length > 512) throw new MetaCallingError('META_CALL_ID_REQUIRED', 'A Meta call ID is required', 400);
  return callId;
}

function buildCallActionBody(input = {}) {
  const action = String(input.action || '').trim().toLowerCase();
  if (!ACTIONS.has(action)) throw new MetaCallingError('META_CALL_ACTION_INVALID', 'Unsupported Meta Calling action', 400);
  const body = { messaging_product: 'whatsapp', action };
  if (action === 'connect') {
    const to = String(input.to || '').trim().replace(/^\+/, '');
    if (!/^[1-9]\d{7,14}$/.test(to)) throw new MetaCallingError('META_CALL_RECIPIENT_INVALID', 'A valid WhatsApp recipient is required', 400);
    body.to = to;
    body.session = { sdp_type: action === 'connect' ? 'offer' : 'answer', sdp: normalizeSdp(input.sdp) };
  } else if (action === 'pre_accept' || action === 'accept') {
    body.call_id = normalizeCallId(input.callId);
    body.session = { sdp_type: action === 'connect' ? 'offer' : 'answer', sdp: normalizeSdp(input.sdp) };
  } else {
    body.call_id = normalizeCallId(input.callId);
  }
  if (input.correlationId) body.biz_opaque_callback_data = String(input.correlationId);
  return body;
}

class MetaCallingClient {
  constructor({ graphClient, enabled = false } = {}) {
    if (!graphClient || typeof graphClient.request !== 'function') throw new TypeError('Meta Graph client is required');
    this.graphClient = graphClient;
    this.enabled = enabled === true;
  }

  async action({ phoneNumberId, accessToken, ...input }) {
    if (!this.enabled) throw new MetaCallingError('META_CALLING_DISABLED', 'Meta Calling is disabled until the private POC is approved', 404);
    const phone = String(phoneNumberId || '').trim();
    if (!/^\d{1,64}$/.test(phone)) throw new MetaCallingError('META_PHONE_NUMBER_ID_INVALID', 'A valid Meta phone-number ID is required', 400);
    const body = buildCallActionBody(input);
    return this.graphClient.request({ path: [phone, 'calls'], accessToken, method: 'POST', body });
  }
}

module.exports = { ACTIONS, MetaCallingError, MetaCallingClient, buildCallActionBody, normalizeSdp, normalizeCallId };

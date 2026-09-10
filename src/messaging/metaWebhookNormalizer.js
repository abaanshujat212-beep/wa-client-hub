function digits(value) { return String(value || '').replace(/\D/g, ''); }
function extractMetaEvents(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
  const events = [];
  for (const entry of payload.entry) {
    const wabaId = String(entry?.id || ''); if (!/^\d{1,64}$/.test(wabaId) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== 'messages' || !change.value || typeof change.value !== 'object') continue;
      const value = change.value; const phoneNumberId = String(value.metadata?.phone_number_id || '');
      if (!/^\d{1,64}$/.test(phoneNumberId)) continue;
      const businessPhone = digits(value.metadata?.display_phone_number);
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const id = String(message?.id || ''); const from = digits(message?.from);
        if (!id || id.length > 512 || !from) continue;
        const outboundEcho = message.from_me === true || (businessPhone && from === businessPhone) || message.origin?.type === 'business';
        events.push({ kind: 'message', externalEventId: `message:${id}`, wabaId, phoneNumberId, providerMessageId: id, direction: outboundEcho ? 'outbound' : 'inbound', echo: outboundEcho, payload: { metadata: value.metadata, contacts: value.contacts || [], message } });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const id = String(status?.id || ''); const state = String(status?.status || '').toLowerCase(); const timestamp = String(status?.timestamp || '');
        if (!id || id.length > 512 || !['sent','delivered','read','failed'].includes(state)) continue;
        events.push({ kind: 'status', externalEventId: `status:${id}:${state}:${timestamp || 'unknown'}`, wabaId, phoneNumberId, providerMessageId: id, status: state, payload: { metadata: value.metadata, status } });
      }
    }
  }
  return events;
}
module.exports = { digits, extractMetaEvents };

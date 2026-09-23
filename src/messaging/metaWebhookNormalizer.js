const crypto = require('node:crypto');
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function eventHash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function extractMetaEvents(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return [];
  const events = [];
  for (const entry of payload.entry) {
    const wabaId = String(entry?.id || ''); if (!/^\d{1,64}$/.test(wabaId) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!['messages','smb_message_echoes','history','smb_app_state_sync','calls'].includes(change?.field) || !change.value || typeof change.value !== 'object') continue;
      const value = change.value; const phoneNumberId = String(value.metadata?.phone_number_id || '');
      if (!/^\d{1,64}$/.test(phoneNumberId)) continue;
      if (change.field === 'calls') { events.push(...require('./metaCallEvents').normalizeCallEvents(value,wabaId,phoneNumberId)); continue; }
      const businessPhone = digits(value.metadata?.display_phone_number);
      if (change.field === 'smb_app_state_sync') {
        for (const item of Array.isArray(value.state_sync) ? value.state_sync : []) {
          if (item.type !== 'contact' || !['add','remove'].includes(item.action) || !/^\+?\d{8,15}$/.test(String(item.contact?.phone_number || ''))) continue;
          events.push({ kind: 'contact', externalEventId: `contact:${eventHash(item)}`, wabaId, phoneNumberId, payload: item });
        }
        continue;
      }
      const history = change.field === 'history';
      const messages = [...(Array.isArray(value.messages) ? value.messages : [])];
      if (change.field === 'smb_message_echoes' && Array.isArray(value.message_echoes)) messages.push(...value.message_echoes);
      if (history) for (const chunk of Array.isArray(value.history) ? value.history : []) {
        events.push({ kind: 'history_progress', externalEventId: `history-progress:${eventHash(chunk.metadata || chunk.errors || {})}`, wabaId, phoneNumberId, payload: { metadata: chunk.metadata || {}, errors: chunk.errors || [] } });
        for (const thread of Array.isArray(chunk.threads) ? chunk.threads : []) {
          if (!/^\d{8,15}$/.test(String(thread.id || ''))) continue;
          for (const message of Array.isArray(thread.messages) ? thread.messages : []) messages.push({ ...message, to: message.to || thread.id });
        }
      }
      for (const message of messages) {
        const id = String(message?.id || ''); const from = digits(message?.from);
        if (!id || id.length > 512 || !from) continue;
        const outboundEcho = change.field === 'smb_message_echoes' || message.from_me === true || (businessPhone && from === businessPhone) || message.origin?.type === 'business';
        events.push({ kind: 'message', externalEventId: history ? `history:${id}:${message.type || 'other'}` : `message:${id}`, wabaId, phoneNumberId, providerMessageId: id, direction: outboundEcho ? 'outbound' : 'inbound', echo: Boolean(outboundEcho), history, payload: { metadata: value.metadata, contacts: value.contacts || [], message } });
      }
      for (const status of !history && Array.isArray(value.statuses) ? value.statuses : []) {
        const id = String(status?.id || ''); const state = String(status?.status || '').toLowerCase(); const timestamp = String(status?.timestamp || '');
        if (!id || id.length > 512 || !['sent','delivered','read','failed'].includes(state)) continue;
        events.push({ kind: 'status', externalEventId: `status:${id}:${state}:${timestamp || 'unknown'}`, wabaId, phoneNumberId, providerMessageId: id, status: state, payload: { metadata: value.metadata, status } });
      }
    }
  }
  return events;
}
module.exports = { digits, extractMetaEvents };

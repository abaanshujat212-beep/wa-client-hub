function createGhlInboundBridge({ pool, deliverInboundWhatsApp }) {
  if (typeof pool?.query !== 'function' || typeof deliverInboundWhatsApp !== 'function') return null;
  return { async deliver({ workspaceId, numberId, providerMessageId, canonicalMessageId, source, echo }) {
    if (echo) return { skipped: 'echo' };
    const message = (await pool.query(`SELECT m.id,m.body,m.conversation_id,m.external_message_id,c.whatsapp_number_id,c.workspace_id,ct.phone_e164 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.workspace_id=m.workspace_id JOIN contacts ct ON ct.id=c.contact_id AND ct.workspace_id=c.workspace_id WHERE m.id=$1 AND m.workspace_id=$2 AND m.direction='inbound' AND c.whatsapp_number_id=$3`, [canonicalMessageId, workspaceId, numberId])).rows[0];
    if (!message) return { skipped: 'canonical_message_not_found' };
    const mapping = (await pool.query(`SELECT m.*,i.installation_id,i.location_id FROM ghl_number_mappings m JOIN ghl_installations i ON i.id=m.installation_id AND i.status='active' WHERE m.workspace_id=$1 AND m.whatsapp_number_id=$2`, [workspaceId, numberId])).rows;
    if (mapping.length !== 1) return { skipped: mapping.length ? 'ambiguous_mapping' : 'not_ghl_mapped' };
    const link = (await pool.query('SELECT ghl_conversation_id,ghl_contact_id FROM ghl_conversation_links WHERE mapping_id=$1 AND conversation_id=$2', [mapping[0].id, message.conversation_id])).rows[0];
    if (!link) return { skipped: 'ghl_conversation_not_mapped' };
    return deliverInboundWhatsApp({ mapping: mapping[0], conversationId: link.ghl_conversation_id, contactId: link.ghl_contact_id, body: message.body || '', canonicalMessageId: message.id, providerMessageId, ghlMessageId: `${source || 'whatsapp'}:${providerMessageId || message.id}` });
  } };
}
module.exports = { createGhlInboundBridge };

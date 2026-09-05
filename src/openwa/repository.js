const crypto = require("node:crypto");

function normalizePhone(chatId) {
  const digits = String(chatId || "").split("@")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function messageType(value) {
  const type = String(value || "text").toLowerCase();
  return ["image", "video", "audio", "document", "location", "contact", "reaction"].includes(type) ? type : type === "chat" ? "text" : "other";
}

function messageStatus(ack) {
  const value = typeof ack === "object" ? ack.ack ?? ack.status : ack;
  if ([3, "read"].includes(value)) return "read";
  if ([2, "delivered"].includes(value)) return "delivered";
  if ([1, "sent"].includes(value)) return "sent";
  if ([-1, "failed"].includes(value)) return "failed";
  return "accepted";
}

class OpenWaRepository {
  constructor(pool) { this.pool = pool; }

  async enable({ workspaceId, numberId, sessionId, label, riskAcknowledgedBy }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const number = await client.query("SELECT id FROM whatsapp_numbers WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [numberId, workspaceId]);
      if (!number.rowCount) throw new Error("WhatsApp number not found in workspace");
      const id = crypto.randomUUID();
      await client.query(`INSERT INTO provider_connections (id,workspace_id,provider,label,status,settings)
        VALUES ($1,$2,'openwa',$3,'connecting',$4)`, [id, workspaceId, label, { riskAcknowledgedAt: new Date().toISOString(), riskAcknowledgedBy }]);
      await client.query(`UPDATE whatsapp_numbers SET provider_connection_id=$1,external_session_id=$2,automation_enabled=true WHERE id=$3`, [id, sessionId, numberId]);
      await client.query("COMMIT");
      return { id, workspaceId, numberId, sessionId, status: "connecting", automationEnabled: true };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async connectionForNumber(workspaceId, numberId) {
    const result = await this.pool.query(`SELECT pc.*,wn.id AS number_id,wn.external_session_id,wn.automation_enabled
      FROM whatsapp_numbers wn JOIN provider_connections pc ON pc.id=wn.provider_connection_id
      WHERE wn.workspace_id=$1 AND wn.id=$2 AND pc.provider='openwa'`, [workspaceId, numberId]);
    return result.rows[0] || null;
  }

  async connectionForSession(sessionId) {
    const result = await this.pool.query(`SELECT pc.*,wn.id AS number_id,wn.external_session_id
      FROM whatsapp_numbers wn JOIN provider_connections pc ON pc.id=wn.provider_connection_id
      WHERE wn.external_session_id=$1 AND pc.provider='openwa'`, [sessionId]);
    return result.rows[0] || null;
  }

  async setStatus(connectionId, status) {
    await this.pool.query("UPDATE provider_connections SET status=$1,updated_at=now() WHERE id=$2", [status, connectionId]);
  }

  async recordOutbound({ connection, to, body, type, origin = "api", externalMessageId, idempotencyKey }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const phone = normalizePhone(to);
      const contactId = crypto.randomUUID();
      await client.query(`INSERT INTO contacts (id,workspace_id,phone_e164) VALUES ($1,$2,$3) ON CONFLICT (workspace_id,phone_e164) DO NOTHING`, [contactId, connection.workspace_id, phone]);
      const contact = await client.query("SELECT id FROM contacts WHERE workspace_id=$1 AND phone_e164=$2", [connection.workspace_id, phone]);
      const conversationId = crypto.randomUUID();
      await client.query(`INSERT INTO conversations (id,workspace_id,whatsapp_number_id,contact_id,last_message_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (workspace_id,whatsapp_number_id,contact_id) DO UPDATE SET last_message_at=now()`, [conversationId, connection.workspace_id, connection.number_id, contact.rows[0].id]);
      const conversation = await client.query("SELECT id FROM conversations WHERE workspace_id=$1 AND whatsapp_number_id=$2 AND contact_id=$3", [connection.workspace_id, connection.number_id, contact.rows[0].id]);
      const id = crypto.randomUUID();
      await client.query(`INSERT INTO messages (id,workspace_id,conversation_id,provider_connection_id,external_message_id,client_idempotency_key,direction,origin,type,body,status,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,'outbound',$7,$8,$9,'accepted',now()) ON CONFLICT DO NOTHING`, [id, connection.workspace_id, conversation.rows[0].id, connection.id, externalMessageId || null, idempotencyKey || null, origin, type, body || null]);
      await client.query("COMMIT");
      return { id, externalMessageId, status: "accepted" };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async ingest(envelope, signatureValid = true, onInbound = null, onCanonicalEvent = null) {
    const connection = await this.connectionForSession(envelope.sessionId);
    if (!connection) throw new Error("Unknown OpenWA session");
    const externalEventId = String(envelope.webhookId || envelope.payload?.message?.id || envelope.payload?.id || "");
    if (!externalEventId) throw new Error("OpenWA event identifier is required");
    let receiptId = crypto.randomUUID();
    const inserted = await this.pool.query(`INSERT INTO webhook_receipts (id,workspace_id,source,provider_connection_id,external_event_id,signature_valid,payload,status,attempt_count)
      VALUES ($1,$2,'openwa',$3,$4,$5,$6,'processing',1) ON CONFLICT (source,provider_connection_id,external_event_id) DO NOTHING RETURNING id`, [receiptId, connection.workspace_id, connection.id, externalEventId, signatureValid, envelope]);
    if (!inserted.rowCount) {
      const existing = await this.pool.query("SELECT id,status,attempt_count FROM webhook_receipts WHERE source='openwa' AND provider_connection_id=$1 AND external_event_id=$2", [connection.id, externalEventId]);
      if (existing.rows[0]?.status === "processed" || existing.rows[0]?.status === "dead_letter") return { duplicate: true };
      receiptId = existing.rows[0].id;
      await this.pool.query("UPDATE webhook_receipts SET status='processing',attempt_count=attempt_count+1,error=NULL WHERE id=$1", [receiptId]);
    }
    try {
      if (["message.received", "message.any"].includes(envelope.event) && envelope.payload?.message) { await this.ingestMessage(connection, envelope.payload.message); if(onInbound)await onInbound({workspaceId:connection.workspace_id,message:envelope.payload.message}); }
      let canonicalEvent = null;
      if (envelope.event === "ack.changed") canonicalEvent = await this.ingestAck(connection, envelope.payload?.ack || envelope.payload);
      if (envelope.event === "session.state.changed") {
        const next = String(envelope.payload?.details?.next || "").toLowerCase();
        await this.setStatus(connection.id, ["connected", "authenticated", "ready"].includes(next) ? "active" : "offline");
      }
      if (onCanonicalEvent) await onCanonicalEvent({ workspaceId: connection.workspace_id, event: envelope.event, result: canonicalEvent, envelope });
      await this.pool.query("UPDATE webhook_receipts SET status='processed',processed_at=now() WHERE id=$1", [receiptId]);
      return { duplicate: false, receiptId, workspaceId: connection.workspace_id };
    } catch (error) {
      await this.pool.query("UPDATE webhook_receipts SET status=CASE WHEN attempt_count>=4 THEN 'dead_letter' ELSE 'failed' END,error=$2 WHERE id=$1", [receiptId, error.message]);
      throw error;
    }
  }

  async outboundByIdempotencyKey(workspaceId, key) {
    if (!key) return null;
    const result = await this.pool.query("SELECT id,external_message_id,status FROM messages WHERE workspace_id=$1 AND client_idempotency_key=$2", [workspaceId, key]);
    return result.rows[0] || null;
  }

  async ingestMessage(connection, message) {
    const peer = message.fromMe ? message.to : message.from;
    const phone = normalizePhone(peer);
    if (!phone || !message.id) throw new Error("Invalid OpenWA message payload");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const contactId = crypto.randomUUID();
      await client.query("INSERT INTO contacts (id,workspace_id,phone_e164,display_name) VALUES ($1,$2,$3,$4) ON CONFLICT (workspace_id,phone_e164) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,contacts.display_name)", [contactId, connection.workspace_id, phone, message.sender?.pushname || null]);
      const contact = await client.query("SELECT id FROM contacts WHERE workspace_id=$1 AND phone_e164=$2", [connection.workspace_id, phone]);
      const conversationId = crypto.randomUUID();
      const occurredAt = new Date(Number(message.timestamp || Date.now()) * (Number(message.timestamp) < 1e12 ? 1000 : 1));
      await client.query(`INSERT INTO conversations (id,workspace_id,whatsapp_number_id,contact_id,last_message_at,unread_count) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (workspace_id,whatsapp_number_id,contact_id) DO UPDATE SET last_message_at=EXCLUDED.last_message_at,unread_count=conversations.unread_count+EXCLUDED.unread_count`, [conversationId, connection.workspace_id, connection.number_id, contact.rows[0].id, occurredAt, message.fromMe ? 0 : 1]);
      const conversation = await client.query("SELECT id FROM conversations WHERE workspace_id=$1 AND whatsapp_number_id=$2 AND contact_id=$3", [connection.workspace_id, connection.number_id, contact.rows[0].id]);
      await client.query(`INSERT INTO messages (id,workspace_id,conversation_id,provider_connection_id,external_message_id,direction,origin,type,body,status,occurred_at,metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (provider_connection_id,external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`, [crypto.randomUUID(), connection.workspace_id, conversation.rows[0].id, connection.id, message.id, message.fromMe ? "outbound" : "inbound", message.fromMe ? "phone" : "contact", messageType(message.type), message.body || message.caption || null, message.fromMe ? "sent" : "received", occurredAt, { isMedia: Boolean(message.isMedia), from: message.from, to: message.to }]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async ingestAck(connection, ack) {
    const externalMessageId = String(ack?.id || ack?.messageId || "");
    if (!externalMessageId) throw new Error("Acknowledgement message identifier is required");
    const status = messageStatus(ack);
    const updated = await this.pool.query("UPDATE messages SET status=$1 WHERE provider_connection_id=$2 AND external_message_id=$3 RETURNING id,workspace_id", [status, connection.id, externalMessageId]);
    if (updated.rowCount) await this.pool.query("INSERT INTO message_status_events (id,workspace_id,message_id,status,external_event_id,occurred_at,details) VALUES ($1,$2,$3,$4,$5,now(),$6)", [crypto.randomUUID(), updated.rows[0].workspace_id, updated.rows[0].id, status, ack.eventId || null, ack]);
    return { externalMessageId, status, messageId: updated.rows[0]?.id || null };
  }
}

module.exports = { OpenWaRepository, normalizePhone, messageType, messageStatus };

const crypto = require("node:crypto");
const express = require("express");

function safeSecretEqual(actual, expected) {
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function normalizeEnvelope(body = {}) {
  if (body.payload) return body;
  const aliases = { onMessage: "message.any", onAnyMessage: "message.any", onAck: "ack.changed", onStateChanged: "session.state.changed" };
  const event = aliases[body.event] || body.event;
  let payload = body.data;
  if (["message.received", "message.any"].includes(event)) payload = { message: body.data };
  if (event === "ack.changed") payload = { ack: body.data };
  if (event === "session.state.changed") payload = { details: { next: body.data } };
  return { webhookId: body.webhookId, sessionId: body.sessionId, event, payload, timestamp: body.timestamp || body.ts };
}

function createOpenWaRouter({ store, repository, client, events, webhookSecret = process.env.OPENWA_WEBHOOK_SECRET || "", requireAuth, requireManage }) {
  const router = express.Router();
  router.post("/webhook", async (req, res) => {
    if (!safeSecretEqual(req.get("x-webhook-secret"), webhookSecret)) return res.status(401).json({ error: "Invalid OpenWA webhook secret" });
    const envelope = normalizeEnvelope(req.body);
    if (!envelope.sessionId || !envelope.event || !envelope.payload) return res.status(400).json({ error: "Invalid OpenWA webhook envelope" });
    try { const result = await repository.ingest(envelope, true); if (!result.duplicate && events) events.publish(result.workspaceId, "message.changed", { event: envelope.event }); res.status(result.duplicate ? 200 : 202).json({ ok: true, duplicate: result.duplicate }); }
    catch (error) { res.status(error.message === "Unknown OpenWA session" ? 404 : 422).json({ error: error.message }); }
  });

  router.use(requireAuth);
  router.post("/numbers/:numberId/enable", async (req, res) => {
    const account = store.findAccount(req.params.numberId);
    if (!account || !requireManage(req.user, account.workspaceId)) return res.status(404).json({ error: "WhatsApp number not found" });
    if (req.body.riskAcknowledged !== true) return res.status(400).json({ error: "Automation risk acknowledgement is required" });
    const sessionId = client.sessionId;
    try {
      const connection = await repository.enable({ workspaceId: account.workspaceId, numberId: account.id, sessionId, label: account.label, riskAcknowledgedBy: req.user.id });
      await client.registerWebhook();
      await store.addAudit(req.user.id, "openwa.enabled", { workspaceId: account.workspaceId, numberId: account.id, connectionId: connection.id });
      res.status(201).json({ connection });
    } catch (error) { res.status(409).json({ error: error.message }); }
  });
  router.get("/numbers/:numberId/status", async (req, res) => {
    const account = store.findAccount(req.params.numberId);
    if (!account || !store.canViewWorkspace(req.user, account.workspaceId)) return res.status(404).json({ error: "WhatsApp number not found" });
    const connection = await repository.connectionForNumber(account.workspaceId, account.id);
    if (!connection) return res.status(404).json({ error: "Automation is not enabled" });
    try { res.json({ status: await client.status(), connection: { id: connection.id, status: connection.status, automationEnabled: connection.automation_enabled } }); }
    catch (error) { res.status(503).json({ error: error.message, connection: { id: connection.id, status: "offline" } }); }
  });
  router.post("/numbers/:numberId/send", async (req, res) => {
    const account = store.findAccount(req.params.numberId);
    if (!account || !store.canUseWorkspace(req.user, account.workspaceId)) return res.status(404).json({ error: "WhatsApp number not found" });
    const connection = await repository.connectionForNumber(account.workspaceId, account.id);
    if (!connection?.automation_enabled) return res.status(409).json({ error: "Automation is not enabled" });
    const to = String(req.body.to || "").replace(/\D/g, "") + "@c.us";
    const text = String(req.body.text || "").trim();
    if (!/^\d{8,15}@c\.us$/.test(to) || !text || text.length > 4096) return res.status(400).json({ error: "Valid recipient and text are required" });
    const idempotencyKey = String(req.get("idempotency-key") || "").trim() || null;
    try {
      const existing = await repository.outboundByIdempotencyKey(account.workspaceId, idempotencyKey);
      if (existing) return res.status(200).json({ message: { id: existing.id, externalMessageId: existing.external_message_id, status: existing.status }, duplicate: true });
      const externalMessageId = await client.sendText(to, text);
      const message = await repository.recordOutbound({ connection, to, body: text, type: "text", externalMessageId: String(externalMessageId || "") || null, idempotencyKey });
      if (events) events.publish(account.workspaceId, "message.changed", { messageId: message.id });
      await store.addAudit(req.user.id, "openwa.message.sent", { workspaceId: account.workspaceId, numberId: account.id, messageId: message.id });
      res.status(202).json({ message });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });
  router.post("/numbers/:numberId/send-media", async (req, res) => {
    const account = store.findAccount(req.params.numberId);
    if (!account || !store.canUseWorkspace(req.user, account.workspaceId)) return res.status(404).json({ error: "WhatsApp number not found" });
    const connection = await repository.connectionForNumber(account.workspaceId, account.id);
    if (!connection?.automation_enabled) return res.status(409).json({ error: "Automation is not enabled" });
    const to = String(req.body.to || "").replace(/\D/g, "") + "@c.us";
    const file = String(req.body.file || "");
    const filename = String(req.body.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 120);
    const caption = String(req.body.caption || "").slice(0, 4096);
    if (!/^\d{8,15}@c\.us$/.test(to) || !/^data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(file) || file.length > 40000) return res.status(400).json({ error: "Valid recipient and a data-URL file up to 40 KB are required" });
    const idempotencyKey = String(req.get("idempotency-key") || "").trim() || null;
    try {
      const existing = await repository.outboundByIdempotencyKey(account.workspaceId, idempotencyKey);
      if (existing) return res.status(200).json({ message: { id: existing.id, externalMessageId: existing.external_message_id, status: existing.status }, duplicate: true });
      const externalMessageId = await client.sendFile(to, file, filename, caption);
      const mediaType = file.slice(5, file.indexOf("/") > 0 ? file.indexOf("/") : 5);
      const message = await repository.recordOutbound({ connection, to, body: caption, type: ["image", "video", "audio"].includes(mediaType) ? mediaType : "document", externalMessageId: String(externalMessageId || "") || null, idempotencyKey });
      if (events) events.publish(account.workspaceId, "message.changed", { messageId: message.id });
      await store.addAudit(req.user.id, "openwa.media.sent", { workspaceId: account.workspaceId, numberId: account.id, messageId: message.id });
      res.status(202).json({ message });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });
  return router;
}

module.exports = { createOpenWaRouter, safeSecretEqual, normalizeEnvelope };

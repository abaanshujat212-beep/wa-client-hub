const crypto = require("node:crypto");
function createLegacyOpenWaTextHandler({ store, messagingRepository, sendService }) {
  if (!store || !messagingRepository || !sendService) throw new TypeError("legacy OpenWA send dependencies are required");
  return async function legacyOpenWaTextHandler(req, res) {
    const account = store.findAccount(req.params.numberId);
    if (!account || !store.canUseWorkspace(req.user, account.workspaceId)) return res.status(404).json({ error: "WhatsApp number not found" });
    const digits = String(req.body.to || "").replace(/\D/g, ""); const text = String(req.body.text || "").trim();
    if (!/^\d{8,15}$/.test(digits) || !text || text.length > 4096) return res.status(400).json({ error: "Valid recipient and text are required" });
    const suppliedKey = String(req.get("idempotency-key") || "").trim(); const idempotencyKey = suppliedKey || `legacy-openwa-${crypto.randomUUID()}`;
    try {
      const conversationId = await messagingRepository.resolveOrCreateConversation({ workspaceId: account.workspaceId, numberId: account.id, phone: `+${digits}` });
      if (!conversationId) return res.status(409).json({ error: "Automation is not enabled", code: "AUTOMATION_DISABLED" });
      const result = await sendService.sendText({ actorId: req.user.id, workspaceIds: [account.workspaceId], conversationId, text, idempotencyKey });
      if (!suppliedKey && typeof res.set === "function") res.set("warning", '299 - "Idempotency-Key is recommended for legacy OpenWA sends"');
      return res.status(result.duplicate && result.message?.status === "accepted" ? 200 : 202).json(result);
    } catch (error) { return res.status(Number(error.status) || 502).json({ error: error.message, code: error.code || "SEND_FAILED" }); }
  };
}
module.exports = { createLegacyOpenWaTextHandler };

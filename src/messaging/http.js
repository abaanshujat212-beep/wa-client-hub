function createCanonicalSendHandler({ sendService, workspaceIds }) {
  if (!sendService) throw new TypeError("sendService is required");
  if (typeof workspaceIds !== "function") throw new TypeError("workspaceIds is required");
  return async function canonicalSendHandler(req, res) {
    try {
      const result = await sendService.sendText({ actorId: req.user.id, workspaceIds: workspaceIds(req), conversationId: req.params.id, text: req.body.text, idempotencyKey: req.get("idempotency-key") });
      const completedReplay = result.duplicate && result.message?.status === "accepted";
      res.status(completedReplay ? 200 : 202).json(result);
    } catch (error) {
      const code = error.code || "SEND_FAILED";
      // Return actionable configuration errors as JSON, rather than an upstream
      // gateway failure that may be replaced by the reverse proxy's error page.
      const invalidMetaToken = code === "META_ERROR_190";
      const status = invalidMetaToken ? 409 : Number(error.status) || 500;
      console.warn('Inbox send failed', { code, status });
      res.status(status).json({
        error: invalidMetaToken ? "WhatsApp access token is invalid or expired. Ask your administrator to reconnect the Meta WhatsApp connection or update its access token." : error.message,
        code
      });
    }
  };
}
module.exports = { createCanonicalSendHandler };

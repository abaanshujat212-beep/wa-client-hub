function createCanonicalSendHandler({ sendService, workspaceIds }) {
  if (!sendService) throw new TypeError("sendService is required");
  if (typeof workspaceIds !== "function") throw new TypeError("workspaceIds is required");

  return async function canonicalSendHandler(req, res) {
    try {
      const result = await sendService.sendText({
        actorId: req.user.id,
        workspaceIds: workspaceIds(req),
        conversationId: req.params.id,
        text: req.body.text,
        idempotencyKey: req.get("idempotency-key")
      });
      res.status(result.duplicate ? 200 : 202).json(result);
    } catch (error) {
      res.status(Number(error.status) || 500).json({
        error: error.message,
        code: error.code || "SEND_FAILED"
      });
    }
  };
}

module.exports = { createCanonicalSendHandler };

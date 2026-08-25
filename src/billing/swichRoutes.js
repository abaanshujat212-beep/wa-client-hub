const express = require("express");
const { swichConfig, getSwichAccessToken } = require("./swich");

function createSwichRouter({ store }) {
  const router = express.Router();

  router.post("/token-test", async (req, res) => {
    try {
      const token = await getSwichAccessToken(swichConfig());
      store.addAudit(req.user.id, "billing.swich.token_test", { ok: true });
      res.json({ ok: true, tokenPreview: token ? `${token.slice(0, 8)}...` : null });
    } catch (error) {
      store.addAudit(req.user.id, "billing.swich.token_test", { ok: false, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/webhook", async (req, res) => {
    // TODO: verify Swich webhook signature once merchant dashboard payload is confirmed.
    store.addAudit("system", "billing.swich.webhook.received", { received: true });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createSwichRouter };

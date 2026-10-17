const express = require("express");
const { swichConfig, getSwichAccessToken, createSwichCardPayment, inquireSwichPayment } = require("./swich");
const crypto = require("node:crypto");

function createSwichRouter({ store }) {
  const router = express.Router();

  router.post("/token-test", async (req, res) => {
    try {
      const token = await getSwichAccessToken(swichConfig());
      await store.addAudit(req.user.id, "billing.swich.token_test", { ok: true });
      res.json({ ok: true, tokenPreview: token ? `${token.slice(0, 8)}...` : null });
    } catch (error) {
      await store.addAudit(req.user.id, "billing.swich.token_test", { ok: false, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/checkout", async (req, res) => {
    const workspaceId = String(req.body.workspaceId || "");
    const amount = Number(req.body.amount || 0);
    const workspace = store.findWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount is required" });
    try {
      const plan = store.getPlan(workspace.planId);
      const customer = store.findUser(workspace.ownerId);
      const payment = await createSwichCardPayment({ workspace, plan, amount, customer });
      await store.updateWorkspace(workspace.id, { billingProvider: "swich", billingStatus: "pending", billingPlanId: workspace.planId });
      await store.addAudit(req.user.id, "billing.swich.checkout.created", { workspaceId: workspace.id, amount });
      res.status(201).json({ payment });
    } catch (error) {
      await store.addAudit(req.user.id, "billing.swich.checkout.failed", { workspaceId, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/inquire/:transactionId", async (req, res) => {
    try {
      const inquiry = await inquireSwichPayment(req.params.transactionId);
      await store.addAudit(req.user.id, "billing.swich.inquired", { transactionId: req.params.transactionId });
      res.json({ inquiry });
    } catch (error) {
      await store.addAudit(req.user.id, "billing.swich.inquiry.failed", { transactionId: req.params.transactionId, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/webhook", async (req, res) => {
    const secret = swichConfig().webhookSecret;
    const supplied = String(req.get("x-swich-webhook-secret") || req.get("x-webhook-secret") || "");
    if (!secret || supplied.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) return res.status(401).json({ error: "Webhook authentication failed" });
    await store.addAudit("system", "billing.swich.webhook.received", { received: true });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createSwichRouter };

const express = require("express");
const { stripeConfig, assertStripeConfigured, mapStripeStatus, stripePlanLookup } = require("./stripe");

function createStripeRouter({ store }) {
  const router = express.Router();

  router.post("/token-test", (req, res) => {
    try {
      assertStripeConfigured(stripeConfig());
      store.addAudit(req.user.id, "billing.stripe.token_test", { ok: true });
      res.json({ ok: true });
    } catch (error) {
      store.addAudit(req.user.id, "billing.stripe.token_test", { ok: false, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/checkout", (req, res) => {
    const workspaceId = String(req.body.workspaceId || "");
    const workspace = store.findWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    try {
      assertStripeConfigured(stripeConfig());
      const lookupKey = stripePlanLookup(workspace.planId);
      store.updateWorkspace(workspace.id, { billingProvider: "stripe", billingStatus: "pending", billingPlanId: workspace.planId });
      store.addAudit(req.user.id, "billing.stripe.checkout.requested", { workspaceId, lookupKey });
      res.status(202).json({ ok: true, provider: "stripe", lookupKey, message: "Stripe SDK checkout creation is ready to wire after installing stripe package." });
    } catch (error) {
      store.addAudit(req.user.id, "billing.stripe.checkout.failed", { workspaceId, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/webhook", (req, res) => {
    const status = req.body?.status || req.body?.data?.object?.status;
    const workspaceId = req.body?.metadata?.workspaceId || req.body?.data?.object?.metadata?.workspaceId;
    if (workspaceId && status && store.findWorkspace(workspaceId)) {
      store.updateWorkspace(workspaceId, { billingProvider: "stripe", billingStatus: mapStripeStatus(status) });
    }
    store.addAudit("system", "billing.stripe.webhook.received", { workspaceId: workspaceId || null, status: status || null });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createStripeRouter };

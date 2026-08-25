const express = require("express");
const { whopConfig, assertWhopConfigured, getWhopMembership, mapWhopStatus } = require("./whop");

function createWhopRouter({ store }) {
  const router = express.Router();

  router.post("/token-test", async (req, res) => {
    try {
      assertWhopConfigured(whopConfig());
      store.addAudit(req.user.id, "billing.whop.token_test", { ok: true });
      res.json({ ok: true });
    } catch (error) {
      store.addAudit(req.user.id, "billing.whop.token_test", { ok: false, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/membership/:membershipId", async (req, res) => {
    try {
      const membership = await getWhopMembership(req.params.membershipId);
      store.addAudit(req.user.id, "billing.whop.membership.inquired", { membershipId: req.params.membershipId });
      res.json({ membership, appStatus: mapWhopStatus(membership.status || membership.data?.status) });
    } catch (error) {
      store.addAudit(req.user.id, "billing.whop.membership.failed", { membershipId: req.params.membershipId, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/webhook", async (req, res) => {
    // TODO: verify Whop webhook signature after live payload/header confirmation.
    const status = req.body?.status || req.body?.data?.status;
    const workspaceId = req.body?.metadata?.workspaceId || req.body?.data?.metadata?.workspaceId;
    if (workspaceId && status) {
      const workspace = store.findWorkspace(workspaceId);
      if (workspace) store.updateWorkspace(workspaceId, { billingProvider: "whop", billingStatus: mapWhopStatus(status) });
    }
    store.addAudit("system", "billing.whop.webhook.received", { workspaceId: workspaceId || null, status: status || null });
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createWhopRouter };

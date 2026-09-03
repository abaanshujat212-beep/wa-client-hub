const express = require("express");
const { stripeConfig, assertStripeConfigured, assertStripeWebhookConfigured, mapStripeStatus, stripePlanLookup, createStripeClient, findStripePrice, stripeObjectId } = require("./stripe");

function createStripeRouter({ store, stripeFactory = createStripeClient }) {
  const router = express.Router();

  router.post("/token-test", async (req, res) => {
    try {
      assertStripeConfigured(stripeConfig());
      await store.addAudit(req.user.id, "billing.stripe.token_test", { ok: true });
      res.json({ ok: true });
    } catch (error) {
      await store.addAudit(req.user.id, "billing.stripe.token_test", { ok: false, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/checkout", async (req, res) => {
    const workspaceId = String(req.body.workspaceId || "");
    const workspace = store.findWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    try {
      const config = stripeConfig();
      assertStripeConfigured(config);
      const lookupKey = stripePlanLookup(workspace.planId);
      const stripe = stripeFactory(config);
      const price = await findStripePrice(stripe, workspace.planId);
      const metadata = { workspaceId: workspace.id, planId: workspace.planId };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: config.successUrl || `${req.protocol}://${req.get("host")}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: config.cancelUrl || `${req.protocol}://${req.get("host")}/?billing=canceled`,
        client_reference_id: workspace.id,
        customer: workspace.billingCustomerId || undefined,
        metadata,
        subscription_data: { metadata }
      });
      await store.updateWorkspace(workspace.id, { billingProvider: "stripe", billingStatus: "pending", billingPlanId: workspace.planId, billingCustomerId: stripeObjectId(session.customer) || workspace.billingCustomerId });
      await store.addAudit(req.user.id, "billing.stripe.checkout.created", { workspaceId, lookupKey, sessionId: session.id });
      res.status(201).json({ ok: true, provider: "stripe", lookupKey, sessionId: session.id, url: session.url });
    } catch (error) {
      await store.addAudit(req.user.id, "billing.stripe.checkout.failed", { workspaceId, error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/webhook", async (req, res) => {
    try {
      const config = stripeConfig();
      assertStripeWebhookConfigured(config);
      const signature = req.get("stripe-signature");
      if (!signature || !req.rawBody) throw new Error("Stripe webhook signature or raw request body is missing");
      const stripe = stripeFactory(config);
      const event = stripe.webhooks.constructEvent(req.rawBody, signature, config.webhookSecret);
      const object = event.data?.object || {};
      let workspaceId = object.metadata?.workspaceId || object.client_reference_id;
      let subscription = object;
      if (event.type === "checkout.session.completed" && object.subscription) {
        subscription = await stripe.subscriptions.retrieve(stripeObjectId(object.subscription));
        workspaceId = workspaceId || subscription.metadata?.workspaceId;
      }
      const workspace = workspaceId && store.findWorkspace(workspaceId);
      if (workspace && (event.type === "checkout.session.completed" || event.type.startsWith("customer.subscription."))) {
        const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
        await store.updateWorkspace(workspaceId, {
          billingProvider: "stripe",
          billingStatus: mapStripeStatus(subscription.status || object.payment_status),
          billingCustomerId: stripeObjectId(object.customer || subscription.customer),
          billingSubscriptionId: stripeObjectId(object.subscription || subscription),
          billingPlanId: subscription.metadata?.planId || object.metadata?.planId || workspace.planId,
          currentPeriodEnd: periodEnd
        });
      }
      await store.addAudit("system", "billing.stripe.webhook.processed", { eventId: event.id, type: event.type, workspaceId: workspaceId || null });
      res.json({ received: true });
    } catch (error) {
      await store.addAudit("system", "billing.stripe.webhook.rejected", { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createStripeRouter };

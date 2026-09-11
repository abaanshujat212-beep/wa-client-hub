# Provider setup for wa.10xcollab.com

The permanent public application origin is `https://wa.10xcollab.com`. Cloudflare Tunnel must forward it to `http://localhost:3131`. Secrets belong only in the local `.env` or deployment secret store and must never be committed.

## HighLevel OAuth and webhooks

Use these exact values in the HighLevel Marketplace app:

| HighLevel setting | Value |
| --- | --- |
| OAuth redirect URL | `https://wa.10xcollab.com/oauth/highlevel/callback` |
| Marketplace event webhook | `https://wa.10xcollab.com/webhooks/ghl/events` |
| SMS Conversation Provider delivery URL | `https://wa.10xcollab.com/webhooks/ghl/messages` |

Local `.env`:

```dotenv
APP_ORIGIN=https://wa.10xcollab.com
COOKIE_SECURE=true
GHL_CLIENT_ID=<copy from Marketplace Client Keys>
GHL_CLIENT_SECRET=<copy once from Marketplace Client Keys>
GHL_REDIRECT_URI=https://wa.10xcollab.com/oauth/highlevel/callback
GHL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
GHL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2023-02-21
GHL_REQUIRED_SCOPES=conversations.write
```

The current private pilot intentionally requests only `conversations.write`. Do not add unsupported scopes without updating the implementation and its tests. HighLevel requires an exact HTTPS redirect URL. Marketplace event webhooks and Conversation Provider delivery are distinct settings.

## Other public receivers

- Meta WhatsApp: `https://wa.10xcollab.com/webhooks/meta/whatsapp`
- YCloud WhatsApp: `https://wa.10xcollab.com/webhooks/ycloud/whatsapp`
- OpenWA: `https://wa.10xcollab.com/api/openwa/webhook`
- Stripe: `https://wa.10xcollab.com/api/billing/stripe/webhook`
- Swich: `https://wa.10xcollab.com/api/billing/swich/webhook`
- Whop: `https://wa.10xcollab.com/api/billing/whop/webhook`

Use the in-app **Setup docs** page to copy these values. After entering the HighLevel client ID and secret, restart the app, open **Integrations**, select a workspace, and choose **Connect with HighLevel**.

Official references: [OAuth 2.0](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/), [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/), and [Conversation Providers](https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/).

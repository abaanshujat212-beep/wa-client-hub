# Provider setup for wa.10xcollab.com

The permanent public application origin is `https://wa.10xcollab.com`. Cloudflare Tunnel must forward it to `http://localhost:3131`. Secrets belong only in the local `.env` or deployment secret store and must never be committed.

## CRM OAuth and webhooks

Use these exact values in the private Marketplace app:

| Setting | Value |
| --- | --- |
| Base URL | `https://wa.10xcollab.com` |
| OAuth redirect URL | `https://wa.10xcollab.com/oauth/crm/callback` |
| Marketplace event webhook | `https://wa.10xcollab.com/webhooks/ghl/events` |
| Conversation Provider delivery URL | `https://wa.10xcollab.com/webhooks/ghl/messages` |

The `/oauth/highlevel/callback` route is retained only as a deprecated compatibility alias. Do not enter it in Marketplace configuration, documentation, or generated authorization requests.

Local `.env`:

```dotenv
APP_ORIGIN=https://wa.10xcollab.com
COOKIE_SECURE=true
GHL_CLIENT_ID=<copy from Marketplace Client Keys>
GHL_CLIENT_SECRET=<copy once from Marketplace Client Keys>
GHL_REDIRECT_URI=https://wa.10xcollab.com/oauth/crm/callback
GHL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
GHL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2023-02-21
GHL_REQUIRED_SCOPES=conversations.write
```

The private pilot requests only the official `conversations.write` scope. Do not select `conversations.read`, `contacts.read`, or `locations.read`; those are unsupported for this contract. The Marketplace-provided `conversationProviderId` must be mapped to the exact company/location, workspace, WhatsApp number, and provider connection before delivery is enabled.

## Operator setup sequence

1. Create or open the private CRM/Marketplace app.
2. Enter the Base URL and neutral OAuth redirect URL exactly as shown above.
3. Select only `conversations.write` unless the implementation and approval record are explicitly updated.
4. Configure the two distinct webhook URLs: app events and Conversation Provider delivery.
5. Copy the client ID and secret into the deployment secret store; never paste them into the browser or Git.
6. Set `STORE_DRIVER=postgres`, `DATABASE_URL`, `REDIS_URL`, and `CONNECTOR_MASTER_KEY`.
7. Run `npm run db:migrate`, restart the app, sign in, open **Integrations**, choose a workspace, and select **Connect / reconnect CRM**.
8. Confirm the company, location, OAuth scope, exact WhatsApp number, exact provider connection, and `conversationProviderId` show as ready.
9. Test one outbound and one inbound message only after the readiness panel reports a complete mapping.

## Other public receivers

- Meta WhatsApp: `https://wa.10xcollab.com/webhooks/meta/whatsapp`
- YCloud WhatsApp: `https://wa.10xcollab.com/webhooks/ycloud/whatsapp`
- OpenWA: `https://wa.10xcollab.com/api/openwa/webhook`
- Stripe: `https://wa.10xcollab.com/api/billing/stripe/webhook`
- Swich: `https://wa.10xcollab.com/api/billing/swich/webhook`
- Whop: `https://wa.10xcollab.com/api/billing/whop/webhook`

Use the in-app **Setup docs** page to copy these values. Marketplace app events and Conversation Provider delivery are distinct settings.

Official references: [OAuth 2.0](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/), [Webhook Integration Guide](https://marketplace.gohighlevel.com/docs/webhook/WebhookIntegrationGuide/), and [Conversation Providers](https://marketplace.gohighlevel.com/docs/marketplace-modules/ConversationProviders/).

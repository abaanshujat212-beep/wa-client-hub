# Operator onboarding and controlled testing checklists

This document reflects the current repository source and is intentionally a pilot checklist. It does not publish a GHL connector, enable Meta production automation, or authorize calling/video/screen-sharing implementation.

## Windows launcher flow

### New PC

1. Install or allow the setup launcher to guide installation of Node.js 22 LTS, Docker Desktop, and cloudflared.
2. Double-click `Setup-WA-Client-Hub.bat`.
3. Edit `.env.docker` when the launcher stops for placeholder values. The launcher creates it only when missing and never overwrites it.
4. Use Docker mode. It starts PostgreSQL, Redis, migrations, and the app without PM2 supervising a second app process.
5. Answer yes to the Windows logon task prompt after the local app passes `/api/health` and `/api/ready`.
6. For a new public hostname, complete the interactive named-tunnel login/create/DNS steps. The Cloudflare Windows service installation remains an elevated operator step.

### Existing PC

1. Do not reinstall Docker Desktop.
2. Do not run `cloudflared tunnel login`, `cloudflared tunnel create`, or `cloudflared tunnel route dns`.
3. Do not remove or recreate Docker volumes.
4. Double-click `Run-WA-Client-Hub.bat`. It uses the existing `.env.docker`, starts the existing Compose project without `--build`, starts the existing `cloudflared` service if stopped, and never creates a tunnel or DNS route.
5. Use `Status-WA-Client-Hub.bat` for diagnostics and `Stop-WA-Client-Hub.bat` to stop containers without deleting data.

## GHL private Marketplace pilot

### Exact server environment contract

Set these server-side only, never in browser code or Git:

```dotenv
GHL_CLIENT_ID=<Marketplace client ID>
GHL_CLIENT_SECRET=<Marketplace client secret>
GHL_REDIRECT_URI=https://wa.10xcollab.com/oauth/crm/callback
GHL_AUTH_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
GHL_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
GHL_API_BASE_URL=https://services.leadconnectorhq.com
GHL_API_VERSION=2023-02-21
GHL_REQUIRED_SCOPES=conversations.write
GHL_PUBLIC_KEY=<Marketplace public key used to verify x-ghl-signature>
```

`GHL_PUBLIC_KEY` is required for the signed Conversation Provider delivery route when webhook verification is enabled. The current source registers:

- OAuth callback: `https://wa.10xcollab.com/oauth/crm/callback`
- Marketplace events: `https://wa.10xcollab.com/webhooks/ghl/events`
- Conversation Provider delivery: `https://wa.10xcollab.com/webhooks/ghl/messages`

Do not register the legacy `/oauth/highlevel/callback` route in Marketplace.

### GHL readiness checklist

- [ ] Client ID and secret are configured server-side.
- [ ] Public key is configured if signed webhook delivery is being tested.
- [ ] Exact OAuth callback is entered in the private Marketplace app.
- [ ] Both exact webhook URLs are entered in their distinct Marketplace settings.
- [ ] Only `conversations.write` is requested for this pilot.
- [ ] OAuth install succeeds for one test location.
- [ ] The Marketplace `conversationProviderId` is recorded.
- [ ] The exact company/location is bound to one workspace.
- [ ] The exact WhatsApp number and active provider connection are selected.
- [ ] The mapping stores the exact `workspace → location → WhatsApp number → provider connection → conversationProviderId` chain.
- [ ] Integrations/readiness UI is green without exposing access tokens.
- [ ] One controlled outbound message succeeds.
- [ ] One controlled inbound message succeeds.
- [ ] Replay and wrong-location/wrong-workspace/provider-mismatch tests fail closed.
- [ ] Connector installation is tested in private mode before any publishing decision.

### GHL controlled test

1. Use one test location and one test WhatsApp number.
2. Install the private Marketplace app and complete OAuth at the exact callback.
3. Record `companyId`, `locationId`, workspace ID, and `conversationProviderId`.
4. In Integrations, confirm the installation and scope are ready.
5. Map the exact number and provider connection through the mapping UI/API.
6. Send one outbound message and confirm the provider delivery route resolves the signed `locationId` to the mapped number.
7. Send one inbound WhatsApp message and confirm delivery through the GHL inbound-message API with `conversationProviderId` and `altId` correlation.
8. Replay the webhook and confirm no duplicate message is created.
9. Test a wrong location, wrong workspace, wrong number, and provider mismatch. Each must be rejected or skipped safely.
10. Keep the app private; do not publish the connector automatically.

## Meta setup and test-number checklist

### Exact current env contract

```dotenv
META_SIGNUP_ENABLED=false
META_WEBHOOK_ENABLED=false
META_SIGNUP_CLEANUP_INTERVAL_MS=300000
META_GRAPH_VERSION=v23.0
META_APP_ID=<Meta app ID>
META_APP_SECRET=<Meta app secret>
META_EMBEDDED_SIGNUP_CONFIG_ID=<Embedded Signup configuration ID>
META_REDIRECT_URI=<documented dashboard redirect if used by the Meta app>
META_WEBHOOK_VERIFY_TOKEN=<dashboard verification value if the deployment route uses it>
```

The current runtime validation for enabling Embedded Signup requires PostgreSQL, one exact HTTPS `APP_ORIGIN`, an explicit Graph version, numeric `META_APP_ID`, a 20+ character `META_APP_SECRET`, a valid 32-byte `CONNECTOR_MASTER_KEY`, and bounded cleanup intervals. `META_SIGNUP_CLEANUP_INTERVAL_MS` must be between 60000 and 3600000. Media cleanup defaults are also validated if overridden: `META_MEDIA_CLEANUP_INTERVAL_MS` 300000–86400000 and `META_MEDIA_CLEANUP_BATCH_SIZE` 1–100.

The repository env example contains `META_WEBHOOK_ENABLED`, `META_REDIRECT_URI`, and `META_WEBHOOK_VERIFY_TOKEN`, but the current source search does not show them as runtime gates for the Meta webhook or Embedded Signup path. Do not assume they activate behavior without verifying the deployed version. Meta webhook registration is mounted at:

```text
https://wa.10xcollab.com/webhooks/meta/whatsapp
```

Meta webhook signature verification uses the raw body and `META_APP_SECRET` through `X-Hub-Signature-256`; the current webhook security source does not use `META_WEBHOOK_VERIFY_TOKEN` for that signature check.

### Meta values I must collect before testing

#### Copy manually from Meta Developer / Business Manager

- [ ] Meta App ID.
- [ ] Meta App Secret.
- [ ] Explicit Graph API version supported by the app, for example `v23.0` only if confirmed in the dashboard/project.
- [ ] Embedded Signup configuration ID.
- [ ] Meta app products, permissions, and webhook subscription configuration.
- [ ] Test WABA and test phone-number availability.
- [ ] Calling eligibility/readiness and per-number Calling settings.
- [ ] The public HTTPS callback/webhook origin.

#### Generate locally

- [ ] `CONNECTOR_MASTER_KEY`: base64 encoding of exactly 32 random bytes.
- [ ] `SESSION_SECRET`: at least 32 random characters.
- [ ] Local `META_WEBHOOK_VERIFY_TOKEN` only if a separately configured deployment route requires it; never treat it as the HMAC signature secret.

#### Discovered and stored automatically after Embedded Signup

- [ ] Short-lived signup code is exchanged server-side and not retained.
- [ ] WABA/business account ID.
- [ ] Phone-number ID.
- [ ] Display phone number and verified name.
- [ ] Encrypted provider access credentials.
- [ ] Workspace/provider connection and canonical WhatsApp number binding.
- [ ] Webhook subscription/readiness diagnostics.

The current architecture persists WABA ID and phone-number ID in the per-connection database records (`meta_connection_assets` and related provider connection data). Do not add them as global `.env` values.

#### Test-number-specific

- [ ] Test WABA ID and phone-number ID returned by the selected Embedded Signup/test asset.
- [ ] Display phone number and verified name.
- [ ] Test recipient/allowlist and messaging permissions.
- [ ] Per-number Calling settings, country/account eligibility, and permission-window status.
- [ ] Exact workspace, provider connection, and WhatsApp number mapping.

#### Never commit

- [ ] Meta App Secret.
- [ ] Access tokens or signup codes.
- [ ] WABA ID/phone-number ID when they are connection-specific runtime data.
- [ ] Webhook secrets, Cloudflare tunnel JSON/config, `.env`, `.env.docker`, database passwords, session secrets, or connector keys.

### Meta controlled test-number procedure

1. Keep `META_SIGNUP_ENABLED=false` and `META_WEBHOOK_ENABLED=false` while configuring.
2. Configure the server-side Meta app values and use a real HTTPS `APP_ORIGIN`.
3. Run migrations and restart the Docker app.
4. Enable Embedded Signup only for the private test window by setting `META_SIGNUP_ENABLED=true`; do not enable production automation.
5. Start signup from an authenticated workspace session.
6. Complete Meta Embedded Signup using the test WABA/test phone number.
7. Confirm the server exchanges the code, verifies that the phone belongs to the selected WABA, encrypts credentials, and stores the connection-specific asset mapping.
8. Confirm the exact number, workspace, provider connection, webhook subscription, and messaging readiness diagnostics are green.
9. Send one controlled inbound and one controlled outbound message using an approved test recipient.
10. Confirm webhook signatures, deduplication, status handling, and wrong-WABA/wrong-phone rejection.
11. For Calling readiness, inspect the per-number settings/permissions diagnostics. Do not claim outbound Calling, WebRTC, SIP, video, or screen sharing is production-ready.
12. Disable the feature flag again after the test if the test environment is not continuously needed.

## Manual gates before release

### Before GHL publishing

- Marketplace review/approval, privacy/legal text, support contact, production redirect/webhook validation, scope approval, and a documented rollback owner remain manual. Publishing is not performed by these scripts.

### Before Meta production enablement

- Meta Business verification, app review and permissions, WABA/number quality and policy checks, webhook subscription, messaging policy approval, per-number Calling eligibility/permissions, incident/rollback plan, monitoring, and production secret management remain manual. Calling implementation remains blocked by the existing #51/#55 gates.

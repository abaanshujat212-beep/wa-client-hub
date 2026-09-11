# CRM Conversation Provider private pilot

This runbook is for a private development pilot only. Use the owner's permanent Cloudflare-managed hostname and a named Cloudflare Tunnel. Do not use production credentials in local development and never commit secrets.

The selected custom Conversation Provider is configured as the documented SMS provider type. The app requests only the official `conversations.write` scope and sends inbound records through `/conversations/messages/inbound` with `Version: 2023-02-21`. The Marketplace-provided `conversationProviderId` must be mapped to the exact company/location, workspace, WhatsApp number, and provider connection before delivery is enabled.

## Permanent public values

```text
Base URL: https://wa.10xcollab.com
OAuth redirect: https://wa.10xcollab.com/oauth/crm/callback
Marketplace events: https://wa.10xcollab.com/webhooks/ghl/events
Conversation Provider delivery: https://wa.10xcollab.com/webhooks/ghl/messages
```

The legacy `/oauth/highlevel/callback` path is compatibility-only and must not be registered in Marketplace.

## Windows startup

From PowerShell:

```powershell
git switch main
git pull --ff-only
npm ci
Copy-Item .env.example .env
# Edit .env locally. Never commit .env or secrets.
```

Set `STORE_DRIVER=postgres`, a local `DATABASE_URL`, `REDIS_URL`, `CONNECTOR_MASTER_KEY`, and the owner-supplied CRM Marketplace values. Start PostgreSQL and Redis, then run:

```powershell
npm run db:migrate
npm start
```

The verified default backend port is `3131`; `PORT` overrides it. Confirm the configured port and health locally:

```powershell
$port = if ($env:PORT) { $env:PORT } else { '3131' }
Invoke-WebRequest "http://localhost:$port/api/health"
```

## Permanent Cloudflare Named Tunnel

```powershell
cloudflared tunnel login
cloudflared tunnel create wa-client-hub-crm
cloudflared tunnel route dns wa-client-hub-crm wa.10xcollab.com
```

Create `%USERPROFILE%\\.cloudflared\\config.yml` locally. Do not commit this file or its credentials:

```yaml
tunnel: <tunnel-uuid>
credentials-file: C:\\Users\\<windows-user>\\.cloudflared\\<tunnel-uuid>.json
ingress:
  - hostname: wa.10xcollab.com
    service: http://localhost:3131
  - service: http_status:404
```

If `PORT` is overridden, use that value instead of `3131` in the `service` line. Start the named tunnel:

```powershell
cloudflared tunnel run wa-client-hub-crm
```

Quick Tunnel is not the primary pilot design and must not be registered as the Marketplace callback.

## Pilot sequence

1. Install the private Marketplace app into one test location.
2. Record the Marketplace `conversationProviderId` for the selected custom SMS provider.
3. Complete OAuth using `/oauth/crm/callback` and bind the installation/location to one workspace.
4. Map exactly one WhatsApp number, exact provider connection, and the recorded `conversationProviderId` through `/api/ghl/mappings`.
5. Confirm the Integrations readiness panel shows company, location, scope, number, provider, and mapping readiness without exposing credentials.
6. Send one documented `ProviderOutboundMessage` payload and confirm the signed `locationId` resolves the mapped number without trusting workspace or installation identifiers from the webhook body.
7. Send one WhatsApp inbound message and confirm the Meta/YCloud processing hook calls the CRM inbound-message API with the provider ID, API version, and correlation `altId`.
8. Replay the webhook and confirm the correlation uniqueness constraint prevents duplication.
9. Test an unknown or ambiguous location, wrong workspace, wrong number, and provider mismatch; each must fail closed.

Broad delivered/read/failed propagation remains the separate #46 boundary; this pilot stores those correlation states for the next status-sync extension.

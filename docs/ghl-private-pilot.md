# HighLevel one-number private pilot

This runbook is for a private development pilot only. Use the owner's permanent Cloudflare-managed hostname and a named Cloudflare Tunnel. Do not use production credentials in local development and never commit secrets.

## Windows startup

From PowerShell:

```powershell
git switch feat/ghl-private-pilot
git pull --ff-only
npm ci
Copy-Item .env.example .env
# Edit .env locally. Never commit .env or secrets.
```

Set `STORE_DRIVER=postgres`, a local `DATABASE_URL`, `REDIS_URL`, `CONNECTOR_MASTER_KEY`, and the owner-supplied GHL Marketplace values. Start PostgreSQL and Redis, then run:

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

Authenticate the local machine to the owner's Cloudflare account:

```powershell
cloudflared tunnel login
cloudflared tunnel create wa-client-hub-ghl
```

Create a DNS route for the permanent hostname:

```powershell
cloudflared tunnel route dns wa-client-hub-ghl <permanent-ghl-host>
```

Create `%USERPROFILE%\\.cloudflared\\config.yml` locally. Do not commit this file or its credentials:

```yaml
tunnel: <tunnel-uuid>
credentials-file: C:\\Users\\<windows-user>\\.cloudflared\\<tunnel-uuid>.json
ingress:
  - hostname: <permanent-ghl-host>
    service: http://localhost:3131
  - service: http_status:404
```

If `PORT` is overridden, use that value instead of `3131` in the `service` line. Start the named tunnel:

```powershell
cloudflared tunnel run wa-client-hub-ghl
```

Configure the same permanent HTTPS host in the private HighLevel Marketplace app:

```text
https://<permanent-ghl-host>/oauth/highlevel/callback
https://<permanent-ghl-host>/webhooks/ghl/events
https://<permanent-ghl-host>/webhooks/ghl/messages
```

These URLs are stable only while the named tunnel, DNS route, and local backend remain configured. Do not use a random `trycloudflare.com` hostname as the primary pilot design. A Quick Tunnel may be used only as an emergency developer fallback and must not be registered as the production/private-pilot callback.

## Pilot sequence

1. Install the Marketplace app privately into one test location.
2. Complete OAuth and bind the installation/location to one workspace.
3. Map exactly one WhatsApp number and its exact provider connection through `/api/ghl/mappings`.
4. Send one GHL message and confirm the canonical send path resolves that mapped number.
5. Send one WhatsApp inbound message and confirm the Meta/YCloud processing hook delivers it to the mapped GHL conversation.
6. Replay the webhook and confirm the correlation uniqueness constraint prevents duplication.
7. Test an unknown location, wrong workspace, wrong number, and provider mismatch; each must fail closed.
8. Confirm correlation rows contain GHL, canonical, provider, workspace, location, and number identifiers.

Broad delivered/read/failed propagation remains the separate #46 boundary; this pilot stores those correlation states for the next status-sync extension.

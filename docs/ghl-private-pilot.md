# HighLevel one-number private pilot

This runbook is for a private development pilot only. Do not use production credentials or a permanent public endpoint.

## Windows startup

From PowerShell:

```powershell
git switch main
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

The verified default backend port is `3131`; `PORT` overrides it. Confirm health locally:

```powershell
Invoke-WebRequest http://localhost:$env:PORT/api/health
# If PORT is unset, use:
Invoke-WebRequest http://localhost:3131/api/health
```

## Temporary Cloudflare tunnel

Install `cloudflared`, then use the actual configured port:

```powershell
cloudflared tunnel --url http://localhost:3131
# Or, when PORT is set:
cloudflared tunnel --url http://localhost:$env:PORT
```

Quick Tunnel hostnames are temporary and development/private-pilot-only. Do not hard-code the generated hostname.

Configure the generated HTTPS host in the private Marketplace app as:

```text
https://<temporary-host>/oauth/highlevel/callback
https://<temporary-host>/webhooks/ghl/events
https://<temporary-host>/webhooks/ghl/messages
```

## Pilot sequence

1. Install the Marketplace app privately into one test location.
2. Complete OAuth and bind the installation/location to one workspace.
3. Map exactly one WhatsApp number and its exact provider connection through `/api/ghl/mappings`.
4. Send one GHL message and confirm the canonical send path resolves that mapped number.
5. Send one WhatsApp inbound message and use the inbound service hook to deliver it to the mapped GHL conversation.
6. Replay the webhook and confirm the correlation uniqueness constraint prevents duplication.
7. Test an unknown location, wrong workspace, wrong number, and provider mismatch; each must fail closed.
8. Confirm correlation rows contain GHL, canonical, provider, workspace, location, and number identifiers.

Broad delivered/read/failed propagation remains the separate #46 boundary; this pilot stores those correlation statuses for the next status-sync extension.

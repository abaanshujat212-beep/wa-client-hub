# OpenWA automation adapter

OpenWA is a private, unofficial automation engine behind the WA Client Hub API. Customers never receive its URL, API key, session files, or provider identifiers. Manual messaging and voice/video calls continue through the assigned Windows browser; OpenWA handles automated text/media and message events only.

## Risk and tenant boundary

OpenWA is not affiliated with WhatsApp or Meta and automation may cause account restrictions or bans. Use a dedicated non-critical number, send only to opted-in contacts, and never use it for cold outreach. The dashboard requires an explicit acknowledgement before enabling automation.

Each OpenWA runtime has one configured session ID and that external session can map to only one WA Client Hub number. Every lookup checks both workspace and number. Cross-workspace requests return not found without revealing whether another tenant owns the number.

## Docker start

Set unique `OPENWA_API_KEY` and `OPENWA_WEBHOOK_SECRET` values in `.env.docker`, then start the optional profile:

```sh
docker compose --env-file .env.docker --profile openwa up --build -d
docker compose --env-file .env.docker logs -f openwa
```

For initial QR enrollment on the Docker host only, use the loopback-only override and open `http://127.0.0.1:8080` locally:

```sh
docker compose --env-file .env.docker --profile openwa -f compose.yml -f compose.openwa-local.yml up -d openwa
```

After linking, return to the normal command without this override so port 8080 is not published at all.

### macOS and Apple Silicon

Docker Desktop can run the WA Client Hub control plane on macOS, but OpenWA must be validated separately. Upstream Docker Hub currently advertises amd64 and arm64 variants while OpenWA's own Docker documentation warns that Chromium may not run on ARM. This repository also pins a digest, so support advertised for `latest` does not prove that the pinned runtime works natively.

On Apple Silicon, try the normal command first. If the image cannot be pulled for arm64 or Chromium exits, enable Rosetta/x86 emulation in Docker Desktop and add the repository fallback override:

```sh
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml -f compose.openwa-macos-arm64.yml \
  up -d openwa
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml -f compose.openwa-macos-arm64.yml \
  logs -f openwa
```

Emulation is slower and is not a production guarantee. A Mac smoke test must verify QR enrollment, session persistence after restart, send, receive, and webhook delivery. Official Meta and YCloud transports do not use the OpenWA browser container.

The OpenWA image is pinned by digest and the runtime library is pinned to `4.76.0`. Its port is not published in the normal stack. `/sessions` is a named volume so QR linkage survives container recreation. Never expose OpenWA API docs/admin pages publicly.

After adding a WhatsApp number in the dashboard, select **Enable automation**, read the risk warning, and accept it. Enabling registers the internal webhook using `registerWebhook` with `X-Webhook-Secret`.

## Operator checks

1. Confirm PostgreSQL/Redis readiness at `/api/ready`.
2. Confirm OpenWA is reachable only from the internal Docker network.
3. Link a dedicated test number and restart the OpenWA container.
4. Verify its status returns connected after restart.
5. Send and receive a text and a small media file, then verify canonical records.
6. Repeat a webhook ID and idempotency key; verify no duplicate send occurs.

Do not mark a real-number pilot complete until those checks pass. The pinned upstream image reports vulnerable transitive packages during startup install; keep it isolated and treat dependency review as a release gate.

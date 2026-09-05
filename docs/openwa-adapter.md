# OpenWA automation adapter

OpenWA is a private, unofficial automation engine behind the WA Client Hub API. Customers never receive its URL, API key, session files, or provider identifiers. Manual messaging and voice/video calls continue through the assigned Windows browser; OpenWA handles automated text/media and message events only.

## Risk and tenant boundary

OpenWA is not affiliated with WhatsApp or Meta and automation may cause account restrictions or bans. Use a dedicated non-critical number, send only to opted-in contacts, and never use it for cold outreach. The dashboard requires an explicit acknowledgement before enabling automation.

Each OpenWA runtime has one configured session ID and that external session can map to only one WA Client Hub number. Every lookup checks both workspace and number. Cross-workspace requests return not found without revealing whether another tenant owns the number.

## Docker start

Set unique `OPENWA_API_KEY` and `OPENWA_WEBHOOK_SECRET` values in `.env.docker`, then start the optional profile:

```powershell
docker compose --env-file .env.docker --profile openwa up --build -d
docker compose --env-file .env.docker logs -f openwa
```

For initial QR enrollment on the Docker host only, use the loopback-only override and open `http://127.0.0.1:8080` locally:

```powershell
docker compose --env-file .env.docker --profile openwa -f compose.yml -f compose.openwa-local.yml up -d openwa
```

After linking, return to the normal command without this override so port 8080 is not published at all.

The OpenWA image is pinned by digest and the runtime library is pinned to `4.76.0`. Its port is not published. The service has outbound egress for package verification and WhatsApp connectivity, while its API remains reachable only inside Docker. `/sessions` is a named volume so QR linkage survives container recreation. Scan the QR only through trusted operator logs during initial setup; never expose OpenWA API docs/admin pages publicly.

After adding a WhatsApp number in the dashboard, select **Enable automation**, read the risk warning, and accept it. Enabling registers the internal webhook using `registerWebhook` with `X-Webhook-Secret`. This is supported by OpenWA's webhook request configuration and avoids putting the secret in a URL.

## Internal API

- `POST /api/openwa/numbers/:numberId/enable` — workspace manager enables automation and records risk acknowledgement.
- `GET /api/openwa/numbers/:numberId/status` — authorized member reads proxied connection state.
- `POST /api/openwa/numbers/:numberId/send` — sends text with an optional `Idempotency-Key` header.
- `POST /api/openwa/numbers/:numberId/send-media` — sends a small data-URL media payload with an optional idempotency key.
- `POST /api/openwa/webhook` — private verified receiver; no user session or CSRF token is used.

Webhook deliveries are persisted before normalization. The receiver accepts the pinned v4 listener envelope and the current v5 `{webhookId, sessionId, event, payload, timestamp}` envelope, then converts both to the same internal form. Successfully processed duplicates return success without creating another message. Failed receipts are retryable and become dead letters after four processing attempts. Inbound/outbound messages and acknowledgement states are normalized into PostgreSQL contacts, conversations, messages, and message status events.

## Operator checks

1. Confirm PostgreSQL/Redis readiness at `/api/ready`.
2. Confirm OpenWA is reachable only from the internal Docker network.
3. Link a dedicated test number and restart the OpenWA container.
4. Verify its status returns connected after restart.
5. Send and receive a text and a small media file, then verify `messages` and `webhook_receipts` records.
6. Repeat a webhook ID and idempotency key; verify no duplicate message/send occurs.

Do not mark a real-number pilot complete until the QR, restart, send, receive, and delivery-state checks have been performed with a dedicated test number.

The pinned upstream image currently reports vulnerable transitive packages during its own startup install. Keep it isolated, never expose the API, review updated upstream digests before production, and treat dependency scanning/remediation as a release gate. WA Client Hub's own dependency audit is separate.

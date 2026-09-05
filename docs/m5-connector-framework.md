# M5 CRM connector framework

M5 provides the tenant-safe base used by Shopify, GoHighLevel, WooCommerce, and generic CRM adapters.

## Included

- token installation, rotation, revoke, diagnostics, checkpoint, and replay lifecycle;
- AES-256-GCM credential envelopes with connection-bound additional authenticated data and versioned key IDs;
- write-only credentials: list, diagnostics, audit, and API responses expose only `hasCredentials` and `keyId`;
- workspace-scoped repository queries and management authorization;
- signed inbound webhooks with stable external event deduplication;
- durable PostgreSQL outbox with signed delivery, bounded retries, and dead-letter state;
- canonical contact/order/conversation/message event validation;
- connector scopes and field mappings;
- `source_wins`, `latest_wins`, and `manual_review` conflict policies;
- deterministic subject checkpoints for duplicate and out-of-order convergence;
- disconnect cleanup that erases credentials and dead-letters undelivered work.

## Master key

Set `CONNECTOR_MASTER_KEY` to a base64-encoded 32-byte random value and retain it in the deployment secret manager. Set `CONNECTOR_KEY_ID` to the version label. Do not commit either the key or live connector credentials.

PowerShell generation example:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Rotation of individual connector credentials is available now. Master-key re-encryption across key versions should be performed as an operator migration before removing an old key.

## Reference webhook contract

Inbound connector events use `POST /api/connectors/{connectionId}/webhook` with `X-Connector-Signature`, an HMAC-SHA256 hex digest of the exact request body using the installed webhook secret.

Outbound reference delivery posts the canonical event to `{baseUrl}/events` with `Authorization: Bearer ...`, `X-WA-Hub-Event-Id`, and `X-WA-Hub-Signature`. Provider-specific OAuth and payload translators are implemented by the M6 adapters on this shared lifecycle.

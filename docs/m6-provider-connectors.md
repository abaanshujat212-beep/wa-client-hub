# M6 provider connectors

M6 adds provider-specific ingestion on top of the M5 connector runtime.

## Implemented

- Shopify and WooCommerce customer/order normalization, exact raw-body HMAC verification, delivery-id deduplication, order persistence, timelines, and reconciliation batches.
- HighLevel Ed25519 webhook verification, location isolation, contact and conversation/message ingestion.
- Consent-gated order follow-up campaigns; importing an order never creates consent.
- Generic CRM API v1 with workspace-derived API keys, scopes, revocation, idempotency, cursor pagination, and atomic PostgreSQL rate limiting. See `openapi-generic-crm.yaml`.
- WordPress/WooCommerce plugin for signed customer and order deliveries. Its settings page never renders the stored secret and exposes only the last delivery topic/status/time.

## Deployment

Run migration `006_provider_connectors`, configure `CONNECTOR_MASTER_KEY`, then create connector credentials from the Connectors page. Provider webhooks target `/api/providers/{connectionId}/{shopify|woocommerce|ghl}`.

## Acceptance still requiring external systems

Shopify OAuth/store uninstall behavior, HighLevel OAuth and outbound conversation delivery, and a real WooCommerce installation must be exercised with provider sandbox credentials before those GitHub issues are closed. No sandbox acceptance is implied by the local automated tests.

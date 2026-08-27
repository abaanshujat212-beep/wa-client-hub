# Whop billing/membership integration

Whop is supported as a membership/subscription provider alongside:

- manual
- stripe
- swich

## Environment

```env
WHOP_API_BASE_URL=https://api.whop.com/api/v2
WHOP_API_KEY=
WHOP_WEBHOOK_SECRET=
```

## Current implementation

Implemented:

- Whop config helper.
- API key validation helper.
- Whop status mapper into WA Client Hub billing statuses.
- Membership inquiry helper.
- Mounted route module under `/api/billing/whop`:
  - `POST /token-test`
  - `GET /membership/:membershipId`
  - `POST /webhook` placeholder
- Webhook placeholder can update workspace billing status if payload contains `metadata.workspaceId` and `status`.
- Admin dashboard actions:
  - Test Whop API key from Monitoring tab.
  - Check Whop membership by ID from Monitoring tab.
- Tests for Whop helpers and routes.

Still to do:

- Confirm exact Whop membership endpoint/payload for selected API version.
- Verify webhook signature headers.
- Map Whop product IDs to WA Client Hub plan IDs.
- Store Whop customer/member/subscription IDs on workspace or client.

## Status mapping

| Whop status | App status |
| --- | --- |
| active / trialing / valid | active |
| pending / incomplete | pending |
| past_due / payment_failed | past_due |
| canceled / expired / terminated | canceled |
| unpaid | unpaid |

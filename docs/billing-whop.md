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
- Route module with:
  - `POST /token-test`
  - `GET /membership/:membershipId`
  - `POST /webhook` placeholder
- Webhook placeholder can update workspace billing status if payload contains `metadata.workspaceId` and `status`.

Still to do:

- Mount Whop routes in `src/server.js`.
- Confirm exact Whop membership endpoint/payload for the selected Whop API version.
- Verify webhook signature headers.
- Map Whop product IDs to WA Client Hub plan IDs.
- Add admin UI actions.

## Status mapping

| Whop status | App status |
| --- | --- |
| active / trialing / valid | active |
| pending / incomplete | pending |
| past_due / payment_failed | past_due |
| canceled / expired / terminated | canceled |
| unpaid | unpaid |

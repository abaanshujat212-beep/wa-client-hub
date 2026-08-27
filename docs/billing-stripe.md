# Stripe billing foundation

Stripe is supported as a billing provider alongside:

- manual
- whop
- swich

## Environment

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUCCESS_URL=https://your-domain.example.com/billing/success
STRIPE_CANCEL_URL=https://your-domain.example.com/billing/cancel
```

## Current implementation

Implemented:

- Stripe config helper.
- Secret-key validation helper.
- Stripe subscription status mapper.
- App plan -> Stripe lookup key mapper.
- Route module with:
  - `POST /token-test`
  - `POST /checkout` skeleton
  - `POST /webhook` placeholder
- Tests for Stripe helpers and routes.

Still to do:

- Install official `stripe` package.
- Create real Checkout Session using Stripe SDK.
- Verify webhook signatures with raw body.
- Store customer/subscription IDs.
- Map Stripe price/product IDs to app plan IDs.
- Mount Stripe routes in `src/server.js`.

## Plan mapping draft

| App plan | Stripe lookup key |
| --- | --- |
| starter | `wa_starter_monthly` |
| team | `wa_team_monthly` |
| business | `wa_business_monthly` |
| dedicated | `wa_dedicated_monthly` |

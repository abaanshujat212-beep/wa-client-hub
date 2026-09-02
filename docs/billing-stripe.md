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
  - `POST /checkout` creates a subscription Checkout Session from a plan lookup key.
  - `POST /webhook` verifies Stripe signatures and processes Checkout/subscription lifecycle events.
- Tests for Stripe helpers and routes.
- Customer/subscription IDs, plan ID, billing status, and period end are persisted on the workspace.
- Stripe routes are mounted at `/api/billing/stripe`.

Create recurring Stripe prices with the lookup keys below before using checkout. Configure a Stripe webhook for `checkout.session.completed` and `customer.subscription.*` events.

## Plan mapping draft

| App plan | Stripe lookup key |
| --- | --- |
| starter | `wa_starter_monthly` |
| team | `wa_team_monthly` |
| business | `wa_business_monthly` |
| dedicated | `wa_dedicated_monthly` |

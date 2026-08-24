# Stripe billing foundation

WA Client Hub plans should map to Stripe products/prices before selling.

## Plans

Suggested Stripe products:

- Starter
- Team
- Business
- Dedicated

Suggested app mapping:

| App plan | Stripe lookup key | Limits |
| --- | --- | --- |
| starter | `wa_starter_monthly` | 1 workspace, 1 number, 1 user |
| team | `wa_team_monthly` | 1 workspace, 3 numbers, 3 users |
| business | `wa_business_monthly` | 3 workspaces, 10 numbers, 10 users |
| dedicated | custom/manual | custom limits + VM |

## Environment

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUCCESS_URL=https://your-domain.example.com/billing/success
STRIPE_CANCEL_URL=https://your-domain.example.com/billing/cancel
```

## Billing data to store

Add these fields later on workspace/client:

- `stripeCustomerId`
- `stripeSubscriptionId`
- `billingStatus`
- `currentPeriodEnd`
- `planId`
- `customLimits`

## Webhooks to handle

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

## Enforcement

If billing status is unpaid/canceled:

- allow login
- show billing warning
- block adding new users/numbers
- optionally block launching WhatsApp after grace period

## Implementation order

1. Add Stripe dependency.
2. Add checkout session endpoint.
3. Add webhook endpoint with raw body verification.
4. Store customer/subscription IDs.
5. Sync Stripe status to workspace billing status.
6. Enforce billing status in workspace/account/member creation.
7. Add billing UI page.

# Billing provider foundation

WA Client Hub supports a common billing model so multiple providers can plug in cleanly.

## Providers

```text
manual
stripe
whop
swich
```

## Billing statuses

```text
manual
trialing
active
pending
past_due
canceled
unpaid
```

## Resource enforcement

Allowed to use existing workspace:

- `manual`
- `trialing`
- `active`
- `pending`

Allowed to add paid resources like users/numbers:

- `manual`
- `trialing`
- `active`

Blocked for new users/numbers:

- `past_due`
- `canceled`
- `unpaid`

## Workspace billing fields

- `billingProvider`
- `billingStatus`
- `billingCustomerId`
- `billingSubscriptionId`
- `billingPlanId`
- `currentPeriodEnd`

## Provider modules

Provider-specific modules should only handle:

- creating checkout/payment sessions
- verifying webhooks
- mapping provider statuses into app billing statuses

The app should enforce access only through the common billing fields above.

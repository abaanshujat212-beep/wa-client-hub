# Swich billing/payment integration

Swich developer entry point:

- https://swichnow.io/developers/api-documentation
- API docs link from Swich site: https://api-docs.swichnow.com/

Swich supports payment APIs for:

- PayIn
- PayOut
- BillOut

For WA Client Hub, we should start with **PayIn** for customer payments/subscriptions or payment links.

## App billing provider model

WA Client Hub should support multiple billing providers:

```text
manual
stripe
whop
swich
```

Suggested workspace/client billing fields:

- `billingProvider`: `manual | stripe | whop | swich`
- `billingCustomerId`
- `billingSubscriptionId`
- `billingStatus`: `trialing | active | past_due | canceled | unpaid | manual`
- `billingPlanId`
- `currentPeriodEnd`
- `customLimits`

## Environment

Add later when implementing Swich:

```env
SWICH_API_BASE_URL=https://api-docs.swichnow.com
SWICH_API_KEY=
SWICH_WEBHOOK_SECRET=
SWICH_SUCCESS_URL=https://your-domain.example.com/billing/success
SWICH_CANCEL_URL=https://your-domain.example.com/billing/cancel
```

Exact auth/header names should be confirmed from Swich API docs or merchant dashboard.

## Implementation plan

1. Confirm Swich merchant/API credentials.
2. Confirm PayIn endpoint for payment/checkout creation.
3. Confirm webhook event format and signature verification.
4. Add Swich provider module:
   - create payment/checkout
   - verify webhook
   - map payment status to app billing status
5. Add webhook route:
   - `/api/billing/swich/webhook`
6. Add billing provider mapping:
   - Swich product/plan -> WA Client Hub plan
7. Enforce billing status:
   - active/manual: allow normal use
   - past_due/unpaid/canceled: block new users/numbers
8. Add admin UI field showing provider/status.

## Status mapping draft

| Swich status | App status |
| --- | --- |
| paid/success | active |
| pending | trialing/pending |
| failed | past_due |
| canceled/expired | canceled |

Final mapping must follow actual Swich webhook payload names.

## Notes

- Do not store card/payment secrets in WA Client Hub.
- Use HTTPS for webhook endpoint.
- Log webhook event IDs and status changes in audit logs.
- Keep Stripe and Whop provider docs separate; Swich is another provider option, not a replacement unless selected by admin.

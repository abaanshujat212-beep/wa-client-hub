# Swich billing/payment integration

Swich Payment APIs v2.0.0 use OpenAPI 3.0.3.

## Environments

| Environment | Main API | Auth | Card checkout |
| --- | --- | --- | --- |
| Sandbox | `https://sandbox-api.swichnow.com` | `https://sandbox-auth.swichnow.com` | `https://sandbox-api.checkout.swichnow.com` |

Auth flow:

1. Call `POST /connect/token` on the auth server.
2. Use the returned `access_token` as Bearer token for API calls.

## Supported payment channels

| Channel | Redirect Gateway | Direct API | Recurring |
| --- | --- | --- | --- |
| Card | Yes, via Landing Page | `POST /api/Payment/PaymentV2`, capture/reversal/inquire/token APIs | Yes |
| E-Wallet | Yes | `POST /gateway/payin/v2.0/purchase/ewallet` | Not documented |
| 1Bill / Biller | Yes | `POST /gateway/payin/v2.0/purchase/biller` | Not documented |
| Bank | Yes | `/gateway/payin/get/banks`, `/v2.0/bank/otp`, `/v2.0/bank/transfer` | Not documented |
| QR | Yes | `/gateway/payin/v2.0/purchase/qr/dynamic/*` | Not documented |
| RTP | Yes | `/gateway/payin/v2.0/purchase/rtp/*` | Not documented |
| Payout | No | `/gateway/payout/*` | No |
| Remittance | No | `/gateway/payout/Remittance/*` | No |

## WA Client Hub recommended Swich flow

For the first implementation, use **Card redirect/Landing Page** or **Card PaymentV2** because card supports recurring payments.

Preferred order:

1. Sandbox OAuth/token helper.
2. PayIn card payment creation.
3. Payment inquiry/status sync.
4. Optional recurring card flow using `isRecurringPayment`.
5. Webhook/status mapping once Swich webhook payload is confirmed.

## App billing provider model

WA Client Hub should support:

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
- `billingStatus`: `trialing | active | pending | past_due | canceled | unpaid | manual`
- `billingPlanId`
- `currentPeriodEnd`
- `customLimits`

## Environment variables

```env
SWICH_API_BASE_URL=https://sandbox-api.swichnow.com
SWICH_AUTH_URL=https://sandbox-auth.swichnow.com
SWICH_CHECKOUT_URL=https://sandbox-api.checkout.swichnow.com
SWICH_CLIENT_ID=
SWICH_CLIENT_SECRET=
SWICH_WEBHOOK_SECRET=
SWICH_SUCCESS_URL=https://your-domain.example.com/billing/success
SWICH_CANCEL_URL=https://your-domain.example.com/billing/cancel
```

Exact client credentials and webhook secret names should match the Swich merchant dashboard.

## Endpoints to implement in WA Client Hub

- `POST /api/billing/swich/token-test` — admin-only sandbox auth check.
- `POST /api/billing/swich/checkout` — create Swich payment/checkout for workspace plan.
- `POST /api/billing/swich/webhook` — receive Swich events.
- `GET /api/billing/swich/inquire/:transactionId` — admin-only payment inquiry.

## Status mapping draft

| Swich status | App status |
| --- | --- |
| paid / success / captured | active |
| pending / initiated | pending |
| failed | past_due |
| canceled / expired / reversed | canceled |

Final status names must follow real Swich response payloads.

## Enforcement

If billing status is unpaid/canceled/past_due:

- allow login
- show billing warning
- block adding new users/numbers
- optionally block launching WhatsApp after grace period

## Notes

- Do not store card/payment secrets in WA Client Hub.
- Use HTTPS for webhook endpoint.
- Log webhook event IDs and status changes in audit logs.
- Swich is an additional provider option, alongside Stripe, Whop, and manual billing.

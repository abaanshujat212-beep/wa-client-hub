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

## Current implementation status

Implemented:

- Swich sandbox config helper.
- OAuth token helper for `POST /connect/token`.
- Swich status mapper.
- Swich route module with:
  - `POST /token-test`
  - `POST /webhook` placeholder
- Tests for config/status mapping and route module.

Still to wire:

- Mount route module in `src/server.js` under `/api/billing/swich`.
- Add checkout/payment creation route.
- Add payment inquiry route.
- Verify webhook signature once payload format is confirmed.

## App billing provider model

WA Client Hub supports:

```text
manual
stripe
whop
swich
```

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

## Enforcement

If billing status is unpaid/canceled/past_due/pending:

- allow login
- show billing warning
- block adding new users/numbers

## Notes

- Do not store card/payment secrets in WA Client Hub.
- Use HTTPS for webhook endpoint.
- Log webhook event IDs and status changes in audit logs.

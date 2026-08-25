# Swich billing/payment integration

Swich Payment APIs v2.0.0 use OpenAPI 3.0.3.

## Current implementation status

Implemented:

- Swich sandbox config helper.
- OAuth token helper for `POST /connect/token`.
- Card PayIn creation helper using `POST /api/Payment/PaymentV2`.
- Payment inquiry helper using `GET /api/Payment/Inquire?transactionId=...`.
- Swich status mapper.
- Mounted Swich routes under `/api/billing/swich`:
  - `POST /token-test`
  - `POST /checkout`
  - `GET /inquire/:transactionId`
  - `POST /webhook` placeholder
- Admin dashboard actions:
  - Test Swich token from Monitoring tab.
  - Create Swich checkout from workspace cards.
- Tests for config/status mapping and route module.

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

## Notes

- Confirm exact Swich checkout response fields before production.
- Store Swich transaction IDs after adding payment records.
- Verify webhook signature once payload format is confirmed.

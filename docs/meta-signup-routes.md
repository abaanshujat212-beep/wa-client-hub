# Meta Embedded Signup and lifecycle callbacks

## Current runtime

The package composes POST `/api/meta/signup/start`, `/api/meta/signup/complete`, and `/api/meta/signup/cancel` through `src/main.js`. `META_SIGNUP_ENABLED` remains default-off. Disabled requests receive a non-disclosing 404 without constructing PostgreSQL, provider, vault, or timer dependencies.

The browser keeps the durable signup state until completion, explicit cancellation, or a terminal failure. The Meta `FINISH` message and the `FB.login` OAuth callback are treated as independent inputs: either may arrive first, and completion is submitted once only after the authorization code, WABA ID, and phone-number ID are all present. Meta `CANCEL` messages are diagnostic/intermediate signals; popup dismissal is determined from the `FB.login` callback and a short ordering grace period.

## Security and verification

- Existing persisted session ID/user and 48-hex CSRF token; constant-time header comparison.
- Exact configured HTTPS Origin on all signup POSTs; no wildcard, null, missing origin, or Host-derived trust.
- Fresh active actor from PostgreSQL plus current workspace management authorization and locked recheck after exchange.
- JSON only, 16 KiB maximum, strict allowlists, no actor/workspace completion overrides and `Cache-Control: no-store`.
- Atomic PostgreSQL fixed-window limits: 5 starts and 10 completions per actor per ten minutes, shared across sessions/processes/workspaces. Rejection is 429 with Retry-After; DB failure is fixed 503.
- Completion exchanges the code with Meta, fetches the authenticated Meta user, verifies the submitted phone number belongs to the submitted WABA, and persists the verified assets only inside the authorized workspace transaction.
- Browser diagnostics record only event names, origins, safe status/reason codes, and boolean availability flags. They never record auth codes, access tokens, app secrets, or raw error messages.

## Meta lifecycle callbacks

These are separate from Embedded Signup completion:

- `POST https://wa.10xcollab.com/meta/deauthorize`
- `POST https://wa.10xcollab.com/meta/data-deletion`

Both accept Meta's form-encoded `signed_request`, verify its HMAC-SHA256 signature with `META_APP_SECRET`, require a numeric app-scoped `user_id`, and fail closed on invalid signatures. Deauthorization revokes only `whatsapp_cloud` connections linked to that exact Meta user, clears stored credentials, disables number automation, and records an audit event. Data deletion performs the same connection revocation, records a deletion request, and returns Meta's required `{ url, confirmation_code }` response. No signed-request payload is logged or returned.

## Final Meta dashboard values

- Allowed JavaScript SDK domain: `https://wa.10xcollab.com`
- WhatsApp webhook: `https://wa.10xcollab.com/webhooks/meta/whatsapp`
- Deauthorize callback: `https://wa.10xcollab.com/meta/deauthorize`
- Data Deletion Request URL: `https://wa.10xcollab.com/meta/data-deletion`

The current implementation uses Meta Embedded Signup through `FB.login` with `config_id`, `response_type: 'code'`, and `override_default_response_type: true`; it does not introduce or require a separate OAuth redirect route. Configure a Valid OAuth Redirect URI only if a different Meta product or configuration explicitly requires one.

## Cleanup

Enabled runtime runs one bounded cleanup and repeats every five minutes by default. Each pass deletes at most 500 expired signup states and 500 expired rate-limit buckets using database time and `SKIP LOCKED`; valid states, live counters, connections, numbers, messages, and audits are untouched.

Before enabling the switch: complete owner Meta Embedded Signup configuration, live test-asset E2E, proxy/session/cookie review, secret rotation, callback verification, cleanup monitoring, and provider lifecycle/reconnect/activation review. No deployment value is changed by this change.

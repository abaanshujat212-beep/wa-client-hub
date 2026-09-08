# Protected signup router and cleanup — #24 / #32 / #31

## Current status

The package composes POST `/api/meta/signup/start` and `/api/meta/signup/complete` through `src/main.js`, but `META_SIGNUP_ENABLED` remains exactly default-off. Disabled requests receive a non-disclosing 404 without constructing PostgreSQL, provider, vault, or timer dependencies. When explicitly enabled, bounded cleanup starts only after successful HTTP startup. No deployment value is changed; connections remain `connecting` with automation disabled.

## HTTP and rate contract

- Existing persisted session ID/user and 48-hex CSRF token; constant-time header comparison.
- Exact configured HTTPS Origin on both POSTs; no wildcard, null, missing origin or Host-derived trust.
- Fresh active actor from PostgreSQL plus current workspace management authorization and locked recheck after exchange.
- JSON only, 16 KiB maximum, strict allowlists, no actor/workspace completion overrides and `Cache-Control: no-store`.
- Atomic PostgreSQL fixed-window limits: 5 starts and 10 completions per actor per ten minutes, shared across sessions/processes/workspaces. Rejection is 429 with Retry-After; DB failure is fixed 503, never memory allow-on-error.
- The main composition adds a narrow error boundary so its earlier global JSON parser cannot return unsanitized malformed/oversized signup errors.

## Cleanup

Migration 010 stores only hashed expiring rate keys. Enabled runtime runs one bounded cleanup and repeats every five minutes by default (allowed interval: one minute to one hour). Each pass deletes at most 500 expired states and 500 expired buckets using database time and `SKIP LOCKED`; valid states, live counters, connections, numbers, messages and audits are untouched. Errors are logged with a fixed message and timestamp-only status. `npm run meta-signup:cleanup` remains a finite operational fallback.

## Verification and boundaries

Unit tests cover token/origin/body/config validation, default-off dependency isolation and package composition. PostgreSQL tests use two servers, independent pools and persisted sessions for authorization, session binding, cross-process quotas, DB failure, expiry and concurrent cleanup. The enabled runtime is constructed against migrated PostgreSQL and its cleanup lifecycle tested. Provider exchange/encryption are fixtures.

Before any deployment enables the switch: complete owner Meta Embedded Signup v4 configuration, live test-assets E2E, proxy/session/cookie review, secret rotation, cleanup monitoring and provider lifecycle/diagnostics/reconnect/activation. Other legacy authorization and workspace/member quotas remain separate. No merge/deployment/activation/mobile/calling; #51 still gates #55.

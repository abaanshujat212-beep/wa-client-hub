# Protected signup router and cleanup — #24 / #32 / #31

## Current status

`createMetaSignupRouter` composes the durable state, database authorization, installation and new protections into POST `/start` and `/complete`. It is disabled unless `enabled` is explicitly boolean `true`. This slice does NOT mount it in `src/server.js`, change deployment settings, schedule a job, or enable customers. Mounting is a separate reviewed integration step; provider lifecycle/owner configuration/live E2E remain gates.

The intended future mount is `/api/meta/signup`, after the application's persisted-session middleware. Pass the shared PostgreSQL pool, an instantiated Meta signup service, server-side credential vault and one exact HTTPS application origin. Do not pass cached Store authorization. Disabled factories return 404 without accessing dependencies; enabled factories reject incomplete configuration.

## HTTP contract

- Uses existing `req.session.userId`, `req.sessionID`, `req.session.csrfToken` and `x-csrf-token` conventions. The 48-hex token is checked with constant-time equality; it is not accepted from the body/query.
- Requires the exact configured HTTPS Origin on both POST endpoints; no wildcard, null, missing-origin or host-header-derived trust.
- Reads the current active actor from PostgreSQL, overwriting any cached request user. Handlers also check current management permission; installation rechecks under locks after exchange.
- JSON only, 16 KiB maximum and strict field allowlists. Start: `workspaceId`, `label`. Complete: `state`, `code`, `businessAccountId`, `phoneNumberId`. Actor/workspace overrides on completion are rejected.
- Responses are `Cache-Control: no-store`. Invalid sessions get 401, CSRF/origin failures 403, invalid JSON/fields 400, oversized requests 413, wrong content type 415. Protection database failures return a fixed 503 without exposing error details.
- The main server's current global CSRF guard remains in place when mounted; no new webhook exemption is needed or added. The router also enforces its own guard.

## Shared rate policy

Migration 010 adds indexed expiring buckets. Admission is an atomic PostgreSQL upsert keyed by a hash of actor/action. Default: 5 starts and 10 completions per actor per ten-minute fixed window, shared across processes, sessions and workspaces. New sessions and spoofed proxy/IP headers do not reset actor quota. Rejected requests do not extend the window.

Limits apply before state creation/consumption and external exchange. Malformed authenticated requests consume quota; invalid sessions and CSRF/origin failures do not create buckets. Rate rejection is 429 with `Retry-After`. There is no in-memory allow-on-error fallback. Edge/IP abuse controls and trusted proxy configuration remain separate deployment controls; fixed windows can admit bursts around a boundary.

## Expiry cleanup

After migrations, an operator can run `node scripts/cleanup-meta-signup.js`. Each finite invocation removes at most 500 expired signup states and 500 expired rate buckets. It uses database time and row locks with SKIP LOCKED so overlapping cleaners do not delete valid states or active buckets. It never deletes connections, numbers, messages or installation audits. Output is counts only; errors are sanitized and exit nonzero. Each statement has a 15-second timeout.

Schedule this command externally (for example every five minutes) and monitor failures/backlog before enabling signup. No scheduler is installed by this PR. Expired states are unusable even if cleanup is delayed; the job is retention/housekeeping, not replay protection. Capacity planning must account for the batch bound.

## Tests and boundaries

Pure tests cover token/origin/body validation, hashed limiter keys, fail-closed errors and bounded cleanup. The PostgreSQL HTTP test uses the actual router, two servers, independent pools and persisted sessions. It covers auth/CSRF/origin failures, active-user revocation, strict parsing, session binding, one successful disabled installation, cross-session/process quotas, restart-session resistance, database failure, window expiry, concurrent cleaners and preservation of live records.

Provider exchange and encryption are fixtures, not live provider/cryptographic E2E. Main-server mounting, scheduled execution, owner v4 launcher configuration, lifecycle/activation checks and deployment security review remain outstanding. Other legacy route authorization and workspace/member quotas are outside this slice. No merge/deployment/activation/mobile/calling; #51 still gates #55.

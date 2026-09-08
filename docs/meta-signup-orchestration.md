# Meta signup orchestration hardening — #24 / #32 / PR #67

This is an internal, unmounted foundation. It does not enable customer signup, activate connections, or complete the Meta/GHL pilot.

## Durable one-time claim

Migration 009 creates `meta_signup_states`. Only SHA-256 hashes of the random 256-bit state and authenticated session ID are stored, alongside actor/workspace/label and a database-clock expiry (ten minutes maximum). The repository must receive an autocommit pool, not a client inside the installation transaction.

Completion atomically deletes and returns one unexpired row matching the state hash, session hash and authenticated actor. This commits before Meta code exchange. Independent HTTP requests/processes using the same persisted session cannot both claim the state. The authoritative workspace and label come from that row, never completion-body overrides or an in-memory session copy.

Claims remain spent after provider/install failure. A crash after claim does not automatically repeat an ambiguous Meta exchange. Start a new signup; use future diagnostics/reconciliation before repeating an ambiguous completed installation. Expired claims cannot be used. Schedule expiry cleanup before exposing start routes (bounded retention/rate limits remain part of the route gate).

## Failure and audit behavior

HTTP failures use a fixed allowlist of codes/messages/statuses. Unexpected database/network errors become a generic response; raw error messages, status overrides, provider bodies and credentials are not returned. Installation output is projected to public canonical connection/number fields.

When signup supplies `actorId`, the connection, number and `meta.connection.installed` audit record commit in the same transaction. Audit failure rolls the installation back. The orchestrator no longer calls `PostgresStore.addAudit`, which writes an old full-store snapshot and can delete direct-SQL number inserts.

**Unresolved storage gate:** other legacy store mutations still reconcile whole snapshots through `replaceLegacyState`, including deletion of numbers/audits absent from those snapshots. The change here prevents the immediate post-install audit overwrite; it does NOT solve the broader mixed snapshot/direct-SQL storage architecture. Resolve and regression-test that interaction under existing #24/#32 before mounting signup routes. Do not claim installed connections survive every legacy mutation yet.

## Verification

- Node unit tests: state binding, independent handler/session copies, replay, expiry, unauthorized/revoked access, wrong session/actor, redacted failures, safe projection, transactional audit rollback and existing internal install compatibility.
- PostgreSQL integration: isolated schema, migration rerun, two HTTP servers sharing PostgreSQL-backed sessions and independent pools, one provider exchange/connection/number/audit, repeat/expired/revoked rejection. Provider exchange and encryption are fixtures; this is NOT a live Meta or cryptographic integration test.
- The HTTP harness is test-only. It verifies fixture auth/CSRF middleware, not production route mounting.

## Remaining gates (existing issues, not new work items)

- #24/#32: snapshot/direct-SQL compatibility; mounted authenticated/CSRF-protected routes; fresh authorization and transactional number/plan-limit enforcement; rate limits and expired-state cleanup.
- #33/#37/#48: Embedded Signup v4 launcher/configuration, authorized test assets and owner setup.
- #41: diagnostics, token lifecycle/rotation, disconnect/reconnect and verified activation.
- #40/#39/#25: authenticated ingestion/status and full messaging policy/media/template support before sends are enabled.
- #31/#36: security review, deployment and actual provider E2E evidence.

New connections remain `connecting`, with automation disabled. No mobile/calling implementation is included; #51 still gates #55.

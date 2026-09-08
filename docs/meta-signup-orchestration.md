# Meta signup orchestration hardening — #24 / #32 / PR #67

This is an internal, unmounted foundation. It does not enable customer signup, activate connections, or complete the Meta/GHL pilot.

## Durable one-time claim

Migration 009 creates `meta_signup_states`. Only SHA-256 hashes of the random 256-bit state and authenticated session ID are stored, alongside actor/workspace/label and a database-clock expiry (ten minutes maximum). The repository must receive an autocommit pool, not a client inside the installation transaction.

Completion atomically deletes and returns one unexpired row matching the state hash, session hash and authenticated actor. This commits before Meta code exchange. Independent requests sharing a persisted session cannot both claim the state. Workspace and label come from that row, not completion-body overrides.

Claims remain spent after provider/install failure. A crash after claim does not automatically repeat an ambiguous exchange. Start a new signup; future diagnostics/reconciliation must handle ambiguous completed installations. Expired claims cannot be used. Schedule expiry cleanup and rate limits before exposing start routes.

## Failure and audit behavior

HTTP failures use fixed public codes/messages/statuses. Unexpected database/network errors become a generic response. Raw errors, provider bodies and credentials are not returned. Installation output is projected to public canonical connection/number fields.

When signup supplies `actorId`, connection, number and installation audit commit in one transaction. Audit failure rolls installation back. The orchestrator does not call the legacy snapshot-based audit path.

The follow-up storage slice replaces runtime snapshot reconciliation with targeted deltas, including startup. Unknown direct-SQL records and provider-owned columns are not deleted or rewritten by ordinary legacy mutations; audit trimming is display-only. See [Runtime PostgreSQL delta persistence](legacy-delta-storage.md) for regression coverage and remaining limits. Administrative import/restore retains its explicit replacement behavior.

## Verification boundaries

- Unit tests cover binding, replay, expiry, unauthorized/revoked access, wrong session/actor, redacted failures, safe projection and atomic audit rollback.
- PostgreSQL signup tests use two HTTP servers with shared persisted sessions and independent pools. Provider exchange and encryption are fixtures, not live Meta or cryptographic validation.
- Storage integration covers direct Meta records and canonical children surviving ordinary writes, racing inserts, independent stores and restart; intentional deletes, stale conflicts, rollback and nested invite mutations.
- The HTTP harness is test-only, not production route mounting.

## Remaining gates

- #24/#32/#31: fresh database-backed authorization; transactional number/plan limits shared with Meta installation; authenticated/CSRF-protected routes; rate limits and expired-state cleanup. Refresh-before-write alone is not aggregate-limit locking.
- #33/#37/#48: Embedded Signup v4 launcher/configuration and owner test assets.
- #41: diagnostics, token lifecycle/rotation, disconnect/reconnect and verified activation.
- #40/#39/#25: ingestion/status and full messaging policy/media/template support before sends are enabled.
- #31/#36: security review, deployment and actual provider E2E evidence.

Connections remain `connecting`, with automation disabled. No mobile/calling implementation is included; #51 still gates #55.

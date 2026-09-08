# Runtime PostgreSQL delta persistence — #24 / #32

## Problem and change

`PostgresStore` previously called `replaceLegacyState` after every mutation and during startup. That wrote the entire in-memory snapshot and deleted database IDs absent from it. A provider installation or audit record created directly in SQL could disappear; deleting a number could cascade to its conversations/messages.

Runtime startup and mutations now use `applyLegacyDelta`:

- Refresh the legacy projection before each outer mutation; preserve nested invite/member behavior and the per-process mutation queue.
- Compare before/after records by ID using a fixed table/column allowlist.
- Insert only new records, update only changed legacy-owned columns, and delete only IDs explicitly removed by that mutation, in child-first order.
- Never rewrite provider credentials, provider-number mappings, automation flags or canonical messaging tables.
- Guard updates with the old changed-field values plus applicable workspace/owner identity. A missing/reassigned/concurrently changed row fails with `LEGACY_WRITE_CONFLICT` instead of being recreated or silently overwritten.
- Keep audit history append-only. The 500-entry legacy display cap is not a durable retention policy.
- Commit or roll back each delta transaction atomically using the existing legacy/import advisory-lock key.

Direct-SQL inserts do not need this advisory lock for preservation: unknown rows are not targeted even if inserted between the snapshot read and commit. Unchanged fields do not overwrite concurrent provider changes. The administrative JSON import/restore method remains available and potentially destructive by explicit operator request; runtime code no longer calls it.

## Validation

Unit tests cover no-op snapshots, audit trimming, scoped updates/deletes, fixed provider-column boundaries, parent-order inserts, conflicts, rollback and invalid IDs.

The isolated PostgreSQL test exercises actual PostgresStore mutations after Meta installation, an insert between snapshot load and commit, two store instances, concurrent audit writers, duplicate-number detection after refresh, preservation of number mappings/conversations/messages/statuses/attachments, intentional legacy number deletion, stale same-field conflict, multi-write rollback, nested invite acceptance and restart. Meta encryption is a fixture in this storage test, not a cryptographic or live-provider test.

## Remaining limits before signup route mounting

This fixes destructive runtime snapshot reconciliation, not the entire concurrency/auth architecture. In particular:

- Synchronous route authorization reads can still use cached membership/account state; use fresh database-backed authorization for signup start/completion.
- Refresh-before-mutation is not a transactional aggregate limit lock. Concurrent resource creation needs shared workspace/plan-limit enforcement, including the direct Meta installation path.
- Simultaneous first-time bootstrap/import conflicts fail rather than silently overwriting; automatic reconciliation is not implemented.
- Audit retention/deletion must be implemented as an explicit policy, not as a side effect of reading/displaying history.
- `loadLegacyState` remains an in-memory compatibility projection, not a fully native multi-process repository API.

Signup routes remain unmounted and Meta connections inactive. Continue auth/limits/rate-limit/expiry-cleanup gates under the existing #24/#32/#31 issues. #51 still gates #55.

# Signup authorization and number admission — #24 / #32 / #31

## Scope

Signup handlers now require an explicit `authorization` dependency. Wire `new NumberCreationPolicy(pool)` rather than the synchronous legacy Store. It queries the authenticated actor ID against current users, active workspace and owner/admin membership (or current active platform-admin role). Cached request roles cannot authorize access.

Checks run at start and after consuming a durable state, before external exchange. Installation then repeats authorization under row locks after exchange. Revocation during the provider request therefore prevents the connection/number/audit transaction; the state stays spent. No database transaction is held across provider I/O. A state may be issued just before revocation, but completion checks it again.

`MetaConnectionRepository.install` now requires `actorId`; omitting it is no longer a trusted-service bypass. Authenticated routes must derive it from the session, never a request-body actor override.

## Atomic number admission

Both Meta installation and runtime legacy delta insertion take the existing legacy/import transaction advisory lock (90421032), then check the current workspace/plan/count before inserting. Workspace and plan rows remain locked through commit; Meta also locks the actor and qualifying membership. Later revocations wait for an already-authorized installation transaction to finish; revocations committed earlier are observed and rejected.

- Workspace must be active.
- Billing must allow adding paid resources: manual, trialing or active, matching existing billing policy. Pending, past_due, canceled, unpaid and unknown/missing states are rejected.
- Every stored number consumes a slot, including disabled/connecting numbers, across both providers.
- The configured nonnegative integer number limit is enforced without a default-plan fallback.
- Normalized phone duplicates in the same workspace are rejected inside the same transaction.
- Failure rolls back provider connection, number and installation audit together.

The shared lock is deliberately coarse to match existing legacy persistence; it serializes number admission across workspaces. Do not replace it independently on one path. Future per-workspace lock optimization requires a consistent migration of all writers and lock ordering.

## Verification

Unit tests cover role spoofing, missing actor, locks, inactive actors/workspaces, revoked membership, billing states, limits and duplicate numbers, plus existing signup replay/redaction and storage behavior.

The PostgreSQL signup suite uses persisted sessions across two test HTTP servers and database-backed authorization. It tests downgraded membership and inactive users before exchange, revocation during exchange, cross-workspace rejection, state replay/expiry and one successful installation. The number-admission suite races Meta/legacy, Meta/Meta and legacy/legacy creation for a single slot using actual PostgresStore mutations, checks no orphan connections/audits, tests blocked billing and suspended workspaces, and verifies platform-admin behavior. Provider exchange/encryption remain fixtures.

## Remaining boundaries

- Routes remain unmounted. Production auth/session/CSRF wiring, rate limits and expired-state cleanup still need implementation and review.
- Legacy route authorization still uses its existing synchronous cache; this slice replaces signup authorization, not every legacy route.
- Shared admission covers the two runtime PostgreSQL number creation paths. Administrative snapshot import/restore and arbitrary SQL are not policy-safe APIs and must remain operator-controlled/offline; JSON-only mode is not a multi-process admission system.
- Workspace-count and member-count quotas are separate work; this slice enforces each workspace's plan number allowance, not all aggregate quotas.
- Plan downgrades may put an existing workspace over quota; further additions are blocked, not existing numbers automatically deleted.
- No live provider E2E, deployment, connection activation, mobile or calling. #51 still gates #55.

# GHL auto-provisioning and embedded workspace access

This branch adds a tenant-safe GHL onboarding path without changing Meta/YCloud provider adapters or Calling defaults.

## Install flow

1. A signed-in WA Client Hub user starts HighLevel OAuth.
2. The server stores a single-use OAuth state. The browser does not supply the tenant identity.
3. The OAuth token response is treated as the source of truth for `locationId`, `companyId`, and `userId` when present.
4. The server may fetch the verified GHL user profile to obtain email/name/role. Missing identity fields do not get guessed.
5. A PostgreSQL advisory lock on the verified location prevents duplicate first-install workspaces.
6. The existing active `ghl_installations` row is reused for reconnects; a different verified company for the same location fails closed.
7. The installation, workspace, external user link, role snapshot, scopes, and encrypted credentials are written transactionally.

If GHL does not provide a user email, a secure fallback uses the signed-in WA Client Hub installer as the initial workspace owner. A newly created external user receives a random unusable password hash and must use the one-time activation flow.

## Embedded SSO

The custom page is `/ghl-embedded.html`. It posts a short-lived HS256 assertion to `/api/ghl/embedded/session`. Configure `GHL_EMBEDDED_SIGNING_SECRET` only when the Marketplace/custom-page integration is configured to produce the corresponding signed context. Assertions require `locationId`, `userId`, `nonce`, `iat`, and `exp`; the server checks the exact location installation, external user link, workspace membership, expiry, and nonce replay before creating a 30-minute WA Client Hub session.

Raw browser `locationId`, `userId`, role, workspace, and number parameters are never authorization assertions.

## Password activation

Workspace managers can generate a 30-minute `/activate.html?token=...` link. The token is stored only as a SHA-256 hash, consumed under a row lock, and replaced by the existing bcrypt password hash on completion. No plaintext password is generated or logged.

## Number assignment

`whatsapp_number_assignments` reuses `workspaces`, `workspace_members`, and `whatsapp_numbers` through composite foreign keys. The partial unique index `uq_active_number_assignment_user` enforces one active number per workspace user. Assignment and move endpoints lock the active row and commit replacement atomically. Cross-workspace numbers and users are rejected.

The current branch adds assignment controls to the existing dashboard. Provider creation remains on the existing Meta/YCloud/legacy routes; no first-number or first-provider fallback was added.

## Manual configuration still required

- Configure the Marketplace custom page to load `/ghl-embedded.html`.
- Configure the official GHL signed-context mechanism and set `GHL_EMBEDDED_SIGNING_SECRET` in the server secret store.
- Run `npm run db:migrate`.
- Complete one real private install and confirm the exact location, company, user, membership, mapping, and activation behavior.
- Keep Calling, video, recording, and transcription flags unchanged and disabled by default.

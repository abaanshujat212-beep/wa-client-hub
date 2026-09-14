# GHL auto-provisioning and embedded workspace access

This branch adds a tenant-safe GHL onboarding path without changing Meta/YCloud provider adapters or Calling defaults.

## Official Marketplace install flow

HighLevel's current Marketplace OAuth documentation shows an app installation URL based on `/oauth/chooselocation`. After the user selects and authorizes a location, HighLevel redirects to the registered callback with an authorization `code`; the standard Marketplace example does not guarantee that a caller-supplied OAuth `state` is returned. HighLevel also documents the signed App Install webhook, automatically subscribed when a webhook URL is configured.

For this reason, the first-install path does **not** make `state` optional without protection. Configure the App Install webhook to:

```text
https://wa.10xcollab.com/webhooks/ghl/install
```

The signed webhook is stored as a short-lived, one-time correlation record containing the official `appId`, `companyId`, `locationId`, `userId`, `webhookId`, and event timestamp. The no-session callback then exchanges the code, derives the verified token/profile identity, and consumes only a matching signed event for the configured `GHL_APP_ID`. Browser query-string identity fields are ignored.

The correlation is exact on app, company, location, and GHL user. A missing, stale, replayed, mismatched, or unsigned event fails closed. `GHL_APP_ID` must be configured before accepting first Marketplace installs.

For a private, time-bounded test before the App Install webhook is available, `GHL_ALLOW_UNCORRELATED_FIRST_INSTALL=true` permits first-install provisioning from token-derived HighLevel company, location, and user identity. This reduces install-correlation protection and must remain `false` for Marketplace production installs.

## OAuth flows

### Existing WA Client Hub reconnect

1. A signed-in WA Client Hub user starts `/oauth/crm/start`.
2. The server stores a single-use OAuth state.
3. HighLevel returns to `/oauth/crm/callback?code=...&state=...`.
4. The existing state is claimed and the existing workspace is reused.

### First Marketplace install

1. A customer uses the official HighLevel Marketplace installation URL.
2. HighLevel sends the signed App Install webhook to `/webhooks/ghl/install`.
3. HighLevel redirects the browser to `/oauth/crm/callback?code=...` without requiring a prior WA Client Hub session.
4. The server exchanges the code and uses token/profile-derived `locationId`, `companyId`, and `userId`.
5. The server consumes the exact signed App Install correlation and runs the existing transactional workspace provisioning, user linking, role mapping, and credential storage flow.

The callback never trusts `locationId`, `companyId`, `userId`, role, workspace, number, or installation values from browser parameters.

## Install flow after correlation

1. The OAuth token response is treated as the source of truth for `locationId`, `companyId`, and `userId` when present.
2. The server may fetch the verified GHL user profile to obtain email/name/role. Missing identity fields do not get guessed.
3. A PostgreSQL advisory lock on the verified location prevents duplicate first-install workspaces.
4. The existing active `ghl_installations` row is reused for reconnects; a different verified company for the same location fails closed.
5. The installation, workspace, external user link, role snapshot, scopes, and encrypted credentials are written transactionally.

If GHL does not provide a user email, a secure fallback uses the signed-in WA Client Hub installer only for the reconnect flow. A first Marketplace install requires verified GHL user identity and does not fall back to a browser or anonymous identity.

## Embedded SSO

The Marketplace Custom Page Live URL is `https://wa.10xcollab.com/client-hub.html`. It posts a short-lived HS256 assertion to `/api/ghl/embedded/session`. Configure `GHL_EMBEDDED_SIGNING_SECRET` only when the Marketplace/custom-page integration is configured to produce the corresponding signed context. Assertions require `locationId`, `userId`, `nonce`, `iat`, and `exp`; the server checks the exact location installation, external user link, workspace membership, expiry, and nonce replay before creating a 30-minute WA Client Hub session.

Raw browser `locationId`, `userId`, role, workspace, and number parameters are never authorization assertions.

## Password activation

Workspace managers can generate a 30-minute `/activate.html?token=...` link. The token is stored only as a SHA-256 hash, consumed under a row lock, and replaced by the existing bcrypt password hash on completion. No plaintext password is generated or logged.

## Number assignment

`whatsapp_number_assignments` reuses `workspaces`, `workspace_members`, and `whatsapp_numbers` through composite foreign keys. The partial unique index `uq_active_number_assignment_user` enforces one active number per workspace user. Assignment and move endpoints lock the active row and commit replacement atomically. Cross-workspace numbers and users are rejected.

The current branch adds assignment controls to the existing dashboard. Provider creation remains on the existing Meta/YCloud/legacy routes; no first-number or first-provider fallback was added.

## Manual configuration still required

- Configure `GHL_APP_ID` with the official HighLevel Marketplace App ID.
- Configure the Marketplace App Install webhook at `/webhooks/ghl/install` and keep the existing signed webhook verification key in `GHL_PUBLIC_KEY`.
- Configure the Marketplace Custom Page Live URL as `https://wa.10xcollab.com/client-hub.html`.
- Configure the official GHL signed-context mechanism and set `GHL_EMBEDDED_SIGNING_SECRET` in the server secret store.
- Run `npm run db:migrate`.
- Complete one real private install and confirm the exact location, company, user, membership, mapping, and activation behavior.
- Keep Calling, video, recording, and transcription flags unchanged and disabled by default.

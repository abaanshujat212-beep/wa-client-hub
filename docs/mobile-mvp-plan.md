# Mobile MVP implementation plan

Approved product direction: 24 September 2026. This checkpoint updates planning and GitHub tracking; it does not start mobile implementation.

## Product boundary

Android-first React Native CLI app for support agents. Shared design/contracts should remain iOS-compatible; iOS implementation follows Android acceptance. No Expo or WebView wrapper. The existing backend remains authoritative for contacts, messages, calls, consent, number routing and GHL synchronization. Meta is the primary WhatsApp calling provider; do not rebuild the working browser/backend pilot or promise production eligibility for every number.

Bottom navigation: **Inbox, Contacts, Calls, Settings**. Workspace and assigned sending number remain visible at the top. Switching workspace clears cached selections and subscriptions. Block switching during an active call unless the call manager can retain its original authorized context safely.

## Delivery sequence

1. **Foundation (#50):** TypeScript React Native CLI project; navigation, theme, accessibility, networking/error boundary, development/staging/release configuration, CI Android build. Choose current compatible native libraries during implementation, record versions/licences and upgrade strategy. Public API base URLs are configuration, not secrets. Signing/provider credentials remain outside the bundle.
2. **Sessions (#52):** secure login, short-lived access/rotating refresh tokens, reuse detection, device registry/revoke, workspace/number authorization, logout cache/push cleanup. Settings exposes device sessions and remote logout. Never use selected workspace as authorization.
3. **Inbox and contacts (#54 and #112):** initial snapshot, bounded pagination, search, unread/assigned filters, notes/tags/customer profile; distinguish message time from import time. Foreground events trigger durable reconciliation. Add a stable delta/tombstone contract before claiming gap-free offline sync.
4. **Composer (#61):** text, images, documents, voice-note capture/playback and approved templates; explicit sender; attachments, validation, progress/cancel, errors and status badges. Minimal encrypted local pending queue with stable idempotency keys. Expired uploads must be revalidated. Never automatically retry ambiguous call setup or permanent send failures.
5. **Calling (#55):** native WebRTC/media adapter reusing existing authenticated Meta call orchestration; permission check/request/template selection and expiry display; incoming/outgoing/ended/failed states, observed duration, mute/end/reject and actual earpiece/speaker/Bluetooth routing. One call manager owns media outside screen navigation; minimize to in-app controls without ending the call. Reject a competing device claim safely.
6. **Push/background (#58):** backend device-bound FCM delivery, minimal payloads, dedupe, authenticated deep links, background incoming-call presentation and supported ongoing-call service. Platform call integration must match current Android policies. Force-stop, permission denial, battery restrictions and expired invites must show truthful limitations; never promise unconditional delivery.
7. **Settings and hardening (#113):** profile, notification previews, audio/notification permission guidance, device sessions, redacted support diagnostics, app version, logout. Connection administration/billing/campaign authoring stay on web for MVP.
8. **Android pilot (#60):** signed internal build on physical devices; documented evidence and owner release sign-off. Broader external customer rollout also requires Meta production permission/eligibility and the platform release gate #36.

## Screen acceptance

| Screen | Required behavior | Failure/empty states |
|---|---|---|
| Login/workspace | Authorized workspaces and assigned numbers only; restore session securely | Expired/revoked session, disabled membership, no number, offline login |
| Inbox | Search, unread/assigned filters, pagination, correct preview/provider/number | Empty inbox, stale cache visibly marked, reconnect, revoked assignment |
| Chat | Text/media/voice notes/templates, status, notes/tags, assignment | Closed window prompts approved template; upload expiry, policy denial, unsupported attachment |
| Contacts | Source-labelled synced contacts, search, details, related chats/calls/permission history | Unnamed contact, removed Business app source, pending/failed sync, no coexistence |
| Calls | Permission request and expiry; recent/missed calls; explicit sending number | Denied/revoked/expired permission, unavailable template, restricted number, microphone denied |
| Active call | Answer/reject/end, mute, duration, audio route, mini panel | Bluetooth disconnect, cellular/Wi-Fi change, app interruption, another device owns call, uncertain hangup |
| Settings | Notification privacy, device sessions/revoke, permissions/help/version | OS-denied permissions link to settings; offline logout wipes local data and schedules safe server cleanup |

Contacts sync means canonical backend records and eligible Business app coexistence webhooks. Do not silently upload the phone's personal address book. Manual contact creation, phone address-book import and full GHL bulk contact import require a separate explicit scope decision. A contact record is not messaging/calling consent.

## Shared API requirements

- Reuse canonical IDs, send policy and existing exact-number resolution. Add mobile auth/device/push APIs and only the compatibility layers actually needed for bearer auth, delta sync and native call signaling.
- Workspace and number assignment checks apply to snapshots, events, calls, contacts, media and deep links; revoked access must invalidate subscriptions and caches.
- Version errors, pagination, idempotency, upload expiry and call-state semantics. Never expose Meta/GHL tokens or long-lived signing secrets.
- GHL embedded pages already share web calling. Exporting Meta call facts to GHL is separate work (#44); the native app must not create a second CRM sync path.
- Missing push is recoverable through backend reconciliation. Push is never the source of message/call truth.

## MVP verification matrix

- Login, token refresh race/reuse, expiry, device revoke and logout.
- Two workspaces and multiple numbers; assigned agent versus owner; unauthorized IDs/deep links/media rejected.
- Incoming chat foreground/background; send text/image/document/voice note/template; delivered/read/failed convergence.
- Offline enqueue, restart, reconnect, duplicate taps and lost response: at most one accepted canonical send.
- Open versus closed chat permission requests, current approval, rejection/revocation/expiry and template unavailability.
- Incoming and outgoing audio on supported exact number; lock screen/background behavior; mute, immediate local teardown and final server state.
- Earpiece/speaker/wired/Bluetooth, device unplug, microphone denial, audio interruption and network changes on physical hardware.
- Web/mobile/GHL consistency for implemented messaging; call-log export tested separately when #44 MVP portion lands.
- Signed release build, dependency/secret checks, crash-safe redacted logs, rollout/rollback and pilot support instructions.

## Later phases and gates

- iOS (#59): shared contracts after Android pilot; Keychain/APNs/CallKit/audio routing/TestFlight validated independently.
- Campaign authoring, team administration, billing, customer onboarding and richer analytics: later product scope, web remains available.
- Recording (#56) and transcription/AI (#57): optional later releases, disabled until consent/storage/retention/review requirements are implemented. They do **not** block the basic Android pilot. No fake recordings or inferred answered-call duration.
- #44 should deliver observed call-log sync first; recording/transcript/approved summaries follow #56/#57.
- Real coexistence contact/history pilot, account-update offboarding, deletion fulfillment, Meta review reconciliation, TURN/network resilience and production operations remain explicit platform gates. See the dated official API audit.

## Owner decisions before implementation/distribution

Confirm application display name/package ID, Android minimum-device matrix, session/cache retention, notification preview default, pilot devices/users and private distribution ownership. Credentials for signing/FCM/APNs go only into approved secret storage. No commercial pricing, SIP fallback, recording or AI vendor is selected by this plan.

## Meta checkpoint — 5 October 2026

Live Meta review reads show Advanced Access approved/live for `whatsapp_business_messaging`, `whatsapp_business_management` and `public_profile`. `business_management` is rejected. Submission is ACTIONED with a mixed outcome, not pending or wholly approved. Track the rejected permission and exact-number customer onboarding validation separately; do not treat the older September audit as current status. See [Meta review checkpoint](meta-review-checkpoint-2026-10-05.md).

Platform follow-ups: #114 coexistence account-update offboarding; #115 data-deletion fulfillment. Contacts #112 and Settings #113 are native MVP children.

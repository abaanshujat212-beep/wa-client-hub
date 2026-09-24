# Official API scope audit — 24 September 2026

This is a code and available live-evidence audit, not a claim of Meta approval or full production certification. Baseline: `hybrid-platform-roadmap.md`, ADR 001, `meta-only-onboarding.md`, `meta-business-app-onboarding.md`, and the subsequent requested Meta calling/GHL work. The earlier OpenWA/manual-browser calling plan was superseded by the official API direction; hidden legacy modules still exist. React Native product planning remains deferred until this audit is discussed.

## Current live evidence

- Latest inspected incoming call: 24 September, 09:49 PKT; terminated, webhook recorded. Outgoing: 09:43 PKT; terminated, webhook recorded. Latest terminate command accepted by Meta. These records verify signaling/synchronization, not microphone or earpiece sound quality.
- Last 24-hour receipt snapshot: 25 call, 21 status and 7 message receipts processed; no pending/failed states in that snapshot. One older permission request returned `META_ERROR_100`; no detailed cause was persisted, so its cause remains unknown.
- Current connected number is a Cloud test connection; no coexistence setting or imported Business app contacts was present. Three canonical contacts existed before reconciliation.
- Live recheck: `support_call_permission` (`en_US`) is **APPROVED**. It is available to the closed-window permission-template picker. No template was sent during this audit.
- Meta MCP app review: submission `3545273325611238` is **PENDING**. It also returned `is_approved:true`, but permissions are not live Advanced Access. Do not interpret that boolean as permission approval.
- `whatsapp_business_messaging`, `whatsapp_business_management`, and `business_management`: MCP privileges reports `is_live:false`, access `none`, grant `REJECTED`, without rejection details. This conflicts with the pending submission; review the actual Developer Dashboard outcome when it completes.
- Requirements response: business verification passes and privacy policy exists. Cannot submit again while the previous submission is in review. Screencast and API-precheck flags are false for the three permissions despite the active review. Preserve the existing submission and reconcile this mismatch in the dashboard; do not cancel/resubmit automatically.
- Compliance response: compliant, zero open violations or required actions. This does not certify every code path or erase the permission blockers.
- Enabled app webhook fields: `messages`, `calls`, `history`, `smb_app_state_sync`, `smb_message_echoes`. `account_update` is absent.

## Changes in this checkpoint

- Audio output selector uses the browser's real `setSinkId` capability; optional `selectAudioOutput` chooser and device refresh. Microphone selection applies to the next call. Same controls are used in the main app and GHL embedded Calls page.
- Browsers without output routing display system/headset guidance. There is no pretend speaker/earpiece toggle. iPhone/browser routing and iframe permissions still need a physical-device check. No new outbound call was placed for this audit.
- Contacts page in the dashboard and GHL embedded settings: searchable, paginated, per authorized WhatsApp connection; source and Business app sync request status displayed. Refresh reads stored contacts, not a repeat of Meta's one-shot sync operation.
- Incoming call webhooks now create a canonical contact if missing, without overwriting names or granting marketing consent. A local reconciliation script covers prior calls.
- Existing chat contact upserts and coexistence `smb_app_state_sync` add/edit/remove processing remain the sync sources. Removal marks the source, preserving CRM history.

## Original scope against code

| Area | Evidence / state | Remaining gate |
|---|---|---|
| M0/M1 tenancy, durable storage, deployment | PostgreSQL schema, encrypted vault, workspace membership, Docker services and migration system implemented | Whole-system restore/load/security acceptance is not proven by this audit |
| M2 official onboarding and messaging | Embedded Signup, server token exchange, asset binding, template/media APIs, signed durable webhooks, deduplication and status handling implemented | Live Advanced Access and real customer coexistence acceptance |
| M3 inbox and contacts | Canonical conversations, read/assignment/tags/notes, SSE; new contact directory and call-contact capture | Full phone address book requires eligible Business app onboarding; mobile offline/push not delivered |
| M4 campaigns | Campaign routes/repository/worker/policy and approved template binding exist | Full scheduled campaign load/pilot and consent acceptance not re-run here |
| M5 connector framework | Vault, repository, worker, replay/lifecycle and canonical contracts exist | Connector-specific production validation remains separate |
| M6 GHL | OAuth, location/workspace mapping, assignments, embedded Calls, message/contact upsert, media and workflow modules exist | Whole GHL address-book bulk import/bidirectional conflict handling not established; embedded call UI is not Meta call-log export |
| M6 Shopify/WooCommerce/generic | Provider/connector foundations and generic APIs exist | No new live store sandbox acceptance performed; do not label all integrations complete |
| M7 production operations | Backup/restore scripts, security/runbook material, media retention modules exist | Restore drill, soak/load, full data export/deletion/retention, alerting and release sign-off need evidence |
| M8 mobile | Roadmap/issue scope exists | React Native CLI Android auth/device/push/offline/audio routing/physical-device acceptance deferred; iOS later |
| Calling | Durable Meta sessions/commands, signed events, WebRTC browser audio, ownership, permission history, closed-window template gate, popup and quick local hangup implemented | NAT/TURN resilience, device routing, closed-browser notifications and complete GHL call-log export still require work |
| Recording/AI | Future roadmap scope | Consent recording/storage, transcription, grounded summaries, reviewed follow-ups not implemented by this calling UI |

## Meta requirement and code checks

1. **Secure onboarding:** code validates signup state and asset ownership and encrypts tokens; browser does not receive app secrets. Coexistence launch uses `whatsapp_business_app_onboarding` and handles the corresponding finish event. Token rotation/expiry and customer-level live acceptance remain operational checks.
2. **Coexistence sync:** durable worker subscribes to WABA before contact/history requests, starts within the 24-hour window, avoids automatic replay of ambiguous one-shot calls, and skips number registration for coexistence. Genuine history refusal is retained; imported history does not trigger normal unread/automation paths. Actual phone onboarding has not yet proven this live.
3. **Contact data:** Business app updates are scoped to the mapped connection/workspace. A standard Cloud test number cannot be treated as a phone address-book import. A successful request is not proof that all contacts/chunks arrived.
4. **Messaging/call consent:** outbound service checks suppression and live call permission. Closed 24-hour chat windows require a currently approved call-permission template; ordinary templates cannot substitute. Permission replies and expiration are retained separately from API observations. Customer permission does not equal campaign consent.
5. **Lifecycle gap:** `metaLifecycleRoutes.js` verifies deauthorization/deletion signed requests and revokes credentials. Deletion requests are stored as `received`; no completing deletion worker was found. Do not claim full deletion fulfillment until implemented and tested with required retention exceptions.
6. **Coexistence offboarding gap:** `account_update` subscription/handler for Business app disconnection was not found. Current deauthorization callbacks are a different event path. Add and test offboarding/reconnect before broad customer rollout.
7. **Large history delivery:** current webhook ingress size needs validation against real history chunks. Existing fixture tests do not prove real large-account import completeness.
8. **App Review:** code and successful administrator test calls do not grant Advanced Access to onboard arbitrary customers. Review remains an external blocker; detailed reviewer feedback and the contradictory MCP flags need dashboard confirmation.

## Verification and next gates

- 22 focused calling unit/UI tests passed, including selected input/output routing, denied routing, uncertain request idempotency, popup and hangup cleanup.
- Three isolated PostgreSQL integration suites passed: calling/contacts access isolation, signed webhook persistence, and coexistence sync/import/removal. Contact tests cover unrelated workspace/number exclusion and revoked number assignment access.
- Browser inventory was reachable but attaching to the live WA tab timed out. Visual and physical audio verification are therefore not claimed.
- Deployment: the app container was found stopped (exit 0), then recreated and started with this tested build. Public `/api/ready` returned 200 with database/Redis up. Unauthenticated contact-directory access returned 401. Live directory returned three contacts; backfill created zero because prior call participants were already present.
- Before deciding mobile options: finish Meta review reconciliation, run one real coexistence onboarding/contact update/removal/history-refusal pilot, implement account-update offboarding and deletion fulfillment, prove GHL call-log export, and test headphone/earpiece routing on actual devices. Record which larger roadmap items are retained versus deferred; then define the mobile MVP.

## Primary references

- [Meta Business app onboarding and one-shot contact/history sync](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [Meta contact state-sync webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync/)
- [Browser audio output selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId)
- [Browser audio output permission chooser](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/selectAudioOutput)
- Meta MCP read-only app-review status/privileges/requirements, compliance and webhook-subscription responses queried on 24 September 2026; no review or permission configuration was changed.

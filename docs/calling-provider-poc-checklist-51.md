# Meta WhatsApp Business Calling POC checklist for #51

This is a research/POC checklist, not implementation of #55. Use a disposable Meta test/sandbox account and number where possible; do not use production customer traffic until every gate and the owner approval pass.

## Gate and owner approvals

- [ ] Owner approves Meta WhatsApp Business Calling API as the primary POC path.
- [ ] Owner approves Graph API + Webhooks + WebRTC as the MVP hypothesis, with SIP deferred unless the POC or product requirements justify it.
- [ ] Owner approves audio-only scope; no production claim for video or screen sharing.
- [ ] Target workspaces, numbers, countries, monthly minutes, concurrency, and spend limits are recorded.
- [ ] Recording consent, jurisdictions, retention, deletion, access, and legal-review owner are recorded, or recording is explicitly out of scope.
- [ ] #55 remains blocked during this checklist.

## Meta account, number, and app readiness

For **each exact connected WhatsApp number**, capture redacted evidence for every item; never mark a workspace ready because another number passed.

- [ ] Business phone number uses Cloud API, not the WhatsApp Business app.
- [ ] Exact WABA ID is verified against the existing `meta_connection_assets` record.
- [ ] Exact phone-number ID and display number are verified.
- [ ] Exact Meta app binding is verified.
- [ ] The same app is subscribed to the WABA.
- [ ] `whatsapp_business_messaging` is available for the number.
- [ ] `calls` webhook field is subscribed, unless the explicitly approved SIP mode uses its documented subscription model.
- [ ] Calling is enabled in the phone-number Calling settings.
- [ ] Call icon visibility is captured.
- [ ] Business calling hours are captured.
- [ ] Callback-request settings are captured.
- [ ] Inbound calling is enabled/eligible.
- [ ] Production messaging threshold/limit requirements are captured for the account; public test/sandbox rules are recorded separately.
- [ ] Business phone-number country is checked against the current Meta business-initiated availability list.
- [ ] Pakistan-specific result is verified on the actual number/account; country-list presence alone is not accepted as eligibility.
- [ ] Account status, quality, restrictions, low-pickup/user-feedback restrictions, and test/production mode are captured.
- [ ] `canReceiveCalls` and `canBusinessInitiateCall` are computed from observed settings/permission evidence, not a UI guess.
- [ ] No token, app secret, or long-lived credential appears in logs, browser storage, mobile bundles, screenshots, or event fixtures.

## Existing WA Client Hub foundation audit

- [ ] Embedded Signup creates/uses the existing encrypted Meta connection; no parallel calling connection is created.
- [ ] Graph requests use the existing versioned `MetaGraphClient` and server-side vault.
- [ ] Webhook verification uses the existing raw-body HMAC path and exact configured app secret.
- [ ] The existing durable receipt is extended/reused for `calls` events without weakening message handling.
- [ ] A separate calling normalizer/service layer is used behind the same verified webhook receiver.
- [ ] WABA + phone-number lookup resolves exactly one workspace, WhatsApp number, and Meta connection.
- [ ] No first-number, first-provider, contact-only, or cross-workspace fallback exists.
- [ ] Current message normalizer is not treated as a call normalizer by analogy.
- [ ] Any Calling readiness diagnostics expose status/reasons only and are narrowly scoped; no call implementation is added in this gate.

## Inbound user-initiated call

- [ ] WhatsApp user calls the exact business number.
- [ ] `calls` webhook is received and the redacted raw envelope is stored.
- [ ] Signature verification rejects an invalid body/signature pair.
- [ ] Receipt is durable before asynchronous processing and replayable by an operator.
- [ ] Event identity/dedupe behavior is documented for every observed event.
- [ ] Exact WABA + phone resolves to the intended workspace/number/connection.
- [ ] A canonical `CallSession` fixture is produced with `callSessionId`, workspace, contact, agent, number, direction, provider `meta`, and internal provider reference.
- [ ] SDP offer/answer exchange is captured without storing credentials in the client.
- [ ] ICE connectivity is proven on the target browser/mobile network.
- [ ] TURN behavior is tested on a restrictive network or explicitly ruled out with evidence.
- [ ] Incoming ringing surface shows the correct business/number context and contact context.
- [ ] Accept and reject are tested.
- [ ] End/terminate is tested and duration is calculated only from connected/end evidence.
- [ ] Missed call and timeout behavior are observed and mapped conservatively.
- [ ] Duplicate, replayed, delayed, and out-of-order events converge to one session.
- [ ] Network interruption/reconnect and reconciliation after app restart are tested.

## Business-initiated call and permission

- [ ] Exact Meta permission-request flow is captured.
- [ ] Permission state is persisted separately from call state.
- [ ] Permission expiry, revocation, and denied states are tested.
- [ ] Per-user, unanswered, rejected, and account/country restrictions are captured.
- [ ] Outbound Call action is hidden/disabled unless `canBusinessInitiateCall=true` for the exact number and contact permission.
- [ ] Server-side Graph request requirements and action payloads are captured from the current Meta reference.
- [ ] One eligible business-initiated audio call is completed, or the documented test-number limitation is attached.
- [ ] Call Connect webhook and SDP answer are captured and applied to the WebRTC peer connection.
- [ ] Ringing, connected, rejected, busy, no-answer, failed, and terminal events are captured where Meta emits them.
- [ ] Client and provider idempotency keys are separated and retry behavior is tested.
- [ ] Caller identity and exact WhatsApp number are preserved.

## WebRTC/mobile media

- [ ] Browser or React Native media termination point is chosen and documented.
- [ ] Backend issues only short-lived/opaque authorization.
- [ ] Microphone permission denial and recovery are tested.
- [ ] Mute/unmute is tested.
- [ ] Speaker and Bluetooth/audio-route switching are tested on a physical device.
- [ ] Device switching and teardown are tested.
- [ ] Android foreground ringing/connected/end is tested.
- [ ] Android background behavior is tested.
- [ ] Android terminated/force-stopped behavior is tested where the selected design claims support; otherwise the limitation is explicit.
- [ ] Reconnect after Wi-Fi/mobile-network transition is tested.
- [ ] No client contains Meta app secrets, access tokens, SIP passwords, or long-lived provider credentials.
- [ ] Audio codec and media security match current Meta documentation and observed SDP; no unsupported video/screen-sharing claim is made.

## Webhook security, state, and tenant isolation

- [ ] Exact raw-body HMAC verification and timing-safe comparison pass.
- [ ] HTTPS and bounded body limits are retained.
- [ ] Duplicate event convergence passes.
- [ ] Out-of-order event convergence passes.
- [ ] Replay protection and operator replay audit pass.
- [ ] Retry, backoff, dead-letter, and recovery pass.
- [ ] Raw Meta state/event is stored separately from canonical state.
- [ ] Terminal state is not overwritten by a late non-authoritative event.
- [ ] Reconciliation after worker/app/network failure passes.
- [ ] Workspace, agent, contact, WhatsApp number, and provider-connection isolation passes.
- [ ] Sales and Support numbers on the same contact cannot share sender/calling context.
- [ ] No first-number, first-provider, or GHL-contact-only routing exists.
- [ ] Per-workspace, per-agent, per-number, destination, duration, concurrency, and spend limits pass.
- [ ] Suspicious destination/failure/velocity controls are exercised.

## Canonical record and GHL fixture

- [ ] Canonical record includes `callSessionId`, `workspaceId`, `contactId`, `agentId`, `whatsappNumberId`, direction, voice media kind, state, started/ringing/connected/ended timestamps, duration, `provider: meta`, internal connection reference, and optional recording reference.
- [ ] Raw Meta call ID, event ID, state, SDP metadata, and payload remain internal.
- [ ] Recording remains disabled unless consent and policy are approved.
- [ ] If recording is tested, retrieval, access audit, deletion, retention, and legal hold are verified; only an opaque reference is mapped.
- [ ] GHL mapping fixture treats the call as an external WhatsApp call activity unless an official native HighLevel telephony contract is verified.
- [ ] GHL fixture preserves exact workspace/contact/number, direction, agent, timestamps, duration, canonical/raw status, and recording reference.
- [ ] GHL fixture rejects ambiguous contact/number/provider mappings.

## SIP comparison checkpoint

- [ ] Graph/Webhook/WebRTC result is documented before SIP selection.
- [ ] SIP is selected only if PBX/Asterisk, enterprise queueing, BYOC, server-side media, or a WebRTC failure justifies it.
- [ ] If tested, SIP TLS/authentication, SDP, RTP/SRTP/SDES, NAT/firewall, codec, registration, BYE, recording, and reconciliation evidence are attached separately.
- [ ] SIP credentials remain server-side and connection-scoped.

## Exit package and unblock rule

- [ ] Official Meta source links and retrieval date are attached.
- [ ] Redacted webhook fixtures, Graph request/response samples, SDP/ICE notes, and error states are attached.
- [ ] Test number/production number settings and account eligibility evidence are attached.
- [ ] Android/browser screenshots and network/media logs are attached.
- [ ] Duplicate/out-of-order/retry/reconciliation evidence is attached.
- [ ] Multi-number isolation evidence is attached.
- [ ] GHL external-call mapping fixture is attached.
- [ ] ADR-002 is updated with observed capabilities and deviations.
- [ ] Owner explicitly comments that #51 is `approved/unblocked`.
- [ ] Only after the previous item may a separate #55 implementation branch/PR be created.

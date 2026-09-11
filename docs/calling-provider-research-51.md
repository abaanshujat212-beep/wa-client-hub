# Meta WhatsApp Business Calling research for #51

- Status: **Meta-first research and POC preparation only — #55 remains blocked**
- Snapshot: 2026-09-11
- Base: `main` at `e59750624e7a3a00f0375675611ea6acccb2d40b`
- Scope: evaluate and validate **Meta WhatsApp Business Calling API as the primary native path**, with PSTN/SIP providers only as fallback or adjacent integrations.

## Correction to the previous research

The previous #51 documents treated Telnyx/Twilio/Vonage/Plivo/Agora as the primary calling path and stated that Meta WhatsApp calling was not verified. That is outdated. Meta now documents WhatsApp Business Calling through Cloud API, including user-initiated and business-initiated calls.

The corrected product decision is:

> Evaluate and validate Meta WhatsApp Business Calling API as the primary provider-neutral/native calling path, with fallback PSTN/SIP provider options only where needed.

This is not production approval. It does not implement #55, select a provider for production, claim account eligibility, or claim video/screen-sharing readiness.

## Official Meta evidence

Primary sources reviewed:

- [WhatsApp Business Calling overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling)
- [Calling API and webhook reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/reference)
- [User-initiated calls](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls)
- [SIP configuration](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip)
- [WhatsApp webhook overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview)
- [Cloud API get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)

Meta documents that Calling API can receive calls from WhatsApp users and initiate calls from the business to WhatsApp users. The default architecture uses Graph APIs and Webhooks for signaling and WebRTC media with ICE, DTLS, and SRTP. OPUS is the documented default audio codec; additional codecs must be treated as capability evidence, not assumed support.

Meta also documents SIP as an optional, explicitly enabled signaling architecture. SIP can use WebRTC media or SDES/SRTP media depending on the approved configuration. The same Cloud API business number is used for messaging and calling.

Meta marks some richer calling capabilities, including video-related capabilities in the overview, as planned or in development. This gate therefore targets **audio only** and must not describe video or screen sharing as production-ready.

## Repo audit at the current main

The repository already provides useful Meta messaging foundations:

| Foundation | Current state | Calling implication |
|---|---|---|
| App/WABA/phone binding | `meta_connection_assets` stores WABA, phone-number, business portfolio, verification, and lifecycle data. | Reuse this binding; do not create a second Meta connection model. |
| Encrypted credentials | `provider_connections.encrypted_credentials` is resolved through the server-side credential vault. | No Meta secret or long-lived token may reach mobile/browser. |
| Embedded Signup | `public/meta-signup.js` and `metaSignup*` services validate the signed-in workspace, exchange the code server-side, verify the selected WABA phone, and encrypt the resulting token. | Calling eligibility must attach to the existing installed connection. |
| Graph transport | `MetaGraphClient` provides versioned Graph paths, bearer authentication, timeout, bounded retry, and safe error classes. | Calling Graph actions should reuse this client. |
| Lifecycle/diagnostics | Existing lifecycle routes expose connection status, token state, subscribed-app state, account state, quality, and diagnostics timestamps. | Extend diagnostics only after exact Calling settings fields are verified. |
| Webhook verification | `metaWebhookRoutes` handles challenge verification and raw-body `x-hub-signature-256` verification. | Calling should use the same verified receiver and a separate calling normalization/service layer. |
| Durable ingestion | `metaWebhookRepository` resolves by WABA + phone number, persists receipts, deduplicates, retries, dead-letters, and preserves workspace/provider/number ownership. | Reuse the receipt/security pipeline for `calls` events. |
| Exact routing | `resolveAsset` joins the exact WABA, phone number, provider connection, workspace, and canonical number. | Preserve `workspace → WhatsApp number → Meta connection → CallSession`. Never use contact ID or first-number inference. |
| UI | Embedded Signup, connection status, diagnostics, activation, templates, and media are exposed. | No live call button exists today; readiness must precede future call actions. |

Important gaps found:

- The current normalizer accepts `messages` changes and message statuses, not `calls` changes.
- Current diagnostics do not retrieve Calling phone-number settings such as calling status, call icon visibility, call hours, callback settings, or SIP mode.
- `call_events` is only a preliminary legacy table with `started/answered/missed/ended/unknown`; there is no `CallSession`, call participant, capability, idempotency, or call-webhook receipt model.
- Existing frontend Meta UI is messaging/connection UI, not a Calling UX.
- The current code must not be extended by silently treating a message webhook or contact record as a call event.

## Architecture comparison

### A. Graph API + Webhooks + WebRTC — recommended MVP

**Signaling:** Meta sends `calls` webhooks and accepts Calling API actions through Graph endpoints on the exact phone-number ID. User-initiated and business-initiated flows have different permission and SDP timing requirements.

**Media:** WebRTC between the approved business media endpoint and Meta/WhatsApp. SDP offer/answer and ICE candidates are exchanged through the Meta-defined API/webhook flow. Media must not be invented from a message event.

**Backend:** verify and durably receipt raw webhooks; resolve exact asset; normalize raw call events; persist idempotent call observations; authorize Graph actions; issue only short-lived/opaque client authorization; reconcile missed/out-of-order events; audit every action.

**Mobile/browser:** own the WebRTC peer connection and audio device surface, with microphone permission, mute, speaker, Bluetooth/audio-route handling, reconnect, teardown, and platform-specific foreground/background behavior. The client never receives the Meta app secret or long-lived business token.

**NAT/ICE:** ICE connectivity is required. STUN/TURN requirements depend on the media endpoint and network; a production design should plan TURN for restrictive enterprise/mobile networks rather than assuming direct connectivity.

**Authentication:** backend credential vault plus workspace/RBAC/number eligibility checks. Client authorization is short-lived and capability-scoped.

**Events:** evidence-driven initiated/permission/ringing/connected/terminal states. Raw Meta call ID, webhook event ID, SDP, and provider payload remain internal.

**Incoming/background behavior:** inbound delivery and ringing must be proven on the chosen browser/React Native surface. Android background/terminated behavior is a hard POC item, not an assumption from messaging webhooks.

**Scale/operations:** one existing Meta connection and webhook plane, one call service/worker, per-workspace rate and concurrency controls, and a separate media/turn capacity plan.

**Recording:** not assumed. If later enabled, store only an opaque provider reference with consent, retention, deletion, access, and audit controls.

**Compatibility:** highest compatibility with the current Meta Cloud API connection, exact-number routing, Graph client, webhook receiver, and encrypted credential model.

### B. SIP-based WhatsApp Calling

**Signaling:** SIP over TLS to the SIP endpoint configured for the WhatsApp business phone number. Meta documents SIP as requiring explicit enablement instead of the default Graph/Webhook signaling path.

**Media:** either WebRTC media through the SIP architecture or SDES/SRTP where explicitly supported and approved. SDP, SIP authentication, digest/credentials, BYOC/PBX behavior, and termination must be tested as separate boundaries.

**Backend:** operate or integrate a SIP edge/PBX/media service, protect SIP credentials, handle registration/authentication, map SIP dialogs to exact CallSessions, verify Meta SIP/webhook events, and provide reconciliation.

**Mobile/browser:** connects to the chosen PBX/media service or a controlled WebRTC gateway; audio permissions and device routing remain the client responsibility.

**NAT/ICE:** WebRTC still requires ICE/STUN/TURN when WebRTC media is used. SIP adds firewall, TLS, RTP/SRTP, NAT, codec, and port-range operations.

**Authentication:** Meta SIP settings plus connection-scoped SIP credentials and backend/PBX authorization. No credentials belong in the client.

**Events:** SIP dialogs and Meta call webhooks must be correlated by internal provider identity; no provider call ID becomes the public ID.

**Incoming/background behavior:** depends on SIP edge/PBX, push strategy, and mobile/browser client; it is more operationally complex than the default path.

**Scale/operations:** useful for PBX, queues, enterprise routing, server-side media, and existing telephony teams, but introduces a new media/signaling plane and monitoring burden.

**Recording:** potentially simpler in a controlled PBX/media plane, but still subject to consent, jurisdiction, retention, deletion, and access controls.

**Compatibility:** appropriate later for enterprise PBX/SIP/BYOC needs; not justified for the initial WA Client Hub MVP without an existing SIP requirement.

### MVP decision

Choose **Graph API + Webhooks + WebRTC** for the Meta Calling POC. Keep SIP as a documented later architecture for PBX, call-center queues, enterprise routing, or server-side media requirements. Do not add SIP dependencies or call infrastructure in this gate PR.

## Eligibility and readiness contract

Calling readiness is per exact connected number, not per workspace or contact. The future provider-neutral representation should expose status only, never secrets:

```json
{
  "provider": "meta",
  "workspaceId": "internal-workspace-id",
  "whatsappNumberId": "internal-number-id",
  "providerConnectionId": "internal-connection-id",
  "mode": "graph_webrtc",
  "cloudApiNumber": "unknown",
  "wabaBinding": "unknown",
  "appBinding": "unknown",
  "messagingPermission": "unknown",
  "callsWebhook": "unknown",
  "callingEnabled": "unknown",
  "callIconVisibility": "unknown",
  "callHours": "unknown",
  "callbackRequestSettings": "unknown",
  "productionThreshold": "unknown",
  "countryEligibility": "unknown",
  "businessInitiatedEligible": "unknown",
  "inboundEligible": "unknown",
  "accountRestrictions": "unknown",
  "testOrProduction": "unknown",
  "canReceiveCalls": false,
  "canBusinessInitiateCall": false,
  "lastCheckedAt": null,
  "blockingReasons": ["not_checked"]
}
```

Required checks:

- Cloud API number, not WhatsApp Business App number.
- Correct WABA and exact Meta app binding.
- App subscribed to the WABA and `calls` webhook field, unless the approved SIP mode uses its documented subscription model.
- `whatsapp_business_messaging` permission available for the business number.
- Calling enabled in phone-number Calling settings.
- Call icon visibility, business calling hours, callback-request settings, and inbound settings explicitly checked.
- Production messaging eligibility/limit checked against the current Meta account and test-number rules.
- Country eligibility checked for the business number. Meta’s current business-initiated exclusion list must be rechecked at test time; Pakistan is not in the list observed in this snapshot, but that is not account-level approval.
- Account quality, restrictions, low-pickup/user-feedback restrictions, and number mode checked.
- `canReceiveCalls` and `canBusinessInitiateCall` are derived from verified Graph/settings/permission evidence, never from a hard-coded country or UI flag.

The current backend does not yet implement these Calling-specific fields. This document is the readiness contract for the POC; adding them to diagnostics belongs in a narrowly scoped follow-up after the exact Meta settings responses and permissions are confirmed.

## User-initiated call flow

```text
WhatsApp user
  → calls the business Cloud API number
  → Meta emits a calls webhook
  → verified raw receipt / exact WABA + phone resolution
  → workspace + exact WhatsApp number + Meta connection
  → canonical CallSession and agent routing
  → approved WebRTC offer/answer flow
  → accept, reject, timeout, end, or missed state
```

The POC must capture redacted fixtures for call-created/connect/terminate and any permission or error events actually emitted by the selected Meta configuration. The calling reference documents call actions, SDP answer handling, and call-connect webhooks. Do not infer exact event names or transitions from message webhooks.

Required behavior:

- Verify raw-body signature before parsing.
- Durable receipt before asynchronous normalization.
- Dedupe by `(workspaceId, providerConnectionId, externalCallEventId)` where an event ID exists; otherwise use a bounded canonical hash with collision-safe fields.
- Resolve by WABA + phone number + workspace/provider asset. Never route by GHL contact ID alone.
- Preserve raw Meta call state separately from canonical state.
- Accept duplicate and out-of-order events; reconcile after interruption.
- Do not mark connected, ended, duration, or recording until Meta/WebRTC evidence supports it.

## Business-initiated call flow

Business-initiated calling is a separate eligibility and permission flow:

1. Confirm exact number readiness and `canBusinessInitiateCall`.
2. Confirm the user/contact permission state and any expiry/revocation rules required by the current Meta Calling API contract.
3. Do not show an outbound Call action when permission, country, number settings, account status, or capability evidence is missing.
4. Create one idempotent canonical `CallSession` and retain the internal Meta call reference.
5. Invoke the documented phone-number Calling API action through the server-side Graph client.
6. Process the Call Connect webhook and SDP answer, then establish the approved WebRTC media connection.
7. Normalize ringing/connected/terminal evidence and reconcile duplicates, retries, rejected calls, and no-answer timeouts.

The POC must verify the exact permission request, permission status, expiry/revocation, unanswered/rejected restrictions, Graph payload, callback/webhook sequence, caller identity, and idempotency behavior. Until those tests pass, `canBusinessInitiateCall` remains false.

## Fallback provider role

Telnyx, Twilio, Vonage, Plivo, and Agora/SIP research remains useful only for:

- PSTN fallback;
- SIP/BYOC or PBX interoperability;
- non-WhatsApp telephony;
- enterprise call-center/media integrations;
- cases where Meta account/country/number eligibility is unavailable.

They are not the default primary architecture for WhatsApp calls. Any fallback must preserve the same provider-neutral CallSession and exact workspace/number/provider routing contract.

## GHL external-call mapping

A native Meta call should be represented in GHL as an external WhatsApp call activity unless an official GHL native telephony contract is separately verified. Preserve:

- canonical `callSessionId`;
- internal Meta provider identity and external call reference;
- exact workspace, contact, and WhatsApp number;
- direction, agent, start/ringing/connect/end timestamps, duration, and canonical status;
- raw Meta status where appropriate;
- opaque recording reference and consent/access state.

Never label Meta WhatsApp Calling as native HighLevel telephony, and never infer sender/calling context from a GHL contact ID alone.

## Current #51 gate

#51 remains **blocked**. The Meta POC must prove at minimum:

- test or production Cloud API number binding;
- WABA/app subscription and `calls` webhook delivery;
- calling settings and permission evidence;
- one inbound audio call;
- business-initiated audio call where the number/account is eligible;
- WebRTC SDP/ICE connection;
- microphone, mute, speaker, Bluetooth/audio routing;
- Android foreground and supported background/terminated behavior;
- reject, no-answer, timeout, network interruption, reconnect, duplicate, and out-of-order handling;
- exact multi-number tenant isolation;
- no client secret or long-lived credential exposure;
- CallSession persistence and GHL external-call fixture;
- owner approval that #51 is unblocked.

Until all hard gates and explicit owner approval exist, do not implement #55.

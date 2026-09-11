# ADR-002: Meta-native WhatsApp Calling gate and provider-neutral contract

- Status: **Proposed / blocked pending #51 approval**
- Date: 2026-09-11
- Tracking issue: [#51](https://github.com/abaanshujat212-beep/wa-client-hub/issues/51)
- Implementation issue: [#55](https://github.com/abaanshujat212-beep/wa-client-hub/issues/55)
- Parent epic: [#49](https://github.com/abaanshujat212-beep/wa-client-hub/issues/49)
- Security dependency: [#31](https://github.com/abaanshujat212-beep/wa-client-hub/issues/31)

## Decision status

Meta WhatsApp Business Calling API is the **primary proposed native calling path** for WA Client Hub. Telnyx, Twilio, Vonage, Plivo, and Agora/SIP remain fallback or adjacent PSTN/SIP/non-WhatsApp options only.

This ADR authorizes research and a bounded Meta Calling POC, not production calling. No #55 implementation, call API, mobile engine, SIP service, migration, or production calling flag is authorized. #51 remains blocked until the hard gates below pass and the owner explicitly comments that #51 is approved/unblocked.

Meta-specific call IDs, WABA IDs, phone-number IDs, webhook IDs, SDP, SIP credentials, access tokens, and raw provider states remain internal. Public clients receive canonical WA Client Hub identifiers only.

## Existing repository foundation and reuse boundary

The current Meta messaging integration already has:

- Embedded Signup with server-side code exchange and WABA/phone verification;
- encrypted `provider_connections` credentials and exact `meta_connection_assets` records;
- exact workspace, WABA, phone-number, Meta connection, and canonical-number routing;
- versioned `MetaGraphClient` transport with timeout and bounded retry;
- raw-body HMAC webhook verification and challenge handling;
- durable webhook receipt, deduplication, retry, dead-letter, and worker processing;
- lifecycle/diagnostics, activation, template, and media surfaces.

Calling must reuse these components. It must not create a second Meta connection, number, vault, or webhook security model.

Current gaps are intentional: message normalization does not handle `calls`, diagnostics do not yet retrieve Calling settings, and `call_events` is only preliminary metadata. Those gaps are POC deliverables, not permission to implement #55 in this ADR.

## Architecture decision

### MVP: Graph API + Webhooks + WebRTC

- **Signaling:** Meta `calls` webhooks and documented Calling API Graph actions on the exact phone-number ID.
- **Media:** WebRTC using Meta's documented SDP/ICE flow; default audio is OPUS, with other codecs only when the tested capability document confirms them.
- **Backend:** verify raw webhooks, durably receipt them, resolve the exact asset, normalize idempotently, authorize Graph actions, persist raw observations and canonical state, reconcile late events, and enforce tenant/RBAC/spend controls.
- **Client:** a later approved browser/React Native surface owns the peer connection, microphone permission, mute, speaker, Bluetooth/audio route, reconnect, and teardown. It receives only short-lived or opaque authorization.
- **NAT/ICE:** ICE is required. STUN/TURN behavior must be tested; production should plan TURN for restrictive networks rather than assuming direct connectivity.
- **Background:** Android foreground, background, and terminated-app behavior are hard POC acceptance items. Messaging webhook delivery is not evidence of incoming-call UX support.
- **Scale:** reuse one Meta connection/webhook plane, add a separate calling normalization/worker layer, and apply workspace/number concurrency and spend limits.
- **Recording:** not in MVP. Any later recording must be consented, retention/deletion governed, access-audited, and represented only by an opaque reference.
- **Compatibility:** this option matches the current encrypted Meta Cloud API, exact-number routing, Graph client, and webhook foundations.

### Later option: SIP-based WhatsApp Calling

- **Signaling:** SIP over TLS to the configured SIP endpoint; Meta requires explicit SIP enablement instead of default Graph/Webhook signaling.
- **Media:** WebRTC through the SIP architecture or explicitly approved SDES/SRTP mode.
- **Backend:** operate/integrate a SIP edge or PBX, protect SIP credentials, map dialogs to canonical sessions, handle authentication and reconciliation, and monitor RTP/SRTP/NAT behavior.
- **Client:** connects to the controlled PBX/media service or a WebRTC gateway; audio permissions and route controls remain client responsibilities.
- **NAT/ICE:** WebRTC still needs ICE/STUN/TURN; SIP adds TLS, RTP/SRTP, firewall, codec, port-range, and registration operations.
- **Authentication:** Meta SIP settings plus connection-scoped SIP/PBX credentials, never mobile secrets.
- **Events:** correlate SIP dialogs and Meta events through internal provider identity; never expose SIP/Meta call IDs as public IDs.
- **Background/scale:** depends on the PBX, push strategy, and client; it is more operationally complex but useful for PBX, queues, enterprise routing, and server-side media.
- **Recording:** potentially easier in a controlled media plane, but still subject to consent and retention rules.
- **Decision:** defer until an enterprise PBX/SIP requirement or a failed WebRTC POC justifies it.

## Canonical public CallSession

```json
{
  "callSessionId": "canonical-call-session-id",
  "workspaceId": "workspace-id",
  "contactId": "contact-id",
  "agentId": "agent-id",
  "whatsappNumberId": "canonical-number-id",
  "direction": "inbound",
  "mediaKind": "voice",
  "state": "initiated",
  "startedAt": "2026-09-11T00:00:00.000Z",
  "ringingAt": null,
  "connectedAt": null,
  "endedAt": null,
  "durationSeconds": null,
  "provider": "meta",
  "providerConnectionId": "internal-connection-id",
  "recording": null
}
```

Meta call IDs, webhook IDs, WABA/phone IDs, SDP, SIP references, raw payloads, permission tokens, and credential material remain in internal provider-identity/raw-event records. `callSessionId` never changes if a fallback provider is later used.

The future public API must never accept a provider ID as the public session ID and must never infer workspace, contact, agent, number, or provider from the first row or contact ID alone.

## Evidence-driven canonical states

Allowed states are a contract target, not an implementation in this PR:

- `initiated`
- `permission_required`
- `permission_requested`
- `permission_granted`
- `queued`
- `ringing`
- `connected`
- `ended` / `completed`
- `busy`
- `rejected`
- `no_answer`
- `canceled`
- `failed`
- `missed`

Only observed Meta/WebRTC/SIP evidence may create a transition. Raw provider state is stored separately. Do not invent `ringing`, `connected`, `ended`, duration, recording, or permission state from a message event or a contact row. Terminal state is not overwritten by a late non-authoritative event; authoritative reconciliation records a correction observation.

## User-initiated calling flow

```text
WhatsApp user
  → calls business Cloud API number
  → Meta calls webhook
  → raw receipt and signature verification
  → exact WABA + phone → workspace + number + Meta connection
  → canonical CallSession
  → approved WebRTC offer/answer handling
  → accept/reject/timeout/end/missed evidence
  → agent/browser/mobile surface
```

The POC must capture redacted fixtures for the actual call-created/connect/terminate and error events emitted by the selected Meta configuration. The current message normalizer must not be reused as a call normalizer by analogy.

For user-initiated calls:

- subscribe to the `calls` webhook field unless the approved SIP design uses its documented subscription model;
- verify raw signature and persist before asynchronous normalization;
- deduplicate by workspace, exact provider connection, and external event identity where available;
- resolve by WABA and phone number, never by GHL contact ID alone;
- handle SDP/ICE, ringing, accept/reject/end, timeout, duplicate, replay, out-of-order, reconnect, and reconciliation evidence;
- expose the exact Sales/Support number context to the agent.

## Business-initiated calling flow

The future outbound action is gated by real Meta eligibility, not UI optimism:

1. Verify exact number readiness and `canBusinessInitiateCall=true`.
2. Verify contact permission state, expiry, revocation, unanswered/rejected restrictions, country eligibility, and account quality restrictions.
3. Do not render or enable a Call button while any required capability is unknown or false.
4. Create one idempotent canonical session and retain the internal Meta call reference.
5. Invoke the documented Calling API Graph action from the server-side Graph client.
6. Process the Call Connect webhook and SDP answer, then establish the approved WebRTC connection.
7. Normalize ringing/connected/terminal evidence and reconcile retries, rejection, no-answer, and network interruption.

The POC must establish the exact permission request/status/revocation contract, Graph request payloads and action names, webhook sequence, caller identity, idempotency behavior, per-user limits, and expiry. Until proven, `canBusinessInitiateCall` is false.

## Provider-neutral eligibility representation

The readiness object is per exact connected WhatsApp number and must contain status/reasons only:

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
  "blockingReasons": ["not_checked"]
}
```

Required checks include Cloud API versus WhatsApp Business App, exact WABA/app, app-to-WABA subscription, `whatsapp_business_messaging`, `calls` subscription, phone-number Calling settings, call icon, calling hours, callback request settings, production/test threshold, country, inbound enablement, business-initiated availability, account restrictions, and test/production mode.

This is a documentation contract only. Current diagnostics do not yet implement Calling settings; adding those fields requires verified Meta responses and a narrowly scoped follow-up.

## Webhook and reconciliation rules

- Extend the existing Meta webhook receiver with a separate calling service/normalizer behind the same raw-body, signature-verified route.
- Store exact raw body, signature result, provider connection, WABA/phone binding, event identity, received time, and processing status before normalization.
- Deduplicate by `(workspaceId, providerConnectionId, externalCallEventId)` where available; otherwise use a bounded collision-safe hash.
- ACK only after durable receipt. Processing is retryable and dead-lettered.
- Accept duplicates and out-of-order events; canonical transitions must converge.
- Reject unknown/ambiguous assets. There is no first-number or cross-workspace fallback.
- Reconcile after application/network interruption and preserve raw and canonical audit history.

## GHL external-call mapping

Treat Meta calls as an external WhatsApp call activity unless an official native HighLevel telephony contract is separately verified. Preserve canonical session ID, internal Meta identity, exact workspace/contact/number, direction, agent, timestamps, duration, canonical/raw status, and opaque recording reference. Do not label Meta calling as native HighLevel telephony and do not route by GHL contact ID alone.

## Security and media requirements

- Meta credentials remain server-side and envelope-encrypted.
- Mobile/browser receives only short-lived or opaque authorization.
- WebRTC offer/answer, ICE, TURN, microphone permission, mute, speaker, Bluetooth route, device switching, reconnect, and teardown require a physical/client POC.
- Plan TURN for production reliability; do not assume direct ICE works across enterprise/mobile networks.
- Recording is disabled for MVP. If enabled later, require consent, jurisdiction, retention, deletion, access authorization, and audit.
- Enforce workspace/RBAC/number ownership, rate/concurrency/spend controls, idempotency, replay protection, and fraud monitoring.

## Mandatory gate before #55

1. Meta Cloud API test/production number and exact WABA/app binding confirmed.
2. `calls` webhook delivery and raw signature verification pass.
3. Calling phone-number settings, call icon, hours, callback settings, permission, and account status are captured.
4. One inbound audio call succeeds.
5. One business-initiated audio call succeeds where the account/number is eligible.
6. WebRTC SDP/ICE connection succeeds; TURN behavior is tested or explicitly ruled out for the target network.
7. Foreground, background/terminated, microphone, mute, speaker, Bluetooth, reconnect, and teardown behavior are tested.
8. Reject, no-answer, timeout, duplicate, replay, out-of-order, and network interruption behavior converges.
9. Exact multi-number tenant isolation is proven.
10. No Meta secret or long-lived credential is exposed to a client.
11. CallSession persistence and GHL external-call fixture are verified.
12. Owner explicitly comments that #51 is `approved/unblocked`.

Until item 12 exists, #55 remains blocked and no calling implementation branch may be created.

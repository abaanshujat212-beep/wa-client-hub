# ADR-002: Meta-native WhatsApp Calling gate and provider-neutral contract

- Status: **Proposed / blocked pending #51 POC and owner approval**
- Date: 2026-09-11
- Tracking issue: [#51](https://github.com/abaanshujat212-beep/wa-client-hub/issues/51)
- Implementation issue: [#55](https://github.com/abaanshujat212-beep/wa-client-hub/issues/55)
- Parent epic: [#49](https://github.com/abaanshujat212-beep/wa-client-hub/issues/49)

## Decision

Meta WhatsApp Business Calling API is the primary native WhatsApp calling candidate, subject to verified account/number eligibility, required permissions, official Calling API availability, and successful POC validation.

Provider hierarchy:

1. **Meta WhatsApp Business Calling API** — primary native WhatsApp calling path.
2. **SIP** — optional Meta-supported enterprise/PBX path where supported or required.
3. **Telnyx, Twilio, Vonage, and Plivo** — PSTN/SIP fallback or adjacent telephony options, not the primary WhatsApp-native path.

This ADR authorizes documentation and a bounded POC only. It does not authorize #55 implementation, production routes, a call UI, a media service, SIP infrastructure, migrations, or enabling a production calling flag. #55 remains blocked until every hard gate passes and the owner explicitly approves #51.

## Verified official basis

Meta's current official documentation confirms:

- Cloud API can receive user-initiated VoIP calls and place permissioned business-initiated VoIP calls.
- Calling settings and call actions are scoped to an exact `PHONE_NUMBER_ID`.
- The default signaling model uses Graph API actions and the WABA `calls` webhook field.
- The default media model is WebRTC with RFC 8866 SDP, ICE, DTLS-SRTP, and OPUS.
- SIP is optional, requires explicit enablement, and replaces Calling Graph signaling for that number while enabled.
- User-initiated calling is available wherever Cloud API is available.
- Business-initiated calling is documented everywhere Cloud API is available except US, Canada, Egypt, Vietnam, and Nigeria based on the business-number country code. Pakistan is not excluded, but account/number eligibility still requires a live check.
- Video and screen sharing are not production assumptions; Meta marks richer video-related capabilities as planned or in development.

Evidence and endpoint details are maintained in `docs/calling-provider-research-51.md`.

## Existing repository foundation and reuse boundary

Calling must reuse the current Meta connection and exact routing chain:

`workspace → conversation → WhatsApp number → provider connection → provider adapter`

Reusable components include Embedded Signup, encrypted provider credentials, `meta_connection_assets` WABA/phone binding, `MetaGraphClient`, raw-body webhook signature verification, durable receipt/deduplication, and exact WABA + phone-number resolution. Calling must not create another Meta connection, number record, vault, or webhook trust model.

Unknown or ambiguous assets must fail closed. Never select the first workspace number/provider, infer a number from contact alone, or cross workspace/provider boundaries.

## Architecture

### Primary POC: Graph API + Webhooks + WebRTC

- Settings: `GET/POST /<PHONE_NUMBER_ID>/settings`.
- Call actions: `POST /<PHONE_NUMBER_ID>/calls` with `connect`, `pre_accept`, `accept`, `reject`, or `terminate` as appropriate.
- Permission readiness: `GET /<PHONE_NUMBER_ID>/call_permissions` for the exact user/BSUID.
- Permission requests: existing Messages API using free-form interactive or approved template flows.
- Webhooks: WABA `calls` field; Connect, business-call status (`RINGING`, `ACCEPTED`, `REJECTED`), and Terminate evidence.
- Media: RFC 8866 SDP; ICE + DTLS-SRTP; OPUS default. Meta uses ICE-lite and the business side takes the controlling role.
- NAT: Meta provides no STUN/TURN infrastructure. Whether our client/media endpoint needs STUN/TURN is unverified and must be proven, not assumed.
- Client: future approved browser/React Native surface owns microphone permission, peer connection, mute, speaker/Bluetooth route, reconnect, and teardown. No Meta app secret or long-lived token reaches the client.

### Optional enterprise/PBX path: SIP

SIP is explicitly enabled per business phone number and uses TLS plus digest authentication. While enabled, the number uses SIP instead of Calling Graph endpoints. SIP lifecycle webhooks are disabled by default but can be enabled. Choose SIP only for a proven PBX, queueing, BYOC, server-side media, or enterprise requirement; it is not required for the initial Meta Calling POC.

## Canonical CallSession contract

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
  "recording": null
}
```

Meta call IDs, event IDs, WABA/phone IDs, SDP, SIP references, provider connection IDs, access tokens, and raw payloads remain internal. Public APIs use only canonical identifiers.

Canonical transitions are evidence-driven. Preserve raw Meta status separately. Do not invent connected/ended/duration/recording facts, overwrite a terminal state with late non-authoritative delivery, or assume webhook ordering/exactly-once delivery.

## Eligibility contract

Readiness is calculated for each exact business phone number and contact permission. Fail closed unless all required evidence is true:

- Cloud API number, not WhatsApp Business app;
- exact WABA/app/phone binding;
- app subscribed to the WABA and `calls` field;
- `whatsapp_business_messaging` permission;
- `whatsapp_business_management`/Advanced Access where settings are managed for end clients;
- Calling enabled in phone-number settings;
- number-level icon, hours, callback, audio, and SIP settings captured;
- production 2,000-recipient messaging threshold or valid test-number exemption;
- WABA credit line/payment readiness;
- country availability and account quality/restriction state;
- user permission and `start_call.can_perform_action` for business-initiated calls.

Pakistan is a documented candidate because it is not in Meta's current business-initiated exclusion list. That does not replace an actual settings/permission response or live Pakistan-number POC.

## Security and operations

- Keep credentials server-side and encrypted.
- Reuse exact WABA + phone + workspace webhook resolution.
- Verify signatures over the exact raw body and durably persist before asynchronous processing.
- Handle duplicate, replayed, stale, delayed, and out-of-order events.
- Enforce RBAC, workspace/number ownership, idempotency, concurrency/rate/spend controls, and audit.
- Audio only for this gate. Recording/transcription is out of scope unless separately approved with consent, retention, deletion, and access controls.

## Mandatory gate before #55

1. Exact Meta Cloud API number, WABA, app, credit line, payment/account status, and settings confirmed.
2. Required permissions/Advanced Access and `calls` subscription confirmed.
3. `call_permissions` behavior captured for no, temporary, permanent, expired, revoked, and rate-limited permission.
4. Signed Connect/status/Terminate webhook fixtures captured; duplicate/order behavior proven.
5. One inbound audio call succeeds on the exact test number.
6. One permissioned business-initiated audio call succeeds if the account/number is eligible.
7. RFC 8866 SDP and ICE/DTLS-SRTP media succeeds; actual STUN/TURN needs recorded.
8. Foreground/background client behavior, permissions, mute, audio route, reconnect, reject, timeout, and teardown tested.
9. Exact multi-number and tenant isolation proven.
10. No secret or long-lived credential exposed to a client.
11. Canonical CallSession and GHL external-activity fixture approved.
12. Owner explicitly comments that #51 is `approved/unblocked`.

Until item 12 exists, #55 remains blocked and no calling implementation branch may be created.

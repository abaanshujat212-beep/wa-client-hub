# Meta WhatsApp Business Calling research for #51

- Status: **Official capability verified; account/number POC still blocked — #55 remains blocked**
- Evidence refreshed: 2026-09-11
- Base reviewed: `main` at `e59750624e7a3a00f0375675611ea6acccb2d40b`
- Scope: documentation and POC planning only; no calling implementation or production enablement.

## Decision and provider hierarchy

1. **Meta WhatsApp Business Calling API** — primary native WhatsApp calling path.
2. **SIP** — optional Meta-supported enterprise/PBX signaling path where operationally justified or required.
3. **Telnyx, Twilio, Vonage, and Plivo** — PSTN/SIP fallback or adjacent telephony options, not the primary WhatsApp-native path.

Meta officially documents WhatsApp Business Calling through Cloud API for user-initiated and business-initiated VoIP calls. This corrects the earlier statement that no verified Meta calling capability existed. It does not prove that this repository's Meta account, WABA, app, or phone number is currently eligible or configured, and it does not authorize #55.

> Meta WhatsApp Business Calling API is the primary native WhatsApp calling candidate, subject to verified account/number eligibility, required permissions, official Calling API availability, and successful POC validation.

## Official Meta documentation used

- [Cloud API Calling overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling) — updated Jun 26, 2026.
- [API and Webhook Reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/reference) — updated Jun 26, 2026.
- [User-initiated calls](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls) — updated Jun 24, 2026.
- [Business-initiated calls](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls) — updated Jun 26, 2026.
- [Obtain user call permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions) — updated Jun 26, 2026.
- [Configure Call Settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings) — updated Jul 6, 2026.
- [SIP Configuration Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip) — updated Aug 20, 2026.
- [WhatsApp webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) — updated Jun 26, 2026.
- [Calling FAQ](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/faq) — updated Jun 26, 2026.

## Verified Meta capability

### Number-level settings and required endpoints

Calling is configured and invoked on an exact Cloud API business phone-number ID:

| Purpose | Official endpoint |
|---|---|
| Get number calling settings | `GET /<PHONE_NUMBER_ID>/settings` |
| Configure number calling settings | `POST /<PHONE_NUMBER_ID>/settings` with a `calling` object |
| Initiate a business call | `POST /<PHONE_NUMBER_ID>/calls`, `action: connect`, recipient, and RFC 8866 SDP offer |
| Pre-accept inbound call (recommended) | `POST /<PHONE_NUMBER_ID>/calls`, `action: pre_accept`, call ID, and SDP answer |
| Accept inbound call | `POST /<PHONE_NUMBER_ID>/calls`, `action: accept`, call ID, and SDP answer |
| Reject inbound call | `POST /<PHONE_NUMBER_ID>/calls`, `action: reject` |
| Terminate active call | `POST /<PHONE_NUMBER_ID>/calls`, `action: terminate` |
| Read user permission/action readiness | `GET /<PHONE_NUMBER_ID>/call_permissions?user_wa_id=...` or `?recipient=<BSUID>` |
| Send free-form permission request | `POST /<PHONE_NUMBER_ID>/messages` with interactive type `call_permission_request` inside an open customer-service window |
| Create permission-request template | `POST /<WABA_ID>/message_templates` |
| Send permission-request template | `POST /<PHONE_NUMBER_ID>/messages` |

This confirms that calling is per business phone number. The same verified WhatsApp number can be used for messaging and calling.

### Webhooks

For the default Graph/Webhook architecture, subscribe the app to the WABA and the `calls` webhook field. Verified call notifications include:

- Call Connect webhook with `field: calls`; inbound provides an SDP offer, business-initiated provides an SDP answer.
- Business-initiated status webhook with `RINGING`, `ACCEPTED`, or `REJECTED`.
- Call Terminate webhook with direction, status, timestamps, and duration fields where supplied.

The general webhook documentation requires `whatsapp_business_messaging` for messages and calls webhooks. `whatsapp_business_management` is required to read/manage phone-number settings; Advanced Access is required when acting for end-business clients. The existing raw-body webhook signature verification must remain in place. Meta does not guarantee exactly-once delivery or ordering for calling webhooks, so deduplication and out-of-order convergence are required.

### Eligibility and account requirements

Official prerequisites currently state:

- the business number must use Cloud API, not the WhatsApp Business app;
- the same Meta app must be subscribed to the WABA and have messaging permission for the number;
- calling is disabled by default and must be enabled per phone number;
- production use requires a daily messaging limit of at least 2,000 unique recipients;
- a credit line must be attached to the WABA;
- Meta business verification is not itself a Calling API prerequisite;
- public test numbers can test without the 2,000-recipient threshold; Calling must still be enabled on the test number;
- sandbox accounts are available only to Tech Partners.

Account quality, policy restrictions, low-pickup/user-feedback restrictions, payment status, app mode, rollout state, and the actual settings returned for our number remain account-level gates.

### User-initiated calls

User-initiated calling is officially available wherever Cloud API is available. A WhatsApp user calls the exact business number, Meta sends a Call Connect webhook with an SDP offer, and the business uses the Calls API to pre-accept/accept/reject/terminate. Meta documents roughly 30–60 seconds to accept after the connect webhook. Supported consumer origins include primary iPhone/Android devices and phone companion devices; callback-permission behavior on companion devices is not yet supported.

### Business-initiated calls and permissions

A business must have permission from the WhatsApp user before calling. Permission can be obtained through a free-form request during an open customer-service window, a template request, callback permission after the user calls, or the user's business-profile setting.

Verified production rules include:

- temporary permission lasts 7 calendar days (168 hours);
- permanent permission remains until the user revokes it;
- the user controls grant/revocation;
- permission-request limits are 1 per 24 hours and 2 per 7 days per business-number/user pair;
- 2 consecutive unanswered/rejected business calls trigger a reconsideration message;
- 4 consecutive unanswered/rejected calls revoke approved permission;
- a maximum of 100 connected calls per 24 hours is documented for the business-number/user pair;
- the business-call initiation endpoint documents 10,000 initiation requests per 24 hours per business phone number.

The live `call_permissions` response is authoritative for `send_call_permission_request` and `start_call`; UI must fail closed when `can_perform_action` is false or unknown.

### WebRTC, SDP, ICE, and codecs

The default configuration is Graph APIs + Webhooks for signaling and WebRTC for media:

- SDP must comply with RFC 8866.
- Media uses ICE + DTLS-SRTP; OPUS is always enabled and is the recommended default.
- PCMA/PCMU can be enabled as additional codecs in number settings.
- Meta uses ICE-lite; the business-side ICE agent must take the controlling role.
- Meta does not provide STUN/TURN infrastructure. STUN/TURN is not mandatory merely to discover candidates, but the actual media endpoint/NAT design must be proven in the POC.
- Exact SDP serialization, candidate selection, latency, firewall, reconnect, and physical-device behavior remain POC evidence.

Video and screen sharing are described by Meta as planned or in development, so this gate is **audio-only**. Recording/transcription are not assumed as Calling API deliverables.

### SIP

SIP is supported but optional. It requires explicit enablement per phone number and a standards-compliant SIP server using TLS and digest authentication. When SIP is enabled, that number uses SIP signaling instead of Calling Graph endpoints. Calling webhooks are disabled by default in SIP mode but lifecycle delivery can be explicitly enabled. SIP is therefore an enterprise/PBX alternative, not an MVP dependency.

## Country and Pakistan conclusion

- User-initiated calling: available wherever Cloud API is available.
- Business-initiated calling: current Meta overview says available wherever Cloud API is available except the United States, Canada, Egypt, Vietnam, and Nigeria, based on the **business phone number country code**. The consumer can be in any Cloud API country.
- Pakistan is not on that published exclusion list. This verifies Pakistan as a documented candidate, not that our Pakistan-linked account/number is enabled or approved.

Before any claim or POC success, verify the exact Pakistani business number's Cloud API status, country code, WABA credit line, 2,000-recipient production threshold or test-number exemption, settings response, permissions, payment/account quality, and actual inbound/outbound test behavior. Regulatory, recording-consent, data-processing, client availability, and commercial pricing questions remain separate.

## Repository reuse decision

The existing exact mapping can and should be reused:

`workspace → conversation → WhatsApp number → provider connection → Meta adapter`

`meta_connection_assets` already binds the WABA and phone-number ID to the encrypted Meta provider connection and canonical number. The existing Embedded Signup, credential vault, versioned Graph client, webhook verification, durable receipt, and exact WABA/phone/workspace resolution are the correct foundation. Calling must not create a parallel connection model and must never use first-number, first-provider, contact-only, or cross-workspace fallback.

What is not yet implemented: call-event normalization, Calling settings diagnostics, permission readiness, canonical CallSession persistence, call actions, WebRTC/mobile media, and Calling UI. Those are POC/#55 concerns and are not authorized by this documentation PR.

## Required POC before #55

#55 remains blocked until the checklist and owner approval pass, including exact number/account eligibility, settings and permissions evidence, signed `calls` webhook fixtures, one inbound audio call, one eligible business-initiated audio call, SDP/ICE media, Android/browser foreground and background behavior, failure/retry/order handling, tenant and multi-number isolation, security review, and explicit owner approval.

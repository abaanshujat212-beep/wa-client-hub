# Meta WhatsApp Business Calling POC checklist for #51

This checklist validates official capability against our actual Meta account and number. It is not #55 implementation. Use a public test number or disposable non-production account where possible; do not enable production customer traffic.

## Provider hierarchy and scope

- [ ] Meta WhatsApp Business Calling API is recorded as the primary native WhatsApp calling path.
- [ ] Graph API + Webhooks + WebRTC is the primary audio POC.
- [ ] SIP remains optional for an approved enterprise/PBX requirement.
- [ ] Telnyx/Twilio/Vonage/Plivo remain PSTN/SIP fallback or adjacent options.
- [ ] Video, screen sharing, recording, and transcription are not claimed as MVP capabilities.
- [ ] #55 remains blocked throughout this checklist.

## Official evidence snapshot

- [ ] Attach the retrieval date and links for the Meta Calling overview, API/Webhook Reference, user-initiated guide, business-initiated guide, call-permissions guide, call-settings guide, SIP guide, webhook overview, and FAQ.
- [ ] Recheck the country exclusion list, limits, permissions, Graph API version, and changelog immediately before the POC.
- [ ] Record conflicts or changed official limits as `unverified` until confirmed by the live API/account.

## Exact account and number readiness

For each exact connected WhatsApp number:

- [ ] Confirm it is a Cloud API number, not a WhatsApp Business app number.
- [ ] Match exact WABA ID, phone-number ID, display number, Meta app, workspace, canonical number, and encrypted Meta provider connection.
- [ ] Confirm the same app is subscribed to the WABA and `calls` webhook field.
- [ ] Confirm `whatsapp_business_messaging`.
- [ ] Confirm `whatsapp_business_management` and required Advanced Access for end-business settings management.
- [ ] Confirm WABA credit line/payment readiness; never record credentials.
- [ ] Confirm production daily messaging limit is at least 2,000 unique recipients, or document the public-test-number exemption.
- [ ] Record whether the account is a Tech Partner sandbox or public test number; sandboxes are not assumed available.
- [ ] `GET /<PHONE_NUMBER_ID>/settings` and record redacted Calling status, icon visibility/countries, hours, callback permission, codecs, and SIP status.
- [ ] Calling remains disabled until the owner approves the disposable test number and settings change.
- [ ] If approved for the test number, enable only the minimum required Calling settings with `POST /<PHONE_NUMBER_ID>/settings`.
- [ ] Capture account quality, policy restrictions, low-pickup/user-feedback restrictions, app mode, rollout status, and Health/API evidence.

## Pakistan gate

- [ ] Confirm the business phone-number country code and current Meta availability list.
- [ ] Record that Pakistan is not in the current published business-initiated exclusion list; do not treat this alone as account approval.
- [ ] Verify user-initiated behavior on the actual Pakistan-linked number/account.
- [ ] Verify business-initiated permission and `start_call.can_perform_action` on the actual number/user pair.
- [ ] Capture latency/media quality on representative Pakistani mobile and fixed broadband networks.
- [ ] Obtain owner/compliance review for local law, consent, data processing, and any recording scope.

## User-initiated audio call

- [ ] WhatsApp user calls the exact business number.
- [ ] Receive signed `field: calls` Connect webhook with WABA and phone-number metadata and RFC 8866 SDP offer.
- [ ] Resolve exactly: workspace → conversation/contact → WhatsApp number → Meta connection → Meta adapter.
- [ ] Reject unknown, ambiguous, wrong-workspace, wrong-number, and wrong-provider assets.
- [ ] Pre-accept with `POST /<PHONE_NUMBER_ID>/calls`, `action: pre_accept`, and matching SDP answer, or document why direct accept was used.
- [ ] Accept/reject within Meta's documented approximately 30–60 second window.
- [ ] Verify media starts only after successful accept/pre-accept timing.
- [ ] Terminate with the Calls API when the business ends the call, even if RTCP BYE occurs.
- [ ] Capture Terminate webhook and conservatively map status/timestamps/duration.
- [ ] Test timeout, missed, rejected, duplicate, stale, delayed, replayed, and out-of-order events.
- [ ] Test eligible primary and supported phone-companion consumer devices; mark unsupported companion callback behavior explicitly.

## Business-initiated audio call and permission

- [ ] Query `GET /<PHONE_NUMBER_ID>/call_permissions` for the exact user phone/BSUID.
- [ ] Persist permission status separately from call status.
- [ ] Test no permission, temporary permission, permanent permission, expiry, user revocation, and automatic revocation.
- [ ] Verify `send_call_permission_request.can_perform_action` and `start_call.can_perform_action`; fail closed on false/unknown.
- [ ] Send a free-form interactive permission request only in an open customer-service window, or use an approved permission-request template.
- [ ] Verify current limits: 1 request/24h, 2 requests/7d; temporary permission 168h; unanswered/rejected restriction behavior.
- [ ] Initiate with `POST /<PHONE_NUMBER_ID>/calls`, exact number/user, `action: connect`, and RFC 8866 SDP offer.
- [ ] Receive Connect webhook with SDP answer, then status evidence for `RINGING`, `ACCEPTED`, or `REJECTED` where emitted.
- [ ] Complete one eligible business-initiated call or attach the exact account/number block as a failed hard gate.
- [ ] Do not render an outbound Call action unless the exact number and user action are currently eligible.

## WebRTC and media

- [ ] Use RFC 8866 SDP with correct CRLF serialization.
- [ ] Verify ICE + DTLS-SRTP and OPUS; enable PCMA/PCMU only if required and tested.
- [ ] Business ICE agent uses the controlling role against Meta ICE-lite.
- [ ] Record actual candidates, firewall/UDP behavior, latency, and media endpoint location without storing secrets or unnecessary personal data.
- [ ] Record that Meta provides no STUN/TURN service and determine through POC whether our endpoint needs STUN/TURN.
- [ ] Test microphone permission, mute/unmute, speaker, Bluetooth/audio route, device switching, reconnect, network transition, and teardown.
- [ ] Test browser/React Native foreground behavior.
- [ ] Test Android background and terminated/force-stopped behavior; claim only what succeeds.
- [ ] No Meta app secret, system token, long-lived token, or SIP password reaches browser/mobile code or logs.

## Webhook, state, and isolation

- [ ] Verify exact raw-body signature and reject invalid signatures.
- [ ] Durably receipt before asynchronous normalization.
- [ ] Deduplicate per workspace + provider connection + call/event identity.
- [ ] Do not assume exactly-once delivery or webhook ordering.
- [ ] Preserve raw Meta state separately from canonical state.
- [ ] Terminal state is not overwritten by late non-authoritative evidence.
- [ ] Retry/dead-letter/operator replay and reconciliation are bounded and audited.
- [ ] Sales and Support numbers on the same contact cannot share calling context.
- [ ] No first-number, first-provider, contact-only, or cross-workspace fallback exists.
- [ ] Test RBAC, concurrency, destination, duration, rate/spend, and abuse controls.

## Optional SIP checkpoint

- [ ] Do not enable SIP unless PBX/enterprise requirements justify it.
- [ ] If tested, use a standards-compliant SIP server with TLS and digest authentication.
- [ ] Confirm that SIP mode replaces Calling Graph signaling for that exact number.
- [ ] Explicitly enable SIP lifecycle webhook delivery if required; it is off by default.
- [ ] Test SIP credentials, SDP/media mode, firewall/NAT, codecs, call-ID correlation, BYE, and reconciliation separately.
- [ ] Keep all SIP credentials server-side and connection-scoped.

## Exit and unblock rule

- [ ] Attach redacted settings, permission responses, Graph requests/responses, webhook fixtures, SDP/ICE notes, client results, and failure evidence to #51.
- [ ] Confirm exact multi-tenant routing and no-secret exposure.
- [ ] Update ADR-002 with observed capabilities and deviations.
- [ ] Owner explicitly comments that #51 is `approved/unblocked`.
- [ ] Only after every hard gate and owner approval may a separate #55 implementation branch/PR be created.

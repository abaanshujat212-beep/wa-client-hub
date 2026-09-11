# Calling-provider research for #51

- Status: **Research/POC preparation only — #55 remains blocked**
- Snapshot refreshed: 2026-09-11
- Base reviewed: `main` at `82ce66c1c1726b40f3be3bd862a3a8b18aa1b2f6`
- Existing research snapshot: issue #51 comment `5575613769`

This document preserves the required distinctions:

- Pakistan local-number availability is not the same as outbound termination to Pakistan.
- Inbound Pakistan calling is a separate finding.
- PSTN, SIP/BYOC, and app-to-app/WebRTC are separate products and failure domains.
- Technical recording support is not legal permission or consent to record.
- Meta WhatsApp Cloud API messaging is not evidence of general-purpose WhatsApp voice/video calling.

## Current conclusion

`CONDITIONAL GO` for a **Telnyx Pakistan POC**, with **Twilio as provisional fallback**. This is not an approval to implement #55. No provider is selected until the owner approves weights and primary/fallback, vendors confirm unresolved commercial/compliance facts, and the mandatory live POC passes.

## Current official evidence

### Telnyx

- The Pakistan numbers page advertises Pakistani virtual numbers, local presence, porting, and the ability to make/receive calls; it does not prove live inventory for this account, eligibility, KYC, resale/suballocation, caller-ID policy, or every Pakistani network. [Pakistan numbers](https://telnyx.com/phone-numbers/pakistan)
- Telnyx’s 2025 release states that Pakistan geographical outbound voice was added to its two-way voice coverage. This is evidence of a product claim, not a completed Pakistan test or a current prefix-rate quote. [Coverage release](https://telnyx.com/release-notes/voice-coverage-update-aug-2025)
- The official React Native documentation describes a React Native WebRTC voice SDK, Android FCM incoming-call handling, background/terminated handling, and call controls. Native setup and a physical-device POC remain required. [React Native SDK](https://developers.telnyx.com/docs/development/webrtc/react-native-sdk) · [Android/background setup](https://developers.telnyx.com/docs/development/webrtc/react-native-sdk/push-notification/app-setup)
- Pakistan number documentation lists country-specific required-document categories. The exact category, KYC, address, business, porting, and account-eligibility result for this owner remain vendor-confirmation items. [Required documents](https://support.telnyx.com/en/articles/5469551-international-numbers-required-documents)
- Exact Pakistan termination rates, caller-ID behavior by mobile/fixed network, recording-region commitments, and live inventory are unresolved.

### Twilio

- Current official Pakistan Voice pricing shows `$0.1550/min` for local Pakistan termination, `$0.1800/min` for Pakistan mobile termination, and `$0.0040/min` for browser/app and SIP legs. The page does not establish that a Pakistan local DID can be purchased for this account or that inbound Pakistan calling is available through a local number. [Pakistan Voice pricing](https://www.twilio.com/en-us/voice/pricing/pk)
- The official React Native SDK supports backend-issued access tokens, incoming call registration/call invites, and outgoing connection. Android push and physical-device behavior still require the POC. [Voice React Native SDK](https://www.twilio.com/docs/voice/sdks/react-native)
- Twilio documents signed Voice webhooks and recording status callbacks. Retry, ordering, and reconciliation behavior must be exercised in the POC. [Voice webhooks](https://www.twilio.com/docs/usage/webhooks/voice-webhooks) · [Webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- Twilio’s published pricing is useful for planning only; taxes, carrier fees, number rental, recording/storage, failed-call billing, and account-specific restrictions remain separate.

### Vonage

- The Voice API documents PSTN call flows, signed/event webhooks, detailed lifecycle statuses, recording, and SIP-related capabilities. [Voice API](https://developer.vonage.com/en/api/vonage-business-cloud/call-recording) · [Webhook reference](https://developer.vonage.com/en/voice/voice-api/webhook-reference)
- The Client SDK provides Android/iOS WebRTC in-app voice, mute, reconnect, and related controls; the Android guide documents API-level requirements. [In-app voice](https://developer.vonage.com/en/vonage-client-sdk/in-app-voice/overview) · [Android SDK](https://developer.vonage.com/en/vonage-client-sdk/add-sdk-to-your-app/android)
- A maintained first-party React Native package was not verified. React Native tutorials/native bridging exist, but maintenance and support for this product need confirmation.
- Pakistan local number, inbound Pakistan model, exact API rates, caller-ID constraints, KYC, and React Native support remain vendor-confirmation items. Global/business calling pages mentioning Pakistan are not sufficient evidence for API DID inventory.

### Plivo

- Current Pakistan Voice pricing advertises `$0.1410/min` local/mobile outbound, `$0.0033/min` Browser SDK/SIP, and **inbound not supported** on that country page. [Pakistan Voice pricing](https://www.plivo.com/voice/pricing/pk/)
- Plivo’s official mobile SDK notice says native Android/iOS SDKs are no longer supported, which is a hard blocker for selecting Plivo as the Android in-app provider. [Deprecated mobile SDKs](https://plivo.com/docs/voice/client/androidios/overview)
- Plivo documents Voice callbacks, duplicate delivery, retry behavior, and V3 signature validation. [Callbacks](https://www.plivo.com/docs/voice/concepts/callbacks) · [Signature validation](https://www.plivo.com/docs/voice/concepts/signature-validation)
- Plivo remains a possible backend PSTN/SIP carrier candidate, not the current React Native Android MVP provider. Pakistan KYC, number inventory, caller ID, and any contradiction between current SDK pages require written confirmation.

### Agora / SIP-oriented option

- The official React Native SDK supports Android/iOS real-time media and is maintained through Agora’s official extension repository. This is app-to-app/WebRTC media, not a Pakistani PSTN number. [React Native SDK](https://github.com/AgoraIO-Extensions/react-native-agora)
- Agora Cloud Recording supports cloud recording with delayed file availability and separate pricing/retention considerations. [Cloud Recording concepts](https://docs.agora.io/en/realtime-media/cloud-recording/core-concepts) · [Pricing](https://docs.agora.io/en/realtime-media/cloud-recording/reference/pricing)
- Agora’s PSTN/SIP gateway documentation describes a separate gateway/carrier design, requires provisioning, and includes Twilio configuration. It therefore adds a carrier/vendor boundary and does not prove Pakistan DID inventory or rates. [PSTN/SIP gateway](https://github.com/AgoraIO-Solutions/pstn-doc)
- Agora is not a standalone Pakistan PSTN provider for this pilot. It is only viable as a two-vendor WebRTC plus SIP/PSTN architecture after separate carrier approval.

## Pakistan findings

| Required question | Current evidence-backed conclusion | Gate status |
|---|---|---|
| Pakistan local number available? | Telnyx publicly advertises Pakistan numbers; live inventory, number type, eligibility, KYC, address/business requirements, porting, and resale restrictions are unverified. Twilio/Vonage API inventory is not proven from current public evidence. Plivo’s current Pakistan page does not support inbound. Agora is not a DID provider. | **Vendor/account confirmation required** |
| Outbound calls to Pakistan numbers supported? | Twilio and Plivo publish Pakistan outbound rates. Telnyx publicly announces Pakistan geographical two-way voice coverage. Vonage has Voice API capability but Pakistan prefix rate/CLI must be confirmed. Agora requires a separate carrier. | **Live prefix/network tests required** |
| Inbound Pakistan calling supported, through which number model? | Telnyx advertises make/receive behavior for Pakistan numbers but account eligibility and network reach are unverified. Twilio, Vonage, and Plivo local inbound models are not proven for this pilot; Plivo’s current Pakistan page says inbound is not supported. Agora depends on the separate carrier. | **Live inbound test and written confirmation required** |

No finding above is a regulatory, KYC, caller-ID, or number-inventory guarantee. Pakistan telecom/legal advice, vendor compliance guidance, and owner acceptance remain required.

## Provisional scoring matrix

Scores are 0–5 and are **not owner-approved**. `VC` means written vendor confirmation is required. Raw and weighted values are planning inputs only; they must be re-scored after the POC.

Provisional weights total 100 and intentionally preserve the issue’s distinction between local numbers, outbound termination, inbound calling, PSTN/SIP, and app/WebRTC:

| Criterion | Weight | Telnyx | Twilio | Vonage | Plivo | Agora/SIP |
|---|---:|---:|---:|---:|---:|---:|
| Pakistan local number availability | 12 | 4 VC | 1 VC | 1 VC | 0–1 VC | 0 |
| Outbound calling to Pakistan | 12 | 4 VC | 5 | 3 VC | 5 | 1 VC |
| Inbound Pakistan calling | 8 | 4 VC | 1 VC | 1 VC | 0 | 1 VC |
| International coverage | 5 | 4 | 5 | 5 | 5 | 5 RTC / not PSTN |
| React Native SDK quality | 12 | 4 | 5 | 2 VC | 0 for supported native SDK | 5 RTC |
| Inbound/outbound capability | 7 | 5 | 5 | 4 | 3 | 2 PSTN / 5 RTC |
| Recording support | 7 | 5 | 5 | 5 | 4 | 5 RTC |
| Webhook reliability/security | 7 | 4 VC | 4 | 4 | 4 | 2 VC for carrier |
| Call status granularity | 5 | 4 VC | 4 | 5 | 4 | 3 VC |
| Pricing | 7 | 3 VC | 2 | 2 VC | 4 | 5 RTC / carrier excluded |
| Data residency | 5 | 3 VC | 5 VC | 4 VC | 2 VC | 3 VC |
| GHL external-call mapping | 3 | 4 | 4 | 4 | 4 | 3 |
| SIP/BYOC | 4 | 5 | 5 | 5 | 5 | 4 |
| Caller ID/masking | 3 | 4 VC | 4 VC | 4 VC | 3 VC | 0 without carrier |
| Trial/sandbox | 3 | 4 VC | 5 | 4 | 5 | 5 RTC |

**Provisional recommendation:** Telnyx primary POC, Twilio fallback. This recommendation is not final until the owner approves the weights and vendors answer unresolved questions.

### Hard disqualifiers

- No supported Android/React Native path for the approved MVP.
- No lawful/commercial route to required Pakistan destinations.
- Unverified or spoofed caller ID is required.
- No signed/verifiable events or no way to reconcile final state.
- Recording cannot be disabled, retrieved, deleted, or governed by consent/retention policy.
- Provider credentials would need to be embedded in the mobile app.
- Provider identity cannot be preserved as an internal external-provider reference.
- Vendor cannot provide written Pakistan KYC/regulatory guidance.

## Unresolved vendor and owner questions

1. Can this Pakistan-based SaaS business provision local numbers for its own tenants, or would provisioning/resale require a different commercial agreement?
2. Which Pakistan fixed/mobile prefixes are available for termination and inbound origination?
3. What KYC, local address, business registration, porting, and caller-ID evidence are required?
4. Which CLI is displayed on Jazz, Zong, Ufone, Telenor, and a representative fixed network?
5. Exact Pakistan rates, billing increments, failed-call rules, number rental, recording, storage, transcription, and minimum commitments?
6. Can the chosen SDK deliver incoming calls while Android is foregrounded, backgrounded, force-stopped/terminated, or after network recovery?
7. What are event IDs, signatures, replay windows, retry policies, ordering guarantees, and delivery logs?
8. Which regions process/store signaling, recordings, logs, and transcripts, and what retention/deletion controls exist?
9. What trial/sandbox restrictions apply to Pakistan numbers, caller IDs, test destinations, recording, and concurrency?
10. Does the owner approve the proposed weights and Telnyx-primary/Twilio-fallback recommendation?

## Mandatory POC checklist

- [ ] Owner approves scoring weights and usage assumptions.
- [ ] Owner approves primary and fallback provisionally, subject to POC exit.
- [ ] Written vendor responses cover KYC, commercial eligibility, caller ID, inbound model, rates, regions, SDK support, and recording.
- [ ] Live/sandbox Pakistan-number inventory is confirmed.
- [ ] One disposable pilot number completes provisioning/KYC.
- [ ] Outbound tests reach representative Pakistani mobile and fixed networks.
- [ ] Inbound tests pass where the selected number model supports inbound.
- [ ] Caller-ID display is recorded and validated without spoofing.
- [ ] React Native Android POC covers outgoing, supported incoming, background/terminated delivery, mute, speaker, reconnect, and end.
- [ ] Signed webhook verification, replay rejection, duplicate, retry, and out-of-order fixtures pass.
- [ ] Recording is tested only with explicit consent; retrieval and deletion are verified.
- [ ] Provider CDR/invoice is reconciled against observed timestamps and duration.
- [ ] Workspace/device isolation and fraud/spend-limit tests pass.
- [ ] ADR is approved and the owner explicitly marks #51 unblocked.

Until every item is complete, **do not create #55 implementation work**.

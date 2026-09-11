# Calling provider POC checklist for #51

This is an execution checklist, not implementation of #55. It must be completed against a disposable non-production account and test number.

## Owner approvals

- [ ] Target countries and required Pakistan number model approved.
- [ ] Expected low/medium/high monthly minutes and concurrency approved.
- [ ] Recording jurisdictions, consent wording, retention, deletion, and legal-review owner approved.
- [ ] Matrix weights approved without changing them after seeing results.
- [ ] Telnyx primary / Twilio fallback recommendation approved provisionally.
- [ ] Budget and maximum daily/monthly spend approved.

## Vendor/commercial evidence

- [ ] Written answer from Telnyx on Pakistan inventory, KYC, local address/business requirements, porting, tenant resale, caller ID, inbound, and termination prefixes.
- [ ] Written answer from Twilio on Pakistan local-number availability, inbound model, CLI, account restrictions, and exact quote/rates.
- [ ] Written answer from any retained Vonage/Plivo/Agora carrier option on unresolved Pakistan and SDK requirements.
- [ ] Processing, recording, media, and data-residency terms recorded.

## Telnyx/Twilio sandbox or live tests

- [ ] Number inventory and eligibility confirmed.
- [ ] Outbound test to representative Jazz, Zong, Ufone, Telenor, and one fixed-line destination, where lawful and available.
- [ ] Inbound test from representative networks where the number model supports it.
- [ ] Caller-ID display captured and validated.
- [ ] Busy, no-answer, cancel, failure, reconnect, and network-loss cases captured.
- [ ] CDR/invoice duration and cost reconciled against observed timestamps.

## Android React Native POC

- [ ] Backend-issued short-lived token flow; no provider secret in the APK.
- [ ] Outgoing call.
- [ ] Incoming call where the approved provider supports it.
- [ ] Foreground ringing/connected/end.
- [ ] Background and terminated-app incoming behavior.
- [ ] Mute and speaker/audio-route behavior.
- [ ] Network interruption and reconnect.
- [ ] Remote logout/device revoke.
- [ ] Permission denial and recovery.

## Event/security/reconciliation tests

- [ ] Exact raw-body signature verification.
- [ ] Invalid signature rejection.
- [ ] Timestamp/replay-window rejection where supported.
- [ ] Duplicate event convergence.
- [ ] Out-of-order event convergence.
- [ ] Retry/dead-letter/replay behavior.
- [ ] Provider CDR reconciliation after app/network interruption.
- [ ] Workspace/device/agent/contact isolation.
- [ ] Per-agent/workspace/destination/concurrency/duration/spend limits.
- [ ] Abnormal-rate and suspicious-destination controls.

## Recording, if approved

- [ ] Explicit test-call consent captured.
- [ ] Recording availability and reference retrieval verified.
- [ ] Access authorization and audit verified.
- [ ] Provider deletion requested and deletion behavior verified.
- [ ] Retention and legal-hold behavior documented.

## Exit package

- [ ] Evidence links, raw redacted event fixtures, CDR/invoice, screenshots/logs, and vendor correspondence attached to #51.
- [ ] ADR-002 updated with observed provider capabilities and deviations.
- [ ] Owner explicitly comments that #51 is approved/unblocked.
- [ ] Only then may a separate `feat/provider-agnostic-calling` branch and #55 PR be created.

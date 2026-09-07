# Hybrid WhatsApp, CRM, mobile, and calling platform roadmap

## Product goal

Build one multi-tenant platform that supports:

- official Meta WhatsApp Cloud API messaging as the recommended production provider;
- optional legacy WhatsApp Web/OpenWA automation with explicit unofficial-provider risk guidance;
- manual WhatsApp Web messaging plus voice/video calls through a Windows browser;
- a unified inbox, contacts, delivery events, campaigns, and audit history;
- Shopify, GoHighLevel (GHL), WooCommerce/WordPress, and generic CRM connections;
- an Android-first React Native CLI companion app for agents, with iOS as a follow-up phase;
- a separate provider-agnostic calling subsystem with optional lawful recording, transcription, grounded AI summaries, and reviewed CRM follow-up;
- Docker deployment for the control plane while Windows workers retain browser/manual-calling duties.

OpenWA is an unofficial WhatsApp engine. The product must display account-risk guidance, enforce opt-in and suppression rules, and keep it isolated behind the provider abstraction. Meta Cloud API is the recommended production messaging provider. Calling is a separate subsystem: do not claim that Meta Cloud API supplies normal general-purpose WhatsApp voice/video calling for this mobile use case unless support is verified and approved for the exact implementation.

### Provider and client decisions

- GREEN-API is not a runtime dependency and no customer data or credentials are sent to it.
- Meta Cloud API is the recommended official production messaging provider.
- Self-hosted OpenWA remains an optional legacy automation/synchronization engine behind an internal adapter.
- The Windows browser worker remains the manual WhatsApp Web messaging and voice/video calling engine.
- The React Native app is a thin authenticated client; provider credentials and business logic remain in the backend.
- Mobile calling uses a provider-agnostic call adapter selected through a separate evaluation and ADR.
- PostgreSQL is the canonical source of truth for normalized messages, call sessions/events, consent, and connector synchronization.
- Provider-specific identifiers never become public API identifiers.

## Target architecture

```text
Web dashboard + React Native mobile companion
  -> Control API (users, workspaces, roles, billing, devices, connectors)
      -> PostgreSQL
      -> Redis-backed job queue
      -> Event router and unified conversation store
      -> Canonical send service
          -> Meta Cloud API adapter (recommended production messaging)
          -> OpenWA adapter (optional legacy messaging automation)
      -> Calling service
          -> Provider-neutral call session/state contract
          -> Selected calling provider adapter
          -> Recording/transcription/AI processing workers
      -> Windows worker adapter (Chrome profiles and manual WhatsApp Web calls)
      -> CRM adapters (Shopify, GHL, WooCommerce, generic REST/webhook)
      -> Realtime gateway for active web/mobile clients
      -> Push notification service for background mobile alerts
  -> Embedded Guacamole session for manual WhatsApp Web and calls
```

### Mobile messaging flow

```text
WhatsApp user
  -> Meta Cloud API / configured messaging provider
  -> WA Client Hub webhook and canonical inbox
  -> web and mobile realtime clients
  -> GHL Conversations where supported

Mobile reply
  -> authenticated WA Client Hub API
  -> canonical send service and policy checks
  -> exact workspace/number/provider connection
  -> Meta Cloud API / configured provider
  -> WhatsApp user
  -> canonical status and GHL status synchronization
```

The mobile app never contains Meta App Secret, permanent Meta tokens, GHL Client Secret, calling-provider credentials, or permanent provider secrets.

### Calling and post-call flow

```text
Mobile agent
  -> WA Client Hub call API
  -> canonical CallSession
  -> approved calling-provider adapter
  -> provider call events/webhooks
  -> canonical call state and history
  -> retrieve recording only if supported, enabled, lawful, and consented
  -> secure private storage
  -> transcription
  -> grounded structured summary and action extraction
  -> optional human review
  -> approved GHL call log/note/task synchronization
```

External/mobile calls must retain original source/provider metadata and must not be presented as native GHL telephony when they are not.

### Deployment boundary

The API, dashboard, PostgreSQL, Redis, messaging adapters, calling workers, processing workers, and Guacamole services run in controlled backend infrastructure. A signed Windows worker remains on each Windows host to launch isolated Chrome/Edge profiles and report session health. The React Native app communicates only with authenticated backend APIs and approved realtime/push services. Provider credentials and raw secret material never leave the backend.

## Delivery milestones

### M0 — Architecture and safety baseline

- Approve canonical message, contact, conversation, connector, consent, and delivery-event models.
- Add feature flags so OpenWA and each CRM connector can be enabled per workspace.
- Define secrets encryption, webhook verification, idempotency, retention, and audit rules.
- Define sending policies: verified opt-in, per-session rate limits, quiet hours, unsubscribe/suppression list, campaign pause/kill switch.

Exit: architecture decision record and database schema are reviewed; no bulk send can bypass consent or suppression checks.

### M1 — Docker control plane and Windows worker

- Docker Compose stack for app, PostgreSQL, Redis, migrations, health checks, and persistent volumes.
- Storage interface switched from JSON to PostgreSQL, with a tested JSON import and rollback procedure.
- Windows worker registration, heartbeat, capability report, signed commands, and workspace assignment.
- Guacamole access issued as short-lived, workspace-scoped connections.

Exit: existing accounts import successfully; dashboard can launch a browser on an assigned Windows worker from the Dockerized control plane.

### M2 — Messaging provider adapters

- Add official Meta Cloud API onboarding, verified webhooks, messages, templates, media, status, and diagnostics.
- Keep a pinned OpenWA image as a private optional legacy service.
- Map every messaging number/session to the correct workspace and provider connection.
- Proxy QR/status/send/media operations without exposing OpenWA administrator credentials.
- Verify webhook signatures, deduplicate events, normalize message status, and retry failures.
- Surface provider selection, provenance, health, and risk guidance.

Exit: dedicated test numbers can connect, receive, reply, send media, report statuses, and recover while tenant and number isolation tests pass.

### M3 — Unified inbox and manual handoff

- Persist normalized contacts, conversations, messages, attachments, delivery events, and assignments.
- Build inbox list/thread/search, unread counts, notes, tags, ownership, and real-time updates.
- Add an `Open manual WhatsApp` action that opens the scoped Guacamole/browser session where applicable.
- Record manual-handoff audit events and clearly label messages whose source cannot be proven.
- Provide stable cursor/delta and canonical-send contracts reusable by web, mobile, and GHL.

Exit: agents can work from the unified inbox, mobile can consume the same canonical truth, and manual browser handoff remains available.

### M4 — Safe campaigns and bulk messaging

- CSV/contact-list import with validation and consent evidence.
- Campaign composer, audience filters, scheduling, personalization, preview, pause/resume/cancel.
- Queue-based per-workspace and per-number throttling with retries and dead-letter handling.
- Opt-out keywords, global/workspace suppression lists, quiet hours, duplicate prevention, and delivery analytics.

Exit: campaigns cannot send to unconsented/suppressed recipients; every attempt and status transition is auditable.

### M5 — CRM connector framework

- OAuth/token vault, connector installation lifecycle, scopes, health, cursor/checkpoint, replay, and disconnect cleanup.
- Canonical event contract for contact/order/conversation/message/call changes.
- Outbox/inbox pattern for retryable, idempotent two-way synchronization.
- Field mapping UI and conflict policy (`source wins`, `latest wins`, or manual review).

Exit: a reference connector passes contract, retry, replay, secret-rotation, and tenant-isolation tests.

### M6 — Shopify, GHL, and WooCommerce/WordPress

- Shopify: customer/order webhooks, contact matching, order timeline, and approved outbound triggers.
- GHL: Marketplace OAuth, contacts/conversations, inbound/outbound message synchronization, message statuses, and supported external call-log synchronization.
- WooCommerce/WordPress: signed webhook receiver, customer/order sync, plugin settings page, reconnect and diagnostics.
- Generic CRM: workspace API keys, REST endpoints, signed outgoing webhooks, retries, and delivery logs.

Exit: connector-specific sandbox tests plus end-to-end messaging/call-log workflows pass for implemented providers.

### M7 — Production hardening and release

- Load, soak, backup/restore, disaster-recovery, dependency, and security testing.
- Metrics, tracing, alerting, webhook/campaign/mobile/calling dashboards, and operator runbooks.
- Data export/deletion, retention controls, acceptable-use, privacy, recording consent, and lost-device flows.
- Staged pilots with dedicated non-critical numbers, devices, and test calling-provider assets before general availability.

Exit: restore drills and pilot acceptance are signed off; rollback, incident, credential, lost-device, and recording procedures are tested.

### M8 / EPIC L — React Native mobile companion and provider-agnostic calling

Phase 1 is Android using React Native CLI. Expo is not used unless a later ADR identifies a concrete need. Phase 2 is iOS after Android contracts and provider behavior stabilize.

- Mobile architecture, repository boundary, TypeScript/tooling, Android build/signing, CI, and release strategy.
- Secure agent authentication, rotating mobile refresh sessions, device registration/revoke, workspace selection, and RBAC.
- Conversation list/thread, number/provider provenance, unread/assignment/status changes, foreground realtime, background push, text/media sending, and offline idempotent retry.
- Evaluate SSE versus WebSocket for active-app delivery; realtime events notify changes while cursor/delta APIs remain the durable reconciliation path.
- Evaluate calling providers before implementation; approve a provider-neutral adapter and `CallSession` state contract.
- Android call initiation, supported incoming state, ringing, connected/ended status, duration, mute, speaker, recovery, and call history.
- Recording disabled by default; enable only where supported, lawful, consented, securely stored, access-controlled, auditable, and retained/deleted by policy.
- Asynchronous transcription and structured AI summaries with transcript grounding, provenance, uncertainty, human review, dispositions, objections, commitments, and follow-up actions.
- Sync supported, approved call logs/recording references/transcripts/summaries/notes/tasks to GHL while retaining external source metadata.
- Android physical-device E2E pilot, followed by a separately gated iOS phase.

Exit: the Android pilot proves login, workspace selection, canonical chat/realtime/push/reply/GHL sync, provider-neutral test calling, history, optional consented recording, transcript, grounded summary, approved GHL call sync, tenant isolation, remote logout, and offline recovery.

## GitHub issue map

### Existing platform tracks

1. Architecture decision record and canonical messaging schema (`M0`, P0)
2. Docker Compose control plane with PostgreSQL and Redis (`M1`, P0)
3. PostgreSQL repository and JSON migration utility (`M1`, P0)
4. Secure Windows worker protocol and host assignment (`M1`, P0)
5. Messaging provider adapters and verified webhook ingestion (`M2`, P0)
6. Unified inbox, canonical send, and manual Guacamole handoff (`M3`, P0)
7. Consent-safe campaign and bulk messaging engine (`M4`, P0)
8. Reusable CRM connector framework and encrypted credentials (`M5`, P0)
9. Shopify customer/order connector (`M6`, P1)
10. GoHighLevel Marketplace messaging and call-log connector (`M6`, P1)
11. WooCommerce/WordPress connector and plugin (`M6`, P1)
12. Generic CRM REST API and signed webhooks (`M6`, P1)
13. Observability, backup/restore, security, and release gates (`M7`, P0)

### EPIC L mobile and calling track

- [#49 — EPIC L: React Native mobile companion app and provider-agnostic calling](https://github.com/abaanshujat212-beep/wa-client-hub/issues/49)
- [#50 — Mobile architecture and React Native CLI Android bootstrap](https://github.com/abaanshujat212-beep/wa-client-hub/issues/50)
- [#52 — Mobile authentication, device sessions, workspace selection, and API contract](https://github.com/abaanshujat212-beep/wa-client-hub/issues/52)
- [#54 — Mobile conversation UI and foreground realtime synchronization](https://github.com/abaanshujat212-beep/wa-client-hub/issues/54)
- [#61 — Mobile message composer, media uploads, and offline retry queue](https://github.com/abaanshujat212-beep/wa-client-hub/issues/61)
- [#58 — Android push notifications and background call/message handling](https://github.com/abaanshujat212-beep/wa-client-hub/issues/58)
- [#51 — Evaluate calling providers and approve provider-agnostic call contract](https://github.com/abaanshujat212-beep/wa-client-hub/issues/51)
- [#55 — Provider-agnostic call sessions, backend API, mobile engine, and history](https://github.com/abaanshujat212-beep/wa-client-hub/issues/55)
- [#56 — Call recording consent, secure storage, access, and retention](https://github.com/abaanshujat212-beep/wa-client-hub/issues/56)
- [#57 — Call transcription, grounded AI summary, dispositions, and follow-up actions](https://github.com/abaanshujat212-beep/wa-client-hub/issues/57)
- [#44 — GHL call-log, recording, transcript, summary, and follow-up sync](https://github.com/abaanshujat212-beep/wa-client-hub/issues/44)
- [#60 — Android mobile end-to-end pilot and acceptance gate](https://github.com/abaanshujat212-beep/wa-client-hub/issues/60)
- [#59 — iOS companion app follow-up phase](https://github.com/abaanshujat212-beep/wa-client-hub/issues/59)

Cross-cutting mobile scope is also tracked in [#24](https://github.com/abaanshujat212-beep/wa-client-hub/issues/24) for the canonical inbox/realtime/send contracts, [#31](https://github.com/abaanshujat212-beep/wa-client-hub/issues/31) for mobile/recording security, and [#36](https://github.com/abaanshujat212-beep/wa-client-hub/issues/36) for the overall release gate.

## Non-goals and guardrails

- Do not iframe `web.whatsapp.com`; expose the Windows desktop/browser through authenticated Guacamole access.
- Do not expose OpenWA, Redis, PostgreSQL, Docker socket, RDP, Guacamole administration, calling-provider credentials, or processing-provider secrets publicly.
- Do not promise zero ban risk or use primary numbers for unofficial automation pilots.
- Do not implement cold-contact scraping, consent bypasses, or evasion of WhatsApp enforcement.
- Do not let a CRM connector or mobile device read/write another workspace's contacts, messages, calls, recordings, transcripts, or summaries.
- Do not duplicate business logic, consent checks, provider selection, Meta/GHL credentials, transcription, or AI processing in the mobile app.
- Do not use Expo without an approved ADR.
- Do not make push notifications the message source of truth.
- Do not bind canonical call IDs/states to one calling vendor.
- Do not record without applicable consent and policy; do not expose permanent recording URLs.
- Do not invent facts, speakers, commitments, dates, objections, dispositions, or actions that are not supported by the transcript.
- Do not present external/mobile calls as native GHL telephony.
- Do not claim Meta WhatsApp voice/video calling support for this flow unless officially supported and approved for the exact implementation.

## Recommended implementation order

1. Complete the canonical inbox/send/provider identity contracts in #24 and the relevant Meta/GHL messaging issues.
2. Approve mobile architecture and React Native CLI Android boundary (#50).
3. Implement mobile authentication/device/session/workspace APIs (#52) and mobile security requirements in #31.
4. Stabilize cursor/delta and foreground realtime conversation synchronization (#54).
5. Add the idempotent text/media composer and offline retry queue (#61), then Android push/background handling (#58).
6. In parallel, evaluate calling providers and approve the provider-neutral contract (#51). Do not implement calling before this gate.
7. Implement canonical call sessions/backend APIs/mobile state/history (#55).
8. Add recording consent/storage (#56), then transcription and grounded AI outcomes (#57).
9. Complete supported GHL call/post-call sync in #44.
10. Run the Android physical-device E2E gate (#60) and feed results into the overall release gate (#36).
11. Start iOS (#59) only after Android contracts and the pilot are stable.

M7 production hardening applies continuously and remains the final release gate.
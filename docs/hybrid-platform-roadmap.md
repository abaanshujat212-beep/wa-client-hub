# Hybrid WhatsApp and CRM platform roadmap

## Product goal

Build one multi-tenant dashboard that supports:

- manual WhatsApp Web messaging plus voice/video calls through a Windows browser;
- consent-based bulk messaging and automation through OpenWA;
- a unified inbox, contacts, delivery events, campaigns, and audit history;
- Shopify, GoHighLevel (GHL), WooCommerce/WordPress, and generic CRM connections;
- Docker deployment for the control plane while Windows workers retain browser/calling duties.

OpenWA is an unofficial WhatsApp engine. The product must display account-risk guidance, enforce opt-in and suppression rules, and keep an official WhatsApp Cloud API adapter possible for regulated or higher-scale customers.

### Locked provider decision

- GREEN-API is not a runtime dependency and no customer data or credentials are sent to it.
- Self-hosted OpenWA is the automation and synchronization engine behind an internal adapter.
- The Windows browser worker remains the manual messaging and voice/video calling engine.
- PostgreSQL is the canonical source of truth for normalized messages, call events, consent, and connector synchronization.
- Provider-specific identifiers never become public API identifiers; this keeps a future official WhatsApp Cloud API adapter possible.

## Target architecture

```text
Web dashboard
  -> Control API (users, workspaces, roles, billing, connectors)
      -> PostgreSQL
      -> Redis-backed job queue
      -> Event router and unified conversation store
      -> OpenWA adapter (automation, messages, media, webhooks)
      -> Windows worker adapter (Chrome profiles and calls)
      -> CRM adapters (Shopify, GHL, WooCommerce, generic REST/webhook)
  -> Embedded Guacamole session for manual WhatsApp Web and calls
```

### Deployment boundary

The API, dashboard, PostgreSQL, Redis, OpenWA, and Guacamole services run in Docker. A signed Windows worker remains on each Windows host to launch isolated Chrome/Edge profiles and report session health. Browser profiles and call media are not copied into the application database.

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

### M2 — OpenWA automation adapter

- Run a pinned OpenWA image as a private internal service.
- Map each OpenWA session to exactly one workspace/WhatsApp number.
- Proxy QR/status/send/media operations without exposing OpenWA admin credentials.
- Verify webhook signatures, deduplicate events, normalize message status, and retry failures.
- Surface engine selection and health in the admin dashboard.

Exit: a test number can connect, receive, reply, send media, and recover after service restart while tenant isolation tests pass.

### M3 — Unified inbox and manual handoff

- Persist normalized contacts, conversations, messages, attachments, delivery events, and assignments.
- Build inbox list/thread/search, unread counts, notes, tags, ownership, and real-time updates.
- Add an `Open manual WhatsApp` action that opens the scoped Guacamole/browser session.
- Record manual-handoff audit events and clearly label messages whose source cannot be proven.

Exit: agents can work from the unified inbox and hand off to real WhatsApp Web for calls or unsupported actions.

### M4 — Safe campaigns and bulk messaging

- CSV/contact-list import with validation and consent evidence.
- Campaign composer, audience filters, scheduling, personalization, preview, pause/resume/cancel.
- Queue-based per-workspace and per-number throttling with retries and dead-letter handling.
- Opt-out keywords, global/workspace suppression lists, quiet hours, duplicate prevention, and delivery analytics.

Exit: campaigns cannot send to unconsented/suppressed recipients; every attempt and status transition is auditable.

### M5 — CRM connector framework

- OAuth/token vault, connector installation lifecycle, scopes, health, cursor/checkpoint, replay, and disconnect cleanup.
- Canonical event contract for contact/order/conversation/message changes.
- Outbox/inbox pattern for retryable, idempotent two-way synchronization.
- Field mapping UI and conflict policy (`source wins`, `latest wins`, or manual review).

Exit: a reference connector passes contract, retry, replay, secret-rotation, and tenant-isolation tests.

### M6 — Shopify, GHL, and WooCommerce/WordPress

- Shopify: customer/order webhooks, contact matching, order timeline, and approved outbound triggers.
- GHL: OAuth/private integration support, contacts and conversations, inbound/outbound message synchronization.
- WooCommerce/WordPress: signed webhook receiver, customer/order sync, plugin settings page, reconnect and diagnostics.
- Generic CRM: workspace API keys, REST endpoints, signed outgoing webhooks, retries, and delivery logs.

Exit: connector-specific sandbox tests plus an end-to-end order-to-conversation workflow pass for each provider.

### M7 — Production hardening and release

- Load, soak, backup/restore, disaster-recovery, dependency, and security testing.
- Metrics, tracing, alerting, webhook/campaign dashboards, and operator runbooks.
- Data export/deletion, retention controls, acceptable-use and privacy flows.
- Staged pilot with dedicated non-critical WhatsApp numbers before general availability.

Exit: restore drill and pilot acceptance are signed off; rollback and incident procedures are tested.

## Planned GitHub issues

1. Architecture decision record and canonical messaging schema (`M0`, P0)
2. Docker Compose control plane with PostgreSQL and Redis (`M1`, P0)
3. PostgreSQL repository and JSON migration utility (`M1`, P0)
4. Secure Windows worker protocol and host assignment (`M1`, P0)
5. OpenWA adapter, session mapping, and verified webhook ingestion (`M2`, P0)
6. Unified inbox and manual Guacamole handoff (`M3`, P1)
7. Consent-safe campaign and bulk messaging engine (`M4`, P0)
8. Reusable CRM connector framework and encrypted credentials (`M5`, P0)
9. Shopify customer/order connector (`M6`, P1)
10. GoHighLevel contacts/conversations connector (`M6`, P1)
11. WooCommerce/WordPress connector and plugin (`M6`, P1)
12. Generic CRM REST API and signed webhooks (`M6`, P1)
13. Observability, backup/restore, security, and pilot release gate (`M7`, P0)

## Non-goals and guardrails

- Do not iframe `web.whatsapp.com`; expose the Windows desktop/browser through authenticated Guacamole access.
- Do not expose OpenWA, Redis, PostgreSQL, Docker socket, RDP, or Guacamole admin endpoints publicly.
- Do not promise zero ban risk or use primary numbers for unofficial automation pilots.
- Do not implement cold-contact scraping, consent bypasses, or evasion of WhatsApp enforcement.
- Do not let a CRM connector read or write another workspace's contacts or messages.

## Recommended implementation order

Complete M0 and M1 first. M2 can then proceed in parallel with the first half of M5. Build M3 before exposing campaigns, because campaign replies need a trustworthy conversation model. Start Shopify/GHL/WooCommerce only after the connector contract is stable. M7 applies continuously and becomes the final release gate.

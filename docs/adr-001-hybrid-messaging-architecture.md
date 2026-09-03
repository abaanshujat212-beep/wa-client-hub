# ADR-001: Hybrid messaging and calling architecture

- Status: Accepted
- Date: 2026-09-03
- Decision owner: WA Client Hub
- Tracking issue: https://github.com/abaanshujat212-beep/wa-client-hub/issues/20

## Context

The product needs manual WhatsApp Web messaging, voice/video calls, automated and bulk messaging, phone-originated message synchronization, a unified inbox, and real-time CRM synchronization. A browser session is required for the human calling experience, while a durable event-driven service is required for automation and integrations.

## Decision

Use a hybrid architecture with strict service boundaries:

1. The control plane owns users, workspaces, authorization, billing, normalized records, consent policy, campaigns, connectors, and audit history.
2. PostgreSQL is the canonical application data store. Redis is transport/coordination infrastructure and is never the only copy of a business event.
3. Self-hosted OpenWA runs as a private automation adapter. Its session IDs and administrator credentials are internal only.
4. A signed Windows worker launches isolated Chrome/Edge profiles for manual WhatsApp Web and voice/video calls. Guacamole provides short-lived, workspace-scoped desktop access.
5. All provider inputs pass through a durable inbox pipeline before normalization. All CRM outputs pass through a transactional outbox.
6. GREEN-API is not used as a dependency. Its product behavior may inform requirements, but no runtime request, credential, or customer event is sent to GREEN-API.
7. External APIs use WA Client Hub IDs and canonical event names, never OpenWA-specific objects.

## Engine responsibilities

| Capability | Owner |
| --- | --- |
| Manual messaging and voice/video call UI | Windows browser worker |
| Automated send/receive and message status | OpenWA adapter |
| Phone-originated outgoing message event ingestion | OpenWA adapter |
| Incoming/outgoing call event ingestion | OpenWA adapter where emitted |
| Contact, conversation, message, call-event truth | PostgreSQL/control plane |
| Real-time dashboard delivery | Control plane event stream |
| Shopify, GHL, WooCommerce, generic CRM sync | Connector workers |

Call events are metadata, not call media. Audio/video recording, media interception, and guaranteed call duration are outside the initial scope.

## Tenant boundary

Every tenant-owned table contains `workspace_id`. Repositories require workspace context rather than accepting optional tenant filters. Provider identities are unique within their workspace/provider connection. Workers receive only the workspace resources assigned to them. Audit and webhook records retain workspace context even when processing fails.

## Reliability contract

- A receiver persists the raw webhook envelope and idempotency key before acknowledging successful acceptance.
- Duplicate delivery is expected. The unique `(provider, provider_connection_id, external_event_id)` key makes ingestion idempotent.
- Normalization and connector delivery are asynchronous, retryable state machines.
- The transactional outbox is written in the same database transaction as the canonical record change.
- Failed jobs use bounded exponential backoff and enter a dead-letter state with replay controls.
- Ordering is guaranteed only per provider connection/conversation when the provider supplies a usable sequence; otherwise event time plus receive time is retained and reconciliation resolves gaps.

## Security contract

- Provider and CRM credentials are envelope-encrypted with a versioned key ID and never returned to browsers or logs.
- Webhook signatures are verified when supported. Otherwise use an unguessable connection-specific endpoint, network controls where possible, schema validation, rate limits, and reconciliation.
- OpenWA, PostgreSQL, Redis, Docker, RDP, and Guacamole administration endpoints remain private.
- Guacamole grants are short-lived and restricted to one authorized workspace/host assignment.

## Retention baseline

Retention is configurable per deployment and workspace subject to legal requirements. Initial defaults are: raw webhook payloads 30 days after successful processing, dead-letter payloads 90 days, message/call metadata 365 days, and security/audit records 730 days. Attachment binaries use the message retention period unless removed earlier. Deletion jobs must preserve referential integrity, emit an audit record, and never delete unresolved dead-letter evidence automatically.

## Consequences

The system can deliver manual calls and automation under one brand without pretending that call media passes through the API. The adapter boundary allows a future official Cloud API provider. The trade-off is operational complexity: Windows workers and the Docker control plane must both be monitored, and duplicate/out-of-order event handling is mandatory.

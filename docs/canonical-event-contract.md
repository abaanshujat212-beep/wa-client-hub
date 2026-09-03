# Canonical event contract

All internal and connector events use this envelope. Provider payloads are stored separately and never become the public contract.

```json
{
  "id": "application-event-id",
  "schemaVersion": 1,
  "workspaceId": "workspace-id",
  "type": "message.received",
  "subjectType": "message",
  "subjectId": "canonical-message-id",
  "source": "openwa",
  "sourceConnectionId": "provider-connection-id",
  "externalEventId": "provider-event-id",
  "occurredAt": "2026-09-03T00:00:00.000Z",
  "receivedAt": "2026-09-03T00:00:01.000Z",
  "correlationId": "conversation-or-job-id",
  "causationId": null,
  "data": {}
}
```

## Initial event types

- `contact.created`, `contact.updated`
- `conversation.created`, `conversation.updated`, `conversation.assigned`
- `message.received`, `message.sent`, `message.status_changed`, `message.failed`
- `call.started`, `call.answered`, `call.missed`, `call.ended`
- `consent.granted`, `consent.revoked`, `contact.suppressed`
- `campaign.started`, `campaign.paused`, `campaign.completed`
- `connector.installed`, `connector.sync_failed`, `connector.recovered`

Unknown provider call states map to `call.started` plus provider details; the system must not invent `answered`, `ended`, duration, or recording data.

## Message identity and echo prevention

Messages may arrive from an API send response, an outgoing provider webhook, a phone-originated event, and later status events. Resolution uses this order:

1. Exact provider message ID within the provider connection.
2. Existing client idempotency key for API-originated sends.
3. A bounded reconciliation match on workspace, WhatsApp number, chat, direction, content fingerprint, and timestamp.

The third method is marked `reconciliation_confidence = inferred`; inferred records are visible but are never silently merged across contacts or workspaces.

## External delivery

Connector deliveries include a stable event ID and `X-WA-Hub-Signature` HMAC over the exact raw body. Consumers must deduplicate by event ID. Delivery succeeds only on a `2xx` response and otherwise follows the retry/dead-letter policy.

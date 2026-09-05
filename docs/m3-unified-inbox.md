# M3 unified inbox implementation

M3 now provides a PostgreSQL-backed inbox for normalized OpenWA messages:

- workspace-authorized conversation search and cursor pagination;
- message threads with attachments, delivery-status history, origin, and reconciliation confidence;
- unread clearing, workspace-member assignment, internal notes, and tags;
- authenticated Server-Sent Events that are scoped to the user's current workspaces;
- OpenWA text replies from the selected WhatsApp number;
- audited manual WhatsApp handoff that requires a workspace/number URL template.

## API surface

- `GET /api/inbox/conversations`
- `GET /api/inbox/conversations/:id/messages`
- `POST /api/inbox/conversations/:id/read`
- `PATCH /api/inbox/conversations/:id/assignment`
- `GET|POST /api/inbox/conversations/:id/notes`
- `POST|DELETE /api/inbox/conversations/:id/tags[/tagId]`
- `POST /api/inbox/conversations/:id/manual-handoff`
- `GET /api/inbox/events`

## Remaining live acceptance

Issue #24 remains open until the Windows worker/Guacamole mapping in #22 and live OpenWA number validation in #23 are available. Those dependencies are required to prove voice/video calling, exact browser isolation, and phone-originated message updates with real devices. The current endpoint deliberately refuses a generic shared desktop URL.

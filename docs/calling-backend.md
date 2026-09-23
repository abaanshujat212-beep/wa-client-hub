# WhatsApp calling backend

Implemented 23 September 2026. This is a signaling/control backend, not a media server. No live call was placed during implementation. The Calls frontend remains a preview until browser WebRTC/microphone integration and real two-way audio verification are completed.

## API

Base: `/api/meta/connections/:connectionId/calling`. Existing `META_CALLING_ENABLED=true` gate, active login and workspace owner/admin (or global admin) authorization apply. Agent/viewer memberships alone do not grant this first version access. Connection must belong to the supplied workspace; mutations require active/degraded connection, exact Origin and session CSRF token. Responses are not cached.

- `GET /permissions?workspaceId=...&recipient=...`: fresh Meta permission and available action result, including expiry. Never infer permission from a saved webhook alone.
- `POST /permissions/request`: `{workspaceId,to,text}`; free-form request only, requires recent inbound non-imported customer message within 24 hours, provider action allowance, suppression check and local throttle. Outside the window use an approved permission template through the existing template message workflow.
- `POST /action`: `{workspaceId,action,to?,callId?,sdp?}`. Supports connect, pre_accept, accept, reject and terminate. SDP uses Meta's session offer/answer format. `callId` is Meta's external call ID, not the internal session UUID.
- `GET /sessions?workspaceId=...`: latest 100 scoped sessions; includes whether an action is unconfirmed.
- `GET /sessions/:sessionId?workspaceId=...`: safe metadata, event history and command outcomes. No credentials or SDP.
- `POST /sessions/:sessionId/claim`: `{workspaceId}`; atomic single-agent claim. Another user cannot take over or act on the claimed session.
- `GET /sessions/:sessionId/signaling?workspaceId=...`: only the claiming user can read unexpired remote SDP. Poll this endpoint for the remote offer/answer; null means unavailable or expired, not an established audio connection.

POST action and permission-request endpoints require `Idempotency-Key` (16–128 letters/digits/underscore/hyphen). Reuse the same key when retrieving the result of a retry. Keys are bound to actor and payload. Never generate a new key to bypass an uncertain result.

## Lifecycle and delivery

Migration 032 adds durable sessions, commands and event history. A command is reserved before the provider request. Meta writes have automatic retries disabled. Known provider rejection becomes failed; timeout, interrupted process or ambiguous response becomes uncertain. Such operations are not resent. A connect request reserves the recipient until actual terminal evidence or explicit operator reconciliation; unknown results must not be manually relabeled successful.

Connect checks live recipient permission, expiry, action allowance and local suppression. Pre-accept and accept must use the same SDP answer. Incoming actions require ownership of the call. Terminal events cannot be undone by delayed ringing/connect callbacks. An outbound callback correlation ID allows webhook arrival before the API response to bind to the reserved session.

The existing signature-verified webhook ingress now accepts calls connect/terminate and ringing/accepted/rejected/failed statuses. Mapping requires the exact WABA and phone-number ID. Calls never become inbox messages or message automation events. Genuine permission messages and replies still use inbox records.

Remote SDP is encrypted before durable webhook admission, then moved into the session with a two-minute expiry measured from provider timestamp. Processed receipts discard encrypted SDP. The webhook worker and API cleanup remove expired signaling and recover interrupted call receipt processing. Local SDP is never stored, only its hash for answer consistency. Cleanup requires a running worker/service; if the service is stopped, encrypted rows are cleaned on restart.

## Remaining integration and verification

- Browser calling is wired through public/calling-audio.js and public/calling-setup.js. The dashboard and GHL settings Calls tab share this client and session history. Microphone capture starts only on Start/Answer; mute, playback and end controls are available. The operating system default audio devices are used.
- GHL sessions are restricted to their installed location/workspace. Assigned agents can access only their assigned numbers; owner/admin access is retained. An embedding parent must allow microphone/autoplay; otherwise use the new-tab link.
- Network-ambiguous actions retain their idempotency key for explicit status checks. A known call can be terminated even when connect/accept outcome is uncertain. Refresh cannot resume a lost WebRTC peer connection.
- No TURN service is configured by default. Restrictive networks may need a managed TURN integration before production audio reliability can be claimed.
- Test actual inbound and outbound audio, permission revocation, ICE/network behavior and remote hangup with an eligible real/test number. No simulated test result is a claim of production eligibility.
- Add explicit supervised reassignment/reconciliation for orphaned claims or indefinite unknown connects. Do not clear them merely to redial.
- Meta country/business eligibility checks still show unknown when the provider response does not supply evidence. App Review/coexistence approval is separate.
- Template-based permission requests use the existing template sender; this new endpoint only handles free-form requests.

## Sources

- https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls
- https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/calling-api

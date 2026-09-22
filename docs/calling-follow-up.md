# Calling follow-up and Meta review evidence

Status verified on 2026-09-22:
- Existing Meta test connection token was refreshed and verified; no token is stored in Git.
- Five approved message templates were synced.
- Test number calling.status is ENABLED (verified by reading Meta settings).
- App WhatsApp webhook subscriptions include messages and calls.
- Recipient calling permission check returned no_permission. No call was placed.

Deferred implementation:
1. Browser dialer and microphone controls.
2. WebRTC SDP/audio negotiation and signaling.
3. Incoming calls webhook ingestion and call lifecycle processing (current message normalizer ignores calls).
4. Recipient permission request and verified permission checks.
5. Workspace/agent routing, call state, logs and recovery.
6. Two-way audio and incoming/outgoing end-to-end tests.

Calling is not an end-to-end working feature yet. Configuration does not establish an audio client or prove call delivery.

Meta App Review requires evidence for whatsapp_business_messaging, whatsapp_business_management and business_management. Screenshots are supporting evidence; the currently displayed review form specifically requests an end-to-end screencast for each permission. Use genuine live app actions and never represent a screenshot slideshow as an actual interaction recording. Do not expose access tokens or unrelated customer conversations. For business_management, demonstrate the real business asset authorization/selection flow; a blank credentials form alone is insufficient.
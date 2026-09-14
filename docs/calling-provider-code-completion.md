# Calling and GHL code-side completion

This branch adds the code-side control plane for the private Calling POC.

## Meta WhatsApp Calling

- `META_CALLING_ENABLED=false` by default.
- Admin-only routes are mounted below `/api/meta/connections/:connectionId/calling`.
- `GET /readiness` checks the Meta phone-number settings, WABA subscriptions, and optional user call permissions.
- `POST /action` supports `connect`, `pre_accept`, `accept`, `reject`, and `terminate`.
- SDP is accepted only in the server-side action request and is never logged or persisted.
- Graph access tokens are decrypted only for the request and are never returned.

The implementation is audio/WebRTC control-plane only. It does **not** claim that a browser media bridge, recording, transcription, video, or screen sharing is production-ready. The private POC must still attach signed webhook fixtures, SDP/ICE evidence, and a real audio-call trace before enabling the flag in any shared environment.

## GHL Call Provider

- `GHL_CALLING_ENABLED=false` by default.
- Provider delivery URL: `https://wa.10xcollab.com/webhooks/ghl/calls`.
- Requests are verified with the existing GHL Ed25519 signature verifier.
- Exact `installationId` + `locationId` mapping is required.
- Events are stored in the existing `call_events` table and deduplicated with migration `021_calling_provider_foundation.sql`.
- The route is for canonical call-event ingestion and CRM mapping; it is not a SIP/WebRTC/media URL.

## Local enablement for the owner-approved POC

Set these only in the local/server secret environment, never in Git:

```env
META_CALLING_ENABLED=true
GHL_CALLING_ENABLED=true
```

Then run the migration and restart the app. Keep production flags false until issue #51 hard gates are complete and the owner explicitly unblocks the Calling pilot. Issue #55 remains blocked.

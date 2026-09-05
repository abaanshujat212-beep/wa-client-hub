# Remote Desktop / Guacamole setup

WA Client Hub dashboard only opens WhatsApp Web on the Windows host. For real client use, especially calls, the client also needs secure remote desktop access to that Windows desktop.

## Recommended production options

1. **Apache Guacamole behind HTTPS / Cloudflare Access**
   - Best browser-based option.
   - Do not expose raw RDP publicly.
   - Create one connection per assigned Windows VM/client workspace.

2. **Secured RDP through VPN or Cloudflare Access**
   - Good for internal/admin use.
   - Requires RDP client on user machine.

3. **Dedicated Windows VM/VPS per active client/session**
   - Recommended for selling.
   - Avoids Windows 11 single-session conflicts.

## App configuration

Set these in `.env`:

```env
REMOTE_DESKTOP_URL=https://your-guacamole-or-rdp-gateway.example.com/client/{workspaceId}/{numberId}
REMOTE_DESKTOP_LABEL=Open Remote Desktop
REMOTE_DESKTOP_HELP=Use this to access the Windows desktop where WhatsApp Web opens. Do not expose raw RDP publicly.
```

The unified inbox manual-handoff endpoint requires both `{workspaceId}` and `{numberId}` placeholders. It replaces them only after checking that the signed-in user can access the conversation workspace, and records an audit event. A generic shared URL is rejected because it cannot guarantee that an agent opens only the assigned browser session. The Windows worker/Guacamole layer must enforce the same mapping server-side.

## Audio / microphone checklist

- In RDP/Guacamole, enable remote audio playback.
- Enable microphone recording/redirection.
- In Chrome/Edge, allow microphone/camera for `web.whatsapp.com`.
- Test one WhatsApp call before handing access to a client.

## Security rules

- Never expose port `3389` directly to the public internet.
- Use HTTPS, VPN, Cloudflare Access, or another authenticated gateway.
- Use separate Windows user/VM per production client where possible.
- Log remote desktop access in the provider/gateway.
- Rotate credentials when a client leaves.

## Current implementation status

Implemented:

- Environment config for remote desktop URL/label/help.
- `/api/remote-desktop` endpoint.
- Dashboard remote desktop button when URL is configured.

Still future work:

- Per-workspace VM assignment.
- Per-workspace Guacamole connection IDs.
- Remote desktop access logs inside WA Client Hub.
- VM status/restart controls.

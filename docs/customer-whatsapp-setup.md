# Customer WhatsApp setup

A workspace owner can connect a Meta Cloud API number from Workspaces using either Embedded Signup or **Connect with API credentials**. The manual form requires Phone Number ID, WhatsApp Business Account ID and Access Token. The server verifies that Meta lists the phone under the supplied WABA before installing an encrypted, workspace-scoped connection.

1. Select the workspace and save its connection.
2. Choose **Check & activate**. The configured application must be subscribed to the WABA. An unrelated app subscription does not satisfy this check.
3. Choose **Sync templates** to retrieve the WABA's catalog. Only approved templates are available for sending.
4. Choose **Enable messaging** after activation. This does not send a message or replay historical events.
5. Use **Manage templates** or Inbox → **New message / Template**.

New workspaces refresh the connection selector immediately. Customer controls are available without access to the administrator Integrations page. Embedded WhatsApp settings also offer credential connection.

## Calling

Calling setup shows current Meta readiness for a selected workspace and number, including incomplete connections. Set `META_CALLING_ENABLED=true` to expose the readiness module. Readiness can be inspected before activation; call actions still require an active or degraded connection and use only the server-stored phone ID and credentials.

The page does not provide a browser audio client. Calling eligibility, the calls webhook, recipient permission and audio-client setup must be completed before an end-to-end call can be demonstrated. Unknown conditions are shown as unverified.

## Layout

The sidebar brand and profile remain visible. Navigation scrolls independently between them, and the main content has its own scroll area. The mobile menu retains the same navigation behavior.
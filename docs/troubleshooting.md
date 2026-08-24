# Troubleshooting

## QR code does not load

- Refresh WhatsApp Web.
- Confirm internet connection on Windows host.
- Close and reopen the WhatsApp number from dashboard.
- Confirm Chrome/Edge is installed.

## WhatsApp opens in wrong account

- Confirm the correct WhatsApp number card was clicked.
- Each number should use its own isolated browser profile.
- If sessions are mixed, remove the affected number/profile and link again.

## No microphone in calls

- Check Remote Desktop/Guacamole microphone redirection.
- In Chrome/Edge, allow microphone for `web.whatsapp.com`.
- Check Windows privacy settings for microphone access.
- Reconnect remote desktop session after enabling mic settings.

## Client cannot login

- Confirm user is active.
- Reset password from admin dashboard.
- If using invite link, confirm link is not expired or already used.

## Plan limit reached

- Remove unused users/numbers, or upgrade the workspace plan.
- Limits are enforced by backend, not only the dashboard UI.

## Remote desktop button missing

- Set `REMOTE_DESKTOP_URL` in `.env`.
- Restart the app.
- Confirm user is logged in.

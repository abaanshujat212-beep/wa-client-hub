# WhatsApp session status

WA Client Hub does not scrape chats or automate WhatsApp. Status is based on safe local signals:

- browser process running
- browser profile folder exists
- last launch timestamp

## Statuses

- `Needs QR scan` — no browser profile exists yet.
- `Profile created` — profile folder exists but no launch timestamp yet.
- `Linked / needs check` — profile exists and was launched before. User should open WhatsApp to confirm session.
- `Running` — browser process is currently running.

## Troubleshooting

If status is `Needs QR scan`:

1. Click **Link account**.
2. Scan QR from phone.

If status is `Linked / needs check`:

1. Click **Open WhatsApp**.
2. If WhatsApp asks for QR again, scan it.
3. If it fails, remove and relink the number.

If calls do not work:

1. Open Remote Desktop.
2. Enable mic/audio redirection.
3. Allow mic/camera in Chrome/Edge for `web.whatsapp.com`.

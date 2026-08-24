# FAQ

## Is this affiliated with WhatsApp or Meta?

No. WA Client Hub is not affiliated with WhatsApp or Meta.

## Does it scrape chats or automate bulk messages?

No. This project is for manually opening isolated WhatsApp Web sessions. It does not scrape chats or automate bulk messaging.

## Can one workspace have multiple WhatsApp numbers?

Yes. The number of WhatsApp numbers depends on the workspace plan.

## Can one workspace have multiple users?

Yes. Workspace members can be added based on plan limits and roles.

## Why do clients need Remote Desktop?

The dashboard opens WhatsApp Web on the Windows host. For actual use and calls, the client needs access to that Windows desktop through secured Remote Desktop/Guacamole.

## Can multiple clients call at the same time?

For production, use one Windows VM/VPS per concurrent client/session. A single Windows 11 machine is not reliable for multiple simultaneous interactive sessions.

## What should never be committed to Git?

Never commit `.env`, `data/`, `runtime/`, browser profiles, logs, or backups.

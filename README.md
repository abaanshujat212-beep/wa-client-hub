# WA Client Hub

A Windows-first MVP for managing separate client logins and isolated WhatsApp Web browser profiles. Each WhatsApp workspace uses its own Chrome/Edge user-data directory, so QR sessions and cookies do not mix.

## What this version does

- Admin login and separate client logins
- Create, enable, and disable clients
- Create multiple WhatsApp workspaces
- Keep every workspace in an isolated browser profile
- Launch WhatsApp Web on the Windows desktop
- Use WhatsApp messages, voice calls, and video calls through that browser
- Run the dashboard continuously with PM2
- Expose the dashboard temporarily through Cloudflare Tunnel

## Important calling limitation

Cloudflare Tunnel exposes the **dashboard**, not the Chrome window running on the Windows PC. For a remote client to message or call, they must also access the Windows desktop through Remote Desktop with microphone/audio redirection enabled.

Windows 11 supports one reliable interactive remote desktop session at a time. The local MVP can save many client profiles, but it is not suitable for multiple simultaneous remote callers. A sellable production version should provision one licensed Windows VM/VPS per concurrent client, with the central dashboard assigning each client to their VM.

## Windows 11 local setup

### 1. Install prerequisites

Install:

- Node.js 22 LTS
- Google Chrome or Microsoft Edge
- PM2
- Cloudflared

Cloudflared can be installed from PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

### 2. Prepare the project

Open PowerShell inside this project directory and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
```

Open `.env` and change at least:

```env
SESSION_SECRET=put-a-random-secret-longer-than-32-characters-here
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=Use-A-Strong-Password-Here
```

The first startup creates the admin account. Changing the `.env` admin password later does not overwrite an existing admin record.

### 3. Start through PM2

```powershell
.\scripts\start-pm2.ps1
```

Open [http://localhost:3131](http://localhost:3131), sign in as admin, create a client, then create a WhatsApp workspace. Clicking **Link account** opens an isolated WhatsApp Web window. Scan the QR code from the phone.

Useful PM2 commands:

```powershell
pm2 status
pm2 logs wa-client-hub
pm2 restart wa-client-hub
pm2 stop wa-client-hub
```

### 4. Start a temporary Cloudflare Tunnel

Open a second PowerShell window:

```powershell
.\scripts\start-tunnel.ps1
```

Cloudflared prints a temporary `https://...trycloudflare.com` URL. Share it only for a short test. For production, configure a named tunnel and Cloudflare Access authentication before the app.

## Test voice calls remotely

1. Use another Windows computer for the remote test.
2. Copy `scripts/remote-desktop-template.rdp` and replace `YOUR-WINDOWS-HOSTNAME-OR-IP`.
3. Confirm the Windows host allows Remote Desktop and the selected Windows edition supports hosting RDP.
4. Open the `.rdp` file. It already enables remote audio playback and microphone capture.
5. Open the client’s WhatsApp workspace from the dashboard.
6. In Chrome/Edge, allow microphone, camera, and notifications for `web.whatsapp.com`.
7. Place a test call.

If the Windows 11 PC is on a private office/home network, do not expose port 3389 directly to the public internet. Use a VPN, Cloudflare Access/RDP setup, or a properly secured Windows VPS.

## Production model for selling

```text
Central dashboard
  -> Client authentication and plans
  -> VM assignment
  -> One Windows VM per simultaneous client
       -> Isolated Chrome profile(s)
       -> WhatsApp Web
       -> RDP audio/microphone
```

Recommended next production phases:

1. PostgreSQL instead of the local JSON store
2. One Windows VM per client or concurrency slot
3. Named Cloudflare Tunnel plus Access policies
4. Subscription billing and plan limits
5. Encrypted secret storage, backups, audit reporting, and monitoring
6. Customer terms covering WhatsApp rules and acceptable use

## Security notes

- Never commit `.env`, `data`, or `runtime` directories.
- Never share the Windows administrator account with clients.
- Do not expose raw RDP port 3389 publicly.
- Use a separate Windows account/VM for every production client.
- This project does not scrape chats or automate bulk messaging.
- WhatsApp can change WhatsApp Web behavior, limits, and calling availability.

## Development

```powershell
npm install
npm run dev
```

Run tests:

```powershell
npm test
```


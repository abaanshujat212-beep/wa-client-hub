# WA Client Hub

A Windows-first MVP for managing client workspaces, multiple WhatsApp Web numbers, and isolated browser profiles. Each WhatsApp number uses its own Chrome/Edge user-data directory, so QR sessions and cookies do not mix.

## Product direction

The implementation plan for the combined manual, automation, bulk messaging, and CRM platform is in [docs/hybrid-platform-roadmap.md](docs/hybrid-platform-roadmap.md).

The Dockerized PostgreSQL/Redis control plane setup is documented in [docs/docker-control-plane.md](docs/docker-control-plane.md).

The product is moving toward this structure:

```text
Client / Organization
  -> Workspace
      -> Members / Users
      -> WhatsApp Numbers
      -> Plan limits
      -> Assigned Windows VM/VPS or local Windows host
```

### Key concepts

- **Workspace**: The main container for a client/team. A workspace can contain multiple WhatsApp numbers and multiple users.
- **WhatsApp Number**: One WhatsApp Web session/profile inside a workspace. Every number must stay isolated in its own Chrome/Edge profile.
- **Member/User**: A person who can access a workspace. Roles should control what they can do.
- **Plan**: Controls how many users and WhatsApp numbers a workspace can add.
- **Windows host / VM**: The machine where WhatsApp Web actually opens. For production, one VM/VPS per concurrent client/session is recommended.

### Planned package limits

Initial suggested plans:

| Plan | Workspaces | WhatsApp numbers | Users | Notes |
| --- | ---: | ---: | ---: | --- |
| Starter | 1 | 1 | 1 | Single owner test package |
| Team | 1 | 3 | 3 | Small team/client package |
| Business | 3 | 10 | 10 | Multi-brand/client operations |
| Dedicated | Custom | Custom | Custom | Dedicated Windows VM/VPS and custom limits |

Plan enforcement should happen on the server side. The dashboard should display usage such as `2/3 WhatsApp numbers` and `1/3 users`.

## What this version does

- Admin login and separate client logins
- Create, enable, and disable clients
- Create multiple WhatsApp workspaces/accounts
- Keep every WhatsApp profile isolated in its own browser profile
- Launch WhatsApp Web on the Windows desktop
- Use WhatsApp messages, voice calls, and video calls through that browser
- Run the dashboard continuously with PM2
- Expose the dashboard temporarily through Cloudflare Tunnel
- Maintain an audit log for core actions

## Next build priorities

The current MVP uses a simple account model. The next implementation phase should add the workspace/member/plan model.

1. **Workspace model**
   - Add a real workspace entity.
   - Move WhatsApp accounts/numbers under `workspaceId`.
   - Migrate current accounts into default workspaces.

2. **Multiple WhatsApp numbers per workspace**
   - Allow one workspace to contain many WhatsApp numbers.
   - Keep one isolated browser profile per number.
   - Enforce plan limits before creating a new number.

3. **Multiple users per workspace**
   - Add workspace members.
   - Add roles such as owner, admin, agent, and viewer.
   - Allow one user to belong to multiple workspaces if needed.
   - Enforce server-side role checks.

4. **Plan limits**
   - Store `planId` and optional custom limits.
   - Limit workspace count, WhatsApp number count, and user count.
   - Show usage counters in the dashboard.

5. **Dashboard update**
   - Add workspace detail screen.
   - Add tabs/sections for WhatsApp numbers and members.
   - Add member invite/add flow.
   - Add limit reached states.

## Important calling limitation

Cloudflare Tunnel exposes the **dashboard**, not the Chrome window running on the Windows PC. For a remote client to message or call, they must also access the Windows desktop through Remote Desktop with microphone/audio redirection enabled.

Windows 11 supports one reliable interactive remote desktop session at a time. The local MVP can save many client profiles, but it is not suitable for multiple simultaneous remote callers. A sellable production version should provision one licensed Windows VM/VPS per concurrent client or concurrency slot, with the central dashboard assigning each workspace/session to the right VM.

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

Open [http://localhost:3131](http://localhost:3131), sign in as admin, create a client, then create a WhatsApp workspace/account. Clicking **Link account** opens an isolated WhatsApp Web window. Scan the QR code from the phone.

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
  -> Client authentication, workspace memberships, and plans
  -> Plan limit enforcement
  -> VM assignment
  -> One Windows VM/VPS per simultaneous client/session
       -> Isolated Chrome profile(s)
       -> WhatsApp Web
       -> RDP audio/microphone
```

Recommended next production phases:

1. PostgreSQL instead of the local JSON store
2. Workspace/member/plan data model
3. One Windows VM per client or concurrency slot
4. Named Cloudflare Tunnel plus Access policies
5. Subscription billing and plan limits
6. Encrypted secret storage, backups, audit reporting, and monitoring
7. Customer terms covering WhatsApp rules and acceptable use

## Security notes

- Never commit `.env`, `data`, or `runtime` directories.
- Never share the Windows administrator account with clients.
- Do not expose raw RDP port 3389 publicly.
- Use a separate Windows account/VM for every production client.
- Enforce workspace access and plan limits on the backend.
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

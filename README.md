# WA Client Hub

A Windows-first MVP for managing client workspaces, multiple WhatsApp Web numbers, and isolated browser profiles. Each WhatsApp number uses its own Chrome/Edge user-data directory, so QR sessions and cookies do not mix.

## Product direction

The implementation plan for the combined manual, automation, bulk messaging, and CRM platform is in [docs/hybrid-platform-roadmap.md](docs/hybrid-platform-roadmap.md).

The Dockerized PostgreSQL/Redis control plane setup is documented in [docs/docker-control-plane.md](docs/docker-control-plane.md).
The private OpenWA automation adapter setup and risk controls are documented in [docs/openwa-adapter.md](docs/openwa-adapter.md).

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

| Plan | Workspaces | WhatsApp numbers | Users | Notes |
| --- | ---: | ---: | ---: | --- |
| Starter | 1 | 1 | 1 | Single owner test package |
| Team | 1 | 3 | 3 | Small team/client package |
| Business | 3 | 10 | 10 | Multi-brand/client operations |
| Dedicated | Custom | Custom | Custom | Dedicated Windows VM/VPS and custom limits |

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

## Important calling limitation

Cloudflare Tunnel exposes the **dashboard**, not the Chrome window running on the Windows PC. For a remote client to message or call, they must also access the Windows desktop through Remote Desktop with microphone/audio redirection enabled.

Windows 11 supports one reliable interactive remote desktop session at a time. The local MVP can save many client profiles, but it is not suitable for multiple simultaneous remote callers. A sellable production version should provision one licensed Windows VM/VPS per concurrent client or concurrency slot, with the central dashboard assigning each workspace/session to the right VM.

## Windows 11 local setup

### 1. Install prerequisites

Install Node.js 22 LTS, Google Chrome or Microsoft Edge, PM2, and Cloudflared.

```powershell
winget install --id Cloudflare.cloudflared
```

### 2. Prepare the project

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
```

Open `.env` and change at least `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

### 3. Start through PM2

```powershell
.\scripts\start-pm2.ps1
```

Open [http://localhost:3131](http://localhost:3131). Clicking **Link account** opens an isolated WhatsApp Web window on Windows.

```powershell
pm2 status
pm2 logs wa-client-hub
pm2 restart wa-client-hub
pm2 stop wa-client-hub
```

### 4. Start a temporary Cloudflare Tunnel

```powershell
.\scripts\start-tunnel.ps1
```

## macOS Local Development

The Node.js/Express backend, JSON storage, PostgreSQL client, Redis client, migrations, and npm scripts use portable Node APIs and run on macOS. Docker Desktop can run the control plane on Intel and Apple Silicon Macs. The legacy local WhatsApp Web browser launcher is intentionally Windows-only; this does not prevent backend/API development on macOS.

### Prerequisites

Install:

- Git
- Node.js 22 LTS (Node 20 or newer is accepted by `package.json`)
- Docker Desktop with Docker Compose v2
- Xcode Command Line Tools (`xcode-select --install`) if Git or native build tooling is missing
- Optional: Homebrew (`brew`) and Google Chrome for ordinary browsing; the app does not launch Chrome on macOS

Confirm the tools:

```sh
git --version
node --version
npm --version
docker version
docker compose version
uname -m
```

`uname -m` prints `arm64` on Apple Silicon and `x86_64` on Intel Macs.

### Clone and install

```sh
git clone https://github.com/abaanshujat212-beep/wa-client-hub.git
cd wa-client-hub
npm ci
```

`npm ci` uses the committed lock file and is preferred over `npm install` for a reproducible checkout.

### Create `.env` and local secrets

For the lightweight Node/JSON development path:

```sh
cp .env.example .env
SESSION_SECRET="$(openssl rand -hex 32)"
CONNECTOR_MASTER_KEY="$(openssl rand -base64 32)"
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env
sed -i '' "s|^CONNECTOR_MASTER_KEY=.*|CONNECTOR_MASTER_KEY=${CONNECTOR_MASTER_KEY}|" .env
```

Then edit `.env` and set a local admin email and strong password:

```sh
nano .env
```

Keep these local-development values:

```env
NODE_ENV=development
STORE_DRIVER=json
COOKIE_SECURE=false
MOCK_BROWSER=1
META_SIGNUP_ENABLED=false
META_WEBHOOK_ENABLED=false
YCLOUD_ENABLED=false
YCLOUD_WEBHOOK_ENABLED=false
```

`MOCK_BROWSER=1` is for dashboard/API testing on macOS. It prevents the Windows-only **Link account** action from trying to launch a real browser profile. It does not create a WhatsApp session or enable calls.

### Run the Node app

```sh
npm run dev
```

Or without file watching:

```sh
npm start
```

Open `http://127.0.0.1:3131`. Stop with `Control-C`.

### Run Docker services

Create a Docker environment and generate local-only secrets:

```sh
cp .env.docker.example .env.docker
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
SESSION_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '\n')"
CONNECTOR_MASTER_KEY="$(openssl rand -base64 32)"
OPENWA_API_KEY="$(openssl rand -hex 32)"
OPENWA_WEBHOOK_SECRET="$(openssl rand -hex 32)"
sed -i '' "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env.docker
sed -i '' "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env.docker
sed -i '' "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_PASSWORD}|" .env.docker
sed -i '' "s|^CONNECTOR_MASTER_KEY=.*|CONNECTOR_MASTER_KEY=${CONNECTOR_MASTER_KEY}|" .env.docker
sed -i '' "s|^OPENWA_API_KEY=.*|OPENWA_API_KEY=${OPENWA_API_KEY}|" .env.docker
sed -i '' "s|^OPENWA_WEBHOOK_SECRET=.*|OPENWA_WEBHOOK_SECRET=${OPENWA_WEBHOOK_SECRET}|" .env.docker
```

Validate and start the control plane (app, migration, PostgreSQL, and Redis; OpenWA is not started unless its profile is selected):

```sh
docker compose --env-file .env.docker config
docker compose --env-file .env.docker up --build -d --wait
curl -fsS http://127.0.0.1:3131/api/ready
docker compose --env-file .env.docker ps
```

View logs and stop without deleting named volumes:

```sh
docker compose --env-file .env.docker logs -f app migrate postgres redis
docker compose --env-file .env.docker down
```

Do not use `docker compose down --volumes` unless local data may be deleted.

### Apple Silicon notes

- The app image uses the official `node:22-bookworm-slim` base, and PostgreSQL 16 and Redis 7 images have normal Linux arm64 variants. The application dependencies are JavaScript-only in this repository, so the Node/control-plane path does not require Rosetta.
- Docker Desktop must be running with enough memory for PostgreSQL, Redis, and the app. OpenWA additionally requests 1 GB shared memory.
- Apache Guacamole is optional and is not needed for backend development. The `guacamole/` package is specifically a gateway to a Windows RDP host; it does not turn macOS into the WhatsApp Web/calling host.

### Run OpenWA separately

OpenWA is optional, unofficial, and disabled unless the `openwa` Compose profile is selected. It can cause account restrictions; use a dedicated test number only.

Start it with loopback-only QR enrollment:

```sh
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml \
  up -d openwa
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml \
  logs -f openwa
```

Open `http://127.0.0.1:8080` only for local enrollment. After linking, recreate without the port-publishing override:

```sh
docker compose --env-file .env.docker --profile openwa up -d openwa
```

#### OpenWA on Apple Silicon

OpenWA upstream information is inconsistent: Docker Hub exposes an arm64 image variant, while the upstream OpenWA Docker documentation warns that Chromium may not work on ARM. The repository pins an image digest, so do not assume that a newly published `latest` manifest has the same architecture or behavior.

Try the normal command first. If Docker reports an architecture/manifest error or Chromium exits on an `arm64` Mac, enable Docker Desktop's Rosetta/x86 emulation and use the explicit amd64 override:

```sh
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml -f compose.openwa-macos-arm64.yml \
  up -d openwa
docker compose --env-file .env.docker --profile openwa \
  -f compose.yml -f compose.openwa-local.yml -f compose.openwa-macos-arm64.yml \
  logs -f openwa
```

The amd64 fallback may be slower and Chromium/QR persistence still requires a real-device smoke test. Do not mark OpenWA as Mac-compatible until QR enrollment, restart persistence, send, receive, and webhook delivery have been verified on the target Mac. Official Meta/YCloud providers do not depend on this browser container.

### Run tests

Run the normal test suite:

```sh
npm test
```

PostgreSQL-specific tests skip when `TEST_DATABASE_URL` is absent. To run them on macOS with an isolated Docker database:

```sh
docker run --rm -d --name wa-hub-test-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=wa_client_hub_test \
  -p 127.0.0.1:55432:5432 \
  postgres:16.10-bookworm
until docker exec wa-hub-test-postgres pg_isready -U postgres -d wa_client_hub_test; do sleep 1; done
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/wa_client_hub_test npm test
docker rm -f wa-hub-test-postgres
```

### Troubleshooting and known limitations

- **`Link account` says Windows only:** expected when `MOCK_BROWSER=0`; set `MOCK_BROWSER=1` for UI/API development. Real local profile launch, browser voice/video calls, `taskkill`, RDP, and the `.rdp` template remain Windows-specific.
- **Docker interpolation reports a missing variable:** regenerate `.env.docker` and confirm `POSTGRES_PASSWORD`, `SESSION_SECRET`, `ADMIN_PASSWORD`, and `CONNECTOR_MASTER_KEY` are non-empty.
- **Port already in use:** set `PORT` for Node, `APP_PORT` for the Docker app, or `OPENWA_ENROLL_PORT` for OpenWA.
- **OpenWA exits on Apple Silicon:** use the amd64 override above and inspect `docker compose ... logs openwa`; browser automation remains best-effort and unofficial.
- **Filesystem:** runtime/data/profile paths use Node's `path.join` and recursive filesystem APIs. `.DS_Store`, `.env*`, runtime data, and logs are ignored. macOS paths do not need backslash conversion.
- **Remote desktop:** leave `REMOTE_DESKTOP_URL` empty for local Mac development. Guacamole and Cloudflare Tunnel are optional deployment components, not Node/Docker prerequisites.

### Windows vs macOS commands

| Task | Windows | macOS |
| --- | --- | --- |
| Initial helper | `.\\scripts\\setup-windows.ps1` | `cp .env.example .env && npm ci` |
| Start development | `.\\scripts\\start-pm2.ps1` or `npm run dev` | `npm run dev` |
| Generate a 32-byte vault key | PowerShell RNG helper | `openssl rand -base64 32` |
| Edit files | PowerShell/editor | `nano .env` or another editor |
| Stop foreground app | `Ctrl+C` | `Control-C` |

Docker Compose and npm commands themselves are identical; only shell syntax and the Windows browser/RDP helpers differ.

## Security notes

- Never commit `.env`, `.env.docker`, `data`, or `runtime` directories.
- Never expose PostgreSQL, Redis, OpenWA, Guacamole, or raw RDP publicly.
- Keep official provider credentials server-side and encrypted.
- OpenWA is unofficial and should be isolated to dedicated test numbers.

## Development

```sh
npm ci
npm run dev
npm test
```

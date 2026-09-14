# Windows automatic startup: Docker, PM2, and Cloudflare Tunnel

The repository supports two mutually exclusive app modes. Do not run both app servers on port 3131.

- **Docker mode (recommended):** Docker runs the app, migration, PostgreSQL, and Redis. PM2 is not used to run the app.
- **PM2 mode:** Docker runs only PostgreSQL and Redis; PM2 runs `src/main.js` on Windows.

Both modes use Docker restart policies, and the startup task waits for Docker Desktop before starting the stack.

## One-time prerequisites

Install:

- Node.js 22 LTS
- Docker Desktop for Windows
- Cloudflared
- PM2 (the setup script installs it if missing)

```powershell
winget install --id Docker.DockerDesktop
winget install --id Cloudflare.cloudflared
npm install --global pm2
```

Sign out/in or restart Windows after Docker Desktop installation. In Docker Desktop, enable **Start Docker Desktop when you sign in**.

## First-time setup: recommended Docker mode

From the repository directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
notepad .env.docker
```

Replace all `change-me` values in `.env.docker`. Then start the complete stack:

```powershell
.\scripts\start-stack-windows.ps1 -Mode docker
curl.exe http://127.0.0.1:3131/api/ready
```

Install automatic startup for the current Windows user:

```powershell
.\scripts\install-windows-autostart.ps1 -Mode docker
Start-ScheduledTask -TaskName "WA Client Hub - Start stack"
```

The task starts Docker Desktop if necessary, waits for Docker, and runs:

```text
docker compose --env-file .env.docker -f compose.yml up --build -d --wait
```

The Compose services use `restart: unless-stopped`, so containers recover after Docker restarts. Do not use `docker compose down --volumes` unless you intend to delete local data.

## Alternative: PM2 app + Docker infrastructure

Use this mode only if you specifically want PM2 to supervise the Node process. In this mode, Docker must not start the `app` service because both would bind port 3131.

Configure `.env` with local PostgreSQL/Redis values:

```env
STORE_DRIVER=postgres
DATABASE_URL=postgresql://wa_hub:YOUR_DATABASE_PASSWORD@127.0.0.1:5432/wa_hub
REDIS_URL=redis://127.0.0.1:6379
COOKIE_SECURE=false
```

Put the same database password in `.env.docker`, then run:

```powershell
.\scripts\start-stack-windows.ps1 -Mode pm2
pm2 status
pm2 logs wa-client-hub
```

Install startup:

```powershell
.\scripts\install-windows-autostart.ps1 -Mode pm2
Start-ScheduledTask -TaskName "WA Client Hub - Start stack"
```

The PM2 ecosystem now starts `src/main.js`, not the lower-level `src/server.js`, so Meta signup/webhooks and other runtime wiring are loaded.

Useful commands:

```powershell
pm2 status
pm2 logs wa-client-hub
pm2 restart wa-client-hub --update-env
pm2 save
Unregister-ScheduledTask -TaskName "WA Client Hub - Start stack" -Confirm:$false
```

## Cloudflare Tunnel: temporary test

A quick tunnel is not stable and does not automatically preserve its URL. Use it only for a short test:

```powershell
cloudflared tunnel --url http://127.0.0.1:3131
```

Keep that PowerShell window open.

## Cloudflare Tunnel: persistent automatic startup

A named tunnel requires a Cloudflare account, a domain managed by Cloudflare, and one initial interactive login.

For a **new** named tunnel, run once:

```powershell
cloudflared tunnel login
cloudflared tunnel create wa-client-hub
```

Copy the tunnel UUID printed by the second command. Then run:

```powershell
.\scripts\setup-cloudflare-tunnel.ps1 `
  -TunnelName wa-client-hub `
  -TunnelId YOUR-TUNNEL-UUID `
  -Hostname app.example.com
```

The script writes `%USERPROFILE%\.cloudflared\config.yml`, creates the DNS route, and automatically configures the existing Windows `cloudflared` service. A UAC prompt may appear because the service runs as `LocalSystem`.

For an **existing** named tunnel, do not run `cloudflared tunnel create`, `cloudflared tunnel route dns`, or `cloudflared tunnel login`. The first-run setup detects `%USERPROFILE%\.cloudflared\config.yml` and runs:

```powershell
.\scripts\ensure-cloudflare-service.ps1
```

That helper:

1. Reads the existing tunnel UUID and credentials path.
2. Verifies that the credential belongs to the configured tunnel.
3. Copies the existing credential and config into the Windows service profile.
4. Configures `cloudflared` for automatic startup.
5. Starts or refreshes the service without changing the tunnel or DNS route.

You can rerun it manually from the repository directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\ensure-cloudflare-service.ps1
```

The named tunnel then starts with Windows and forwards:

```text
https://app.example.com → http://127.0.0.1:3131
```

Set the application origin to the stable HTTPS hostname before enabling secure cookies or Meta callbacks:

```env
APP_ORIGIN=https://app.example.com
COOKIE_SECURE=true
```

Restart the selected app mode after changing `.env`:

```powershell
# Docker mode
.\scripts\start-stack-windows.ps1 -Mode docker

# PM2 mode
pm2 restart wa-client-hub --update-env
```

Do not expose PostgreSQL, Redis, Docker, RDP, or Cloudflared credentials publicly. Use Cloudflare Access for an administrative dashboard before sharing the hostname.

## Troubleshooting

```powershell
# Docker
Get-Service com.docker.service
docker info
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs app postgres redis

# App readiness
curl.exe http://127.0.0.1:3131/api/health
curl.exe http://127.0.0.1:3131/api/ready

# Startup task
Get-ScheduledTask -TaskName "WA Client Hub - Start stack"

# Cloudflare
cloudflared tunnel list
Get-Service cloudflared
Get-CimInstance Win32_Service -Filter "Name='cloudflared'" |
  Select-Object State, StartMode, PathName
Invoke-WebRequest https://app.example.com/api/ready
```

If Docker mode and PM2 mode are both started, stop one app owner first. The expected symptom of a conflict is `EADDRINUSE` on port 3131.

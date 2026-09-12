$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is missing. Install Node.js 22 LTS from https://nodejs.org and run this script again."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env. Configure it before starting PM2 mode." -ForegroundColor Yellow
}
if (-not (Test-Path ".env.docker")) {
  Copy-Item ".env.docker.example" ".env.docker"
  Write-Host "Created .env.docker. Replace every change-me value before Docker mode." -ForegroundColor Yellow
}

npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  npm install --global pm2
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker Desktop is not installed. Install it from https://docs.docker.com/desktop/install/windows-install/" -ForegroundColor Yellow
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared is not installed. Install it with: winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
}

Write-Host "Setup complete." -ForegroundColor Green
Write-Host "1. Edit .env.docker (recommended Docker mode) or .env (PM2 mode)."
Write-Host "2. Test Docker mode: .\scripts\start-stack-windows.ps1 -Mode docker"
Write-Host "3. Install Docker-mode startup: .\scripts\install-windows-autostart.ps1 -Mode docker"
Write-Host "4. Configure a named Cloudflare tunnel with docs/windows-autostart.md."

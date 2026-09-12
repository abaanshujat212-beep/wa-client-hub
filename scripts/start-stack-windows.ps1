param(
  [ValidateSet('docker', 'pm2')]
  [string]$Mode = 'docker'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is missing. $Help" }
}

function Wait-ForDocker {
  Require-Command 'docker' 'Install Docker Desktop from https://docs.docker.com/desktop/install/windows-install/'
  $desktop = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $desktop) { throw 'Docker Desktop was not found. Install it and enable Start Docker Desktop when you sign in.' }
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) { Start-Process $desktop }
  for ($i = 0; $i -lt 60; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 2
  }
  throw 'Docker Desktop did not become ready within 120 seconds.'
}

function Run-Compose([string[]]$Arguments) {
  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE." }
}

Wait-ForDocker

if ($Mode -eq 'docker') {
  if (-not (Test-Path '.env.docker')) { throw '.env.docker is missing. Copy .env.docker.example to .env.docker and replace every change-me value.' }
  Run-Compose @('--env-file', '.env.docker', '-f', 'compose.yml', 'up', '--build', '-d', '--wait')
  Write-Host 'Docker app, migration, PostgreSQL, and Redis are running.' -ForegroundColor Green
  Write-Host 'Dashboard: http://127.0.0.1:3131' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path '.env')) { throw '.env is missing. Run setup-windows.ps1 and configure PostgreSQL host settings first.' }
if (-not (Test-Path '.env.docker')) { throw '.env.docker is missing. It supplies the Docker PostgreSQL and Redis credentials.' }
Require-Command 'npm' 'Install Node.js 22 LTS from https://nodejs.org.'
Require-Command 'pm2' 'Install PM2 with: npm install --global pm2'
Run-Compose @('--env-file', '.env.docker', '-f', 'compose.infra.yml', 'up', '-d', '--wait')
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
pm2 describe wa-client-hub *> $null
if ($LASTEXITCODE -eq 0) { pm2 restart wa-client-hub --update-env } else { pm2 start ecosystem.config.cjs --only wa-client-hub --update-env }
pm2 save
Write-Host 'Docker PostgreSQL/Redis and the PM2 app are running.' -ForegroundColor Green
Write-Host 'Dashboard: http://127.0.0.1:3131' -ForegroundColor Green

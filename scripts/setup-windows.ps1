$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is missing. Install Node.js 22 LTS from https://nodejs.org and run this script again."
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env. Open it now and change ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET." -ForegroundColor Yellow
}

npm install

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
  npm install --global pm2
}

Write-Host "Setup complete." -ForegroundColor Green
Write-Host "1. Edit .env"
Write-Host "2. Run: .\scripts\start-pm2.ps1"
Write-Host "3. Run in another PowerShell window: .\scripts\start-tunnel.ps1"


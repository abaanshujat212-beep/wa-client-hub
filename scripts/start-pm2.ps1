$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".env")) {
  throw ".env is missing. Run .\scripts\setup-windows.ps1 first."
}

pm2 start ecosystem.config.cjs --update-env
pm2 save
pm2 status
Write-Host "Dashboard: http://localhost:3131" -ForegroundColor Green


$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-WaRepositoryRoot
Write-Host 'Docker engine:'
if (Get-Command docker -ErrorAction SilentlyContinue) { docker info --format '  Server={{.ServerVersion}}  Containers={{.Containers}}  Running={{.ContainersRunning}}' } else { Write-Host '  docker command missing' -ForegroundColor Yellow }

Write-Host "`nWA Client Hub containers:"
if (Test-Path '.env.docker') { docker compose --env-file .env.docker -f compose.yml ps } else { Write-Host '  .env.docker missing; run Setup-WA-Client-Hub.bat' -ForegroundColor Yellow }

$values = Read-WaEnvFile '.env.docker'
$origin = Get-WaAppOrigin $values
$health = Test-WaEndpoint "$origin/api/health"
$ready = Test-WaEndpoint "$origin/api/ready"
Write-Host "`nApp health:    $($health.Status)"
Write-Host "App readiness: $($ready.Status)"
Write-Host "Local URL:     http://127.0.0.1:3131"
Write-Host "Public URL:    $origin"

Write-Host "`nWindows startup task:"
& schtasks.exe /Query /TN 'WA Client Hub - Start stack' /FO LIST 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host '  not installed' -ForegroundColor Yellow }

Write-Host "`nCloudflare service:"
$service = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($service) { Write-Host "  $($service.Status) ($($service.StartType))" } else { Write-Host '  not installed' -ForegroundColor Yellow }
Write-Host "`nNamed tunnel config: $env:USERPROFILE\.cloudflared\config.yml"
if (-not (Test-Path (Join-Path $env:USERPROFILE '.cloudflared\config.yml'))) { Write-Host '  not found' -ForegroundColor Yellow }

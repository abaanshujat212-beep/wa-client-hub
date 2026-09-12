$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-WaRepositoryRoot

try {
  $envValues = Assert-WaDockerEnv '.env.docker'
  Wait-WaDocker
  # Daily launch intentionally does not use --build. Build explicitly when source or image changes.
  Invoke-WaCompose @('--env-file', '.env.docker', '-f', 'compose.yml', 'up', '-d', '--wait')
  $origin = Get-WaAppOrigin $envValues
  $health = Wait-WaHealth $origin
  Write-WaHealthSummary $origin $health
  if (-not ($health.Health.Ok -and $health.Ready.Ok)) { throw 'The app did not pass both health checks.' }

  $service = Get-Service cloudflared -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Running') {
      try { Start-Service cloudflared; $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(20)) } catch { throw "Existing Cloudflare service is stopped and could not be started: $($_.Exception.Message)" }
    }
    Write-Host "Cloudflare service: Running" -ForegroundColor Green
  } else {
    Write-Host 'Cloudflare service: NOT INSTALLED (the daily launcher will not create a tunnel or DNS route).' -ForegroundColor Yellow
    exit 2
  }
  Write-Host 'SUCCESS: Docker app stack recovered without rebuilding; existing Cloudflare service is running.' -ForegroundColor Green
  exit 0
} catch {
  Write-Host "ACTION REQUIRED: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host 'Run Setup-WA-Client-Hub.bat if configuration is missing.' -ForegroundColor Yellow
  exit 2
}

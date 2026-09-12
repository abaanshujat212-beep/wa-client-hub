param(
  [ValidateSet('docker', 'pm2')]
  [string]$Mode = 'docker'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$StartupScript = Join-Path $Root 'scripts\start-stack-windows.ps1'
if (-not (Test-Path $StartupScript)) { throw "Startup script not found: $StartupScript" }

$taskName = 'WA Client Hub - Start stack'
$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$StartupScript`" -Mode $Mode"
& schtasks.exe /Create /TN $taskName /SC ONLOGON /TR $taskRun /F /RL LIMITED
if ($LASTEXITCODE -ne 0) { throw 'Could not create the Windows logon task.' }

Write-Host "Created '$taskName' for mode '$Mode'." -ForegroundColor Green
Write-Host 'The task starts Docker Desktop, waits for Docker, then starts the selected stack.'
Write-Host "Test now with: schtasks.exe /Run /TN `"$taskName`""
Write-Host "Remove it with: schtasks.exe /Delete /TN `"$taskName`" /F"

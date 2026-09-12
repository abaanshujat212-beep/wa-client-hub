param(
  [ValidateSet('docker', 'pm2')]
  [string]$Mode = 'docker'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$StartupScript = Join-Path $Root 'scripts\start-stack-windows.ps1'
if (-not (Test-Path $StartupScript)) { throw "Startup script not found: $StartupScript" }

$taskName = 'WA Client Hub - Start stack'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartupScript`" -Mode $Mode"

try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
  $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType InteractiveToken -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
} catch {
  throw "Could not create the Windows logon task for $currentUser. Windows returned: $($_.Exception.Message). Try an elevated PowerShell once, then rerun this script."
}

Write-Host "Created '$taskName' for $currentUser in mode '$Mode'." -ForegroundColor Green
Write-Host 'The task starts Docker Desktop, waits for Docker, then starts the selected stack.'
Write-Host "Test now with: Start-ScheduledTask -TaskName `"$taskName`""
Write-Host "Remove it with: Unregister-ScheduledTask -TaskName `"$taskName`" -Confirm:`$false"

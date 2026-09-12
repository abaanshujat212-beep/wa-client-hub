$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-WaRepositoryRoot
$actions = [System.Collections.Generic.List[string]]::new()

function Add-Action([string]$Message) { $actions.Add($Message); Write-Host "ACTION REQUIRED: $Message" -ForegroundColor Yellow }
function Ask-YesNo([string]$Question, [bool]$Default = $true) {
  $suffix = if ($Default) { '[Y/n]' } else { '[y/N]' }
  $answer = Read-Host "$Question $suffix"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
  return $answer.Trim().ToLowerInvariant() -in @('y', 'yes')
}
function Ensure-OptionalTool([string]$Name, [string]$WingetId, [string]$InstallHelp) {
  if (Get-Command $Name -ErrorAction SilentlyContinue) { return $true }
  Write-Host "$Name is missing. $InstallHelp" -ForegroundColor Yellow
  if ((Get-Command winget -ErrorAction SilentlyContinue) -and (Ask-YesNo "Install $Name with winget now?" $false)) {
    & winget install --id $WingetId --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -eq 0 -and (Get-Command $Name -ErrorAction SilentlyContinue)) { return $true }
    Write-Host "$Name was installed or updated. Open a new PowerShell window if it is still not on PATH." -ForegroundColor Yellow
  }
  Add-Action "Install $Name, then rerun this launcher: $InstallHelp"
  return $false
}

Write-Host 'This is safe to rerun. Existing .env files, tunnel config, credentials, and Docker volumes are preserved.' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Add-Action 'Install Node.js 22 LTS from https://nodejs.org, open a new terminal, and rerun this launcher.'
  Write-Host 'Setup stopped before changing the application stack.' -ForegroundColor Yellow
  exit 2
}
$dockerAvailable = Ensure-OptionalTool 'docker' 'Docker.DockerDesktop' 'Install Docker Desktop from https://docs.docker.com/desktop/install/windows-install/'
$cloudflaredAvailable = Ensure-OptionalTool 'cloudflared' 'Cloudflare.cloudflared' 'Install it with: winget install --id Cloudflare.cloudflared'

try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup-windows.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Repository setup failed.' }
} catch {
  Add-Action $_.Exception.Message
  exit 2
}

try { $envValues = Assert-WaDockerEnv '.env.docker' } catch { Add-Action $_.Exception.Message; exit 2 }
if (-not $dockerAvailable) { Write-Host 'Docker mode is not started until Docker Desktop is installed.' -ForegroundColor Yellow; exit 2 }

try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-stack-windows.ps1') -Mode docker
  if ($LASTEXITCODE -ne 0) { throw 'Docker stack startup failed.' }
  $origin = Get-WaAppOrigin $envValues
  $health = Wait-WaHealth $origin
  Write-WaHealthSummary $origin $health
  if (-not ($health.Health.Ok -and $health.Ready.Ok)) { Add-Action 'The Docker stack started but /api/health or /api/ready did not return 2xx.' }
} catch { Add-Action $_.Exception.Message }

if (Ask-YesNo 'Install or refresh the WA Client Hub Windows logon startup task?' $true) {
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'install-windows-autostart.ps1') -Mode docker
    if ($LASTEXITCODE -ne 0) { throw 'The Windows startup task could not be installed.' }
  } catch { Add-Action $_.Exception.Message }
}

$configPath = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if ($cloudflaredAvailable -and (Test-Path $configPath)) {
  Write-Host "Existing Cloudflare config preserved: $configPath" -ForegroundColor Green
  if (-not (Get-Service cloudflared -ErrorAction SilentlyContinue)) { Add-Action 'Install the existing named Cloudflare Tunnel as a Windows service from an elevated PowerShell.' }
} elseif ($cloudflaredAvailable -and (Ask-YesNo 'Configure a new named Cloudflare Tunnel now?' $false)) {
  Write-Host 'The next command opens the Cloudflare browser login. Do not continue unless you control the domain.' -ForegroundColor Yellow
  & cloudflared tunnel login
  if ($LASTEXITCODE -ne 0) { Add-Action 'cloudflared tunnel login did not complete.' } else {
    $tunnelName = Read-Host 'New tunnel name'
    $createOutput = (& cloudflared tunnel create $tunnelName 2>&1 | Out-String)
    Write-Host $createOutput
    $match = [regex]::Match($createOutput, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
    if (-not $match.Success) {
      Add-Action 'Tunnel was created or attempted, but the UUID was not detected. Run cloudflared tunnel list and then scripts/setup-cloudflare-tunnel.ps1 manually.'
    } else {
      $hostname = Read-Host 'Hostname to route, for example app.example.com'
      try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'setup-cloudflare-tunnel.ps1') -TunnelName $tunnelName -TunnelId $match.Value -Hostname $hostname
        if ($LASTEXITCODE -ne 0) { throw 'Named tunnel configuration failed.' }
        Add-Action 'Open an elevated PowerShell and install/start the Cloudflare service using the commands printed above.'
      } catch { Add-Action $_.Exception.Message }
    }
  }
} elseif (-not $cloudflaredAvailable) {
  Add-Action 'Cloudflare Tunnel setup was skipped because cloudflared is not installed.'
} else {
  Add-Action 'No named Cloudflare config was found. Configure the existing tunnel or create a named tunnel before public callbacks.'
}

Write-Host ''
if ($actions.Count -eq 0) {
  Write-Host 'SUCCESS: WA Client Hub is configured, healthy, and scheduled for startup.' -ForegroundColor Green
  exit 0
}
Write-Host 'ACTION REQUIRED: setup completed only where safe; review the items above and rerun after fixing them.' -ForegroundColor Yellow
exit 2

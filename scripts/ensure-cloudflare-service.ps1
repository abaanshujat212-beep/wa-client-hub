[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $env:USERPROFILE '.cloudflared\config.yml')
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'This script must be run from an elevated PowerShell window (Run as administrator).'
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  throw 'cloudflared is missing. Install it with: winget install --id Cloudflare.cloudflared'
}

$configPath = [IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Cloudflare config not found: $configPath"
}

$configLines = Get-Content -LiteralPath $configPath
$tunnelLine = $configLines | Where-Object { $_ -match '^\s*tunnel\s*:' } | Select-Object -First 1
$credentialsLine = $configLines | Where-Object { $_ -match '^\s*credentials-file\s*:' } | Select-Object -First 1

if (-not $tunnelLine -or $tunnelLine -notmatch '^\s*tunnel\s*:\s*(?<id>[0-9a-fA-F-]{36})\s*$') {
  throw "The Cloudflare config does not contain a valid tunnel UUID: $configPath"
}
if (-not $credentialsLine -or $credentialsLine -notmatch '^\s*credentials-file\s*:\s*(?<path>.+?)\s*$') {
  throw "The Cloudflare config does not contain credentials-file: $configPath"
}

$tunnelId = $Matches['id']
$sourceCredentials = $Matches['path'].Trim().Trim('"').Trim("'")
if (-not [IO.Path]::IsPathRooted($sourceCredentials)) {
  $sourceCredentials = Join-Path (Split-Path -Parent $configPath) $sourceCredentials
}
$sourceCredentials = [IO.Path]::GetFullPath($sourceCredentials)

if (-not (Test-Path -LiteralPath $sourceCredentials)) {
  throw "Tunnel credentials not found: $sourceCredentials. Restore the existing credential file; do not create a new tunnel."
}

$credentialData = Get-Content -LiteralPath $sourceCredentials | ConvertFrom-Json
if ($credentialData.TunnelID -and $credentialData.TunnelID -ne $tunnelId) {
  throw "The credentials file belongs to tunnel $($credentialData.TunnelID), not $tunnelId."
}

$systemCloudflared = Join-Path $env:WINDIR 'System32\config\systemprofile\.cloudflared'
$systemCredentials = Join-Path $systemCloudflared "$tunnelId.json"
$systemConfig = Join-Path $systemCloudflared 'config.yml'

$service = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($service) { Stop-Service cloudflared -ErrorAction SilentlyContinue }

New-Item -ItemType Directory -Force -Path $systemCloudflared | Out-Null
Copy-Item -LiteralPath $sourceCredentials -Destination $systemCredentials -Force

$updatedConfig = foreach ($line in $configLines) {
  if ($line -match '^\s*credentials-file\s*:') {
    "credentials-file: $systemCredentials"
  } else {
    $line
  }
}
Set-Content -LiteralPath $systemConfig -Value $updatedConfig -Encoding UTF8

if (-not $service) {
  & cloudflared service install
  if ($LASTEXITCODE -ne 0) { throw "cloudflared service install failed with exit code $LASTEXITCODE." }
}

Set-Service cloudflared -StartupType Automatic
Start-Service cloudflared

Write-Host "Configured the existing tunnel $tunnelId for the Windows cloudflared service." -ForegroundColor Green
Write-Host "Service config: $systemConfig"
Write-Host 'The existing tunnel and DNS route were preserved.'

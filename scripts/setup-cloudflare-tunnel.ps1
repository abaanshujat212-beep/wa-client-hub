param(
  [Parameter(Mandatory = $true)]
  [string]$TunnelName,
  [Parameter(Mandatory = $true)]
  [string]$TunnelId,
  [Parameter(Mandatory = $true)]
  [string]$Hostname,
  [string]$LocalUrl = 'http://127.0.0.1:3131'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) { throw 'cloudflared is missing. Install it with: winget install --id Cloudflare.cloudflared' }
if (-not [guid]::TryParse($TunnelId, [ref]$null)) { throw 'TunnelId must be the UUID printed by cloudflared tunnel create.' }

$CloudflaredDir = Join-Path $env:USERPROFILE '.cloudflared'
$Credentials = Join-Path $CloudflaredDir "$TunnelId.json"
if (-not (Test-Path $Credentials)) { throw "Tunnel credentials not found at $Credentials. Run cloudflared tunnel login and cloudflared tunnel create first." }
New-Item -ItemType Directory -Force -Path $CloudflaredDir | Out-Null
$config = @"
tunnel: $TunnelId
credentials-file: $Credentials

ingress:
  - hostname: $Hostname
    service: $LocalUrl
  - service: http_status:404
"@
$configPath = Join-Path $CloudflaredDir 'config.yml'
Set-Content -Path $configPath -Value $config -Encoding UTF8
& cloudflared tunnel route dns $TunnelName $Hostname
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare DNS route failed.' }

Write-Host "Wrote $configPath" -ForegroundColor Green
Write-Host 'Install the tunnel as an automatic Windows service from an elevated PowerShell:' -ForegroundColor Yellow
Write-Host '  cloudflared service install'
Write-Host '  Set-Service cloudflared -StartupType Automatic'
Write-Host '  Start-Service cloudflared'

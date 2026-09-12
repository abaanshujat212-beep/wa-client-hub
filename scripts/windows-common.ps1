$ErrorActionPreference = 'Stop'

function Set-WaRepositoryRoot {
  $script:WaRepositoryRoot = Split-Path -Parent $PSScriptRoot
  Set-Location $script:WaRepositoryRoot
}

function Require-WaCommand([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "$Name is missing. $Help" }
}

function Wait-WaDocker {
  Require-WaCommand 'docker' 'Install Docker Desktop from https://docs.docker.com/desktop/install/windows-install/'
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { return }
  $dockerRoot = Split-Path -Parent (Split-Path -Parent (Get-Command docker).Source)
  $desktop = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe",
    (Join-Path (Split-Path -Parent $dockerRoot) 'frontend\Docker Desktop.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $desktop) { throw 'Docker Desktop was not found. Install it and enable Start Docker Desktop when you sign in.' }
  if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) { Start-Process $desktop -WindowStyle Hidden }
  for ($i = 0; $i -lt 60; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 2
  }
  throw 'Docker Desktop did not become ready within 120 seconds.'
}

function Invoke-WaCompose([string[]]$Arguments) {
  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE." }
}

function Read-WaEnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}

function Assert-WaDockerEnv([string]$Path = '.env.docker') {
  if (-not (Test-Path $Path)) { throw "$Path is missing. Run Setup-WA-Client-Hub.bat." }
  $values = Read-WaEnvFile $Path
  $required = @('POSTGRES_PASSWORD', 'SESSION_SECRET', 'ADMIN_PASSWORD', 'CONNECTOR_MASTER_KEY')
  $missing = @()
  foreach ($key in $required) {
    $value = [string]$values[$key]
    if ([string]::IsNullOrWhiteSpace($value) -or $value -match 'change-me|replace-with|YOUR_|<.*>') { $missing += $key }
  }
  if ($missing.Count) { throw "Mandatory .env.docker values are missing or still placeholders: $($missing -join ', '). Edit .env.docker, then run the launcher again." }
  if (([string]$values['SESSION_SECRET']).Length -lt 32) { throw 'SESSION_SECRET must be at least 32 characters.' }
  try {
    $decoded = [Convert]::FromBase64String([string]$values['CONNECTOR_MASTER_KEY'])
    if ($decoded.Length -ne 32) { throw 'wrong length' }
  } catch { throw 'CONNECTOR_MASTER_KEY must be valid base64 for exactly 32 bytes.' }
  return $values
}

function Test-WaEndpoint([string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    return [pscustomobject]@{ Ok = $true; Status = [int]$response.StatusCode }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode.value__ }
    return [pscustomobject]@{ Ok = $false; Status = $status }
  }
}

function Wait-WaHealth([string]$BaseUrl, [int]$Attempts = 30) {
  $healthUrl = "$($BaseUrl.TrimEnd('/'))/api/health"
  $readyUrl = "$($BaseUrl.TrimEnd('/'))/api/ready"
  for ($i = 0; $i -lt $Attempts; $i++) {
    $health = Test-WaEndpoint $healthUrl
    $ready = Test-WaEndpoint $readyUrl
    if ($health.Ok -and $ready.Ok) { return [pscustomobject]@{ Health = $health; Ready = $ready } }
    Start-Sleep -Seconds 2
  }
  return [pscustomobject]@{ Health = (Test-WaEndpoint $healthUrl); Ready = (Test-WaEndpoint $readyUrl) }
}

function Get-WaAppOrigin([hashtable]$Values) {
  $origin = [string]$Values['APP_ORIGIN']
  if ([string]::IsNullOrWhiteSpace($origin)) { return 'http://127.0.0.1:3131' }
  return $origin.TrimEnd('/')
}

function Write-WaHealthSummary([string]$Origin, $Result) {
  Write-Host "Local app:  http://127.0.0.1:3131"
  Write-Host "Public app: $Origin"
  Write-Host "Health:     $($Result.Health.Status)"
  Write-Host "Readiness:  $($Result.Ready.Status)"
}

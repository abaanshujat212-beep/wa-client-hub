param(
  [string]$EnvFile = '.env.docker',
  [string]$ComposeFile = 'compose.yml'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { throw "$Path is missing." }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}
function SqlLiteral([string]$Value) { return "'" + $Value.Replace("'", "''") + "'" }
function RequireIdentifier([string]$Name, [string]$Value) {
  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw "$Name is not a safe local PostgreSQL identifier; refusing to continue." }
}
function Get-OutputLines([object]$Output) {
  $lines = @()
  foreach ($item in @($Output)) {
    if ($null -ne $item) {
      foreach ($line in ([string]$item -split "`r?`n")) {
        $trimmed = $line.Trim()
        if (-not [string]::IsNullOrWhiteSpace($trimmed)) { $lines += $trimmed }
      }
    }
  }
  return @($lines)
}
function Get-ComposeContainerIds {
  $output = & docker compose --env-file $EnvFile -f $ComposeFile ps -q postgres 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  return @(Get-OutputLines $output)
}
function Get-LabeledContainerIds {
  $output = & docker ps --filter 'label=com.docker.compose.project=wa-client-hub' --filter 'label=com.docker.compose.service=postgres' --format '{{.ID}}' 2>$null
  if ($LASTEXITCODE -ne 0) { return @() }
  return @(Get-OutputLines $output)
}
function Get-ContainerReadiness([string]$ContainerId) {
  $output = & docker inspect --format '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}no-health{{end}}' $ContainerId 2>$null
  if ($LASTEXITCODE -ne 0) { return 'inspect-failed' }
  $line = [string](@(Get-OutputLines $output) | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($line)) { return 'inspect-failed' }
  $parts = $line -split '\|', 2
  $running = [string]$parts[0]
  $health = if ($parts.Count -gt 1) { [string]$parts[1] } else { 'unknown' }
  if ($running -ieq 'true' -and ($health -ieq 'healthy' -or $health -ieq 'no-health')) { return 'ready' }
  return 'not-ready'
}
function Find-PostgresContainer([int]$TimeoutSeconds = 15, [int]$RetryMilliseconds = 750) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $discovered = $false
  while ((Get-Date) -lt $deadline) {
    $ids = @(Get-ComposeContainerIds)
    if ($ids.Count -eq 0) { $ids = @(Get-LabeledContainerIds) }
    $ids = @($ids | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)
    if ($ids.Count -gt 1) { throw 'Multiple matching PostgreSQL containers were found; refusing to continue.' }
    if ($ids.Count -eq 1) {
      $discovered = $true
      if ((Get-ContainerReadiness ([string]$ids[0])) -eq 'ready') { return [string]$ids[0] }
    }
    Start-Sleep -Milliseconds $RetryMilliseconds
  }
  if ($discovered) { throw 'PostgreSQL container discovered but PostgreSQL check failed after retry timeout: container was not running/healthy.' }
  throw 'PostgreSQL container not discovered after retry timeout; refusing to continue.'
}

$values = Read-EnvFile $EnvFile
$role = [string]$values['POSTGRES_USER']
$database = [string]$values['POSTGRES_DB']
$password = [string]$values['POSTGRES_PASSWORD']
if ([string]::IsNullOrWhiteSpace($password) -or $password -match 'change-me|replace-with|YOUR_|<.*>') { throw 'POSTGRES_PASSWORD is missing or still a placeholder.' }
RequireIdentifier 'POSTGRES_USER' $role
RequireIdentifier 'POSTGRES_DB' $database
if ($role -ne 'wa_hub' -or $database -ne 'wa_hub') { throw "Expected the local deployment role/database to be wa_hub; refusing to alter an unexpected PostgreSQL target." }

$container = Find-PostgresContainer

$roleSql = SqlLiteral $role
$dbSql = SqlLiteral $database
$checkSql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$roleSql) THEN 'role-ok' ELSE 'role-missing' END; SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_database WHERE datname=$dbSql) THEN 'database-ok' ELSE 'database-missing' END;"
$checkOutput = ($checkSql | & docker exec -i --user postgres $container psql -X -q -v ON_ERROR_STOP=1 -U $role -d postgres -tA 2>$null)
if ($LASTEXITCODE -ne 0 -or -not ($checkOutput -contains 'role-ok') -or -not ($checkOutput -contains 'database-ok')) { throw 'PostgreSQL container discovered but PostgreSQL check failed: the expected wa_hub role and database were not verified.' }

$escapedPassword = $password.Replace("'", "''")
$alterSql = "ALTER ROLE `"$role`" PASSWORD '$escapedPassword';"
$alterSql | & docker exec -i --user postgres $container psql -X -q -v ON_ERROR_STOP=1 -U $role -d postgres 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL container discovered but PostgreSQL password synchronization failed without changing or deleting the database volume.' }
Write-Host 'PostgreSQL role password synchronized from the local deployment configuration.' -ForegroundColor Green

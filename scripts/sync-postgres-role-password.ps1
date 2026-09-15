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

$values = Read-EnvFile $EnvFile
$role = [string]$values['POSTGRES_USER']
$database = [string]$values['POSTGRES_DB']
$password = [string]$values['POSTGRES_PASSWORD']
if ([string]::IsNullOrWhiteSpace($password) -or $password -match 'change-me|replace-with|YOUR_|<.*>') { throw 'POSTGRES_PASSWORD is missing or still a placeholder.' }
RequireIdentifier 'POSTGRES_USER' $role
RequireIdentifier 'POSTGRES_DB' $database
if ($role -ne 'wa_hub' -or $database -ne 'wa_hub') { throw "Expected the local deployment role/database to be wa_hub; refusing to alter an unexpected PostgreSQL target." }

$container = (& docker compose --env-file $EnvFile -f $ComposeFile ps -q postgres 2>$null | Select-Object -First 1).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($container)) { throw 'The PostgreSQL container is not running; start PostgreSQL and Redis before password synchronization.' }

$roleSql = SqlLiteral $role
$dbSql = SqlLiteral $database
$checkSql = "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$roleSql) THEN 'role-ok' ELSE 'role-missing' END; SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_database WHERE datname=$dbSql) THEN 'database-ok' ELSE 'database-missing' END;"
$checkOutput = ($checkSql | & docker exec -i --user postgres $container psql -X -q -v ON_ERROR_STOP=1 -d postgres -tA 2>$null)
if ($LASTEXITCODE -ne 0 -or -not ($checkOutput -contains 'role-ok') -or -not ($checkOutput -contains 'database-ok')) { throw 'The running PostgreSQL container does not contain the expected wa_hub role and database; refusing to change credentials.' }

$escapedPassword = $password.Replace("'", "''")
$alterSql = "ALTER ROLE \"$role\" PASSWORD '$escapedPassword';"
$alterSql | & docker exec -i --user postgres $container psql -X -q -v ON_ERROR_STOP=1 -d postgres 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL role password synchronization failed without changing or deleting the database volume.' }
Write-Host 'PostgreSQL role password synchronized from the local deployment configuration.' -ForegroundColor Green

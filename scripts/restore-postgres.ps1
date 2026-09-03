param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) { throw 'Restore replaces database objects. Re-run with -ConfirmRestore after verifying the target and backup.' }
if (-not $DatabaseUrl) { throw 'DATABASE_URL or -DatabaseUrl is required' }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) { throw 'pg_restore is required on PATH' }
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
if ([System.IO.Path]::GetExtension($resolvedBackup) -ne '.dump') { throw 'Expected a .dump backup file' }

& pg_restore --dbname=$DatabaseUrl --clean --if-exists --no-owner --no-acl --exit-on-error $resolvedBackup
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed' }
Write-Output "Restored $resolvedBackup"

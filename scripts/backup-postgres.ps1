param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
if (-not $DatabaseUrl) { throw 'DATABASE_URL or -DatabaseUrl is required' }
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw 'pg_dump is required on PATH' }

$resolvedBackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $resolvedBackupDirectory "wa-client-hub-$stamp.dump"
& pg_dump --dbname=$DatabaseUrl --format=custom --no-owner --no-acl --file=$output
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL backup failed' }
Write-Output $output

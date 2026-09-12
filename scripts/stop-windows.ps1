$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-common.ps1')
Set-WaRepositoryRoot
Require-WaCommand 'docker' 'Install Docker Desktop first.'
Wait-WaDocker
if (-not (Test-Path '.env.docker')) { throw '.env.docker is missing. Run Setup-WA-Client-Hub.bat.' }
# stop never uses down, down --volumes, prune, or volume deletion.
Invoke-WaCompose @('--env-file', '.env.docker', '-f', 'compose.yml', 'stop')
Write-Host 'SUCCESS: WA Client Hub containers stopped. Docker volumes and PostgreSQL data were not removed.' -ForegroundColor Green

#requires -Version 5.1

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile = Join-Path $Root "docker-compose.yml"
$InitDirectory = Join-Path $Root "init"
$SchemaFile = Join-Path $InitDirectory "initdb.sql"
$SecretsDirectory = Join-Path $Root "secrets"
$SecretFile = Join-Path $SecretsDirectory "guac_db_password.txt"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Step {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Cyan
}

Write-Step "Checking Docker"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker command nahi mili. Docker Desktop start karke dobara run karein."
}

docker info | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Engine running nahi hai. Docker Desktop open karke Engine Running ka wait karein."
}

New-Item -ItemType Directory -Force -Path $InitDirectory, $SecretsDirectory | Out-Null

if (-not (Test-Path -LiteralPath $SecretFile)) {
    Write-Step "Generating database secret"
    $Bytes = New-Object byte[] 48
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $Rng.GetBytes($Bytes)
    }
    finally {
        $Rng.Dispose()
    }

    $Secret = [Convert]::ToBase64String($Bytes).Replace("+", "A").Replace("/", "B").TrimEnd("=")
    [System.IO.File]::WriteAllText($SecretFile, $Secret, $Utf8NoBom)

    try {
        $Principal = "$env:USERDOMAIN\$env:USERNAME"
        & icacls.exe $SecretFile /inheritance:r /grant:r "${Principal}:F" "*S-1-5-18:F" "*S-1-5-32-544:F" | Out-Null
    }
    catch {
        Write-Warning "Secret file ACL automatically restrict nahi ho saki. File ko private rakhein: $SecretFile"
    }
}

Write-Step "Downloading pinned container images"
docker pull guacamole/guacamole:1.6.0
if ($LASTEXITCODE -ne 0) { throw "Guacamole image download failed." }

docker pull guacamole/guacd:1.6.0
if ($LASTEXITCODE -ne 0) { throw "guacd image download failed." }

docker pull postgres:16-alpine
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL image download failed." }

if (-not (Test-Path -LiteralPath $SchemaFile)) {
    Write-Step "Generating Guacamole PostgreSQL schema"
    $SchemaLines = & docker run --rm guacamole/guacamole:1.6.0 /opt/guacamole/bin/initdb.sh --postgresql
    if ($LASTEXITCODE -ne 0 -or -not $SchemaLines) {
        throw "Database schema generate nahi ho saki."
    }

    $Schema = ($SchemaLines -join [Environment]::NewLine) + [Environment]::NewLine
    [System.IO.File]::WriteAllText($SchemaFile, $Schema, $Utf8NoBom)
}

Write-Step "Starting Guacamole services"
Push-Location $Root
try {
    docker compose -f $ComposeFile up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose services start nahi ho saken."
    }
}
finally {
    Pop-Location
}

Write-Step "Waiting for Guacamole"
$Ready = $false
for ($Attempt = 1; $Attempt -le 45; $Attempt++) {
    try {
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:8085/" -UseBasicParsing -TimeoutSec 3
        if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
            $Ready = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 2
    }
}

docker compose -f $ComposeFile ps

if (-not $Ready) {
    Write-Warning "Containers start ho gaye, lekin web login abhi ready nahi. Diagnose-Guacamole.ps1 run karein."
    exit 1
}

Write-Host "`nGuacamole ready hai:" -ForegroundColor Green
Write-Host "URL: http://127.0.0.1:8085/"
Write-Host "Initial username: guacadmin"
Write-Host "Initial password: guacadmin"
Write-Host "`nLogin ke foran baad default password change karein." -ForegroundColor Yellow

Start-Process "http://127.0.0.1:8085/"

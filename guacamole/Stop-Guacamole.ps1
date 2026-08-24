#requires -Version 5.1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
    docker compose stop
    if ($LASTEXITCODE -ne 0) {
        throw "Guacamole stop nahi ho saka."
    }
}
finally {
    Pop-Location
}

Write-Host "Guacamole containers stopped. Database volume safe hai." -ForegroundColor Green

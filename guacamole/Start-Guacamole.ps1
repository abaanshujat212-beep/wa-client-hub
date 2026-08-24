#requires -Version 5.1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
    docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        throw "Guacamole start nahi ho saka."
    }
    docker compose ps
}
finally {
    Pop-Location
}

Start-Process "http://127.0.0.1:8085/"

#requires -Version 5.1

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $Root
try {
    Write-Host "`nCONTAINER STATUS" -ForegroundColor Cyan
    docker compose ps

    Write-Host "`nGUACAMOLE LOGS" -ForegroundColor Cyan
    docker compose logs --tail 120 guacamole

    Write-Host "`nGUACD LOGS" -ForegroundColor Cyan
    docker compose logs --tail 80 guacd

    Write-Host "`nPOSTGRES LOGS" -ForegroundColor Cyan
    docker compose logs --tail 80 postgres
}
finally {
    Pop-Location
}

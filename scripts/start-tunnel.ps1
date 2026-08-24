$ErrorActionPreference = "Stop"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared is missing." -ForegroundColor Yellow
  Write-Host "Install it with: winget install --id Cloudflare.cloudflared"
  exit 1
}

Write-Host "Starting a temporary HTTPS tunnel to http://localhost:3131" -ForegroundColor Green
Write-Host "Use this only for testing. The public URL changes whenever the tunnel restarts." -ForegroundColor Yellow
cloudflared tunnel --url http://localhost:3131


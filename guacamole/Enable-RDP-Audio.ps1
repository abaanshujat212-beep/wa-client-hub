#requires -Version 5.1
#requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$PolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services"

New-Item -Path $PolicyPath -Force | Out-Null
New-ItemProperty -Path $PolicyPath -Name fDisableAudioCapture -PropertyType DWord -Value 0 -Force | Out-Null
New-ItemProperty -Path $PolicyPath -Name fDisableCam -PropertyType DWord -Value 0 -Force | Out-Null

Write-Host "RDP microphone aur audio playback policies enabled hain." -ForegroundColor Green
Write-Host "Policy apply karne ke liye Windows restart recommended hai." -ForegroundColor Yellow

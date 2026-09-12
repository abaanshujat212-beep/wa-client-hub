@echo off
setlocal
cd /d "%~dp0"

echo.
echo === WA Client Hub - daily run ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo ACTION REQUIRED: see the message above. Run Setup-WA-Client-Hub.bat if configuration is missing.
  pause
)
exit /b %EXIT_CODE%

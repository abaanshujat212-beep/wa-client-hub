@echo off
setlocal
cd /d "%~dp0"

echo.
echo === WA Client Hub - status ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status-windows.ps1"
pause
exit /b %ERRORLEVEL%

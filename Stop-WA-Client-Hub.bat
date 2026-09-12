@echo off
setlocal
cd /d "%~dp0"

echo.
echo === WA Client Hub - stop application stack ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-windows.ps1"
pause
exit /b %ERRORLEVEL%

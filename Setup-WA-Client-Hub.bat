@echo off
setlocal
cd /d "%~dp0"

echo.
echo === WA Client Hub - first-time setup ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows-first-run.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo ACTION REQUIRED: setup did not finish successfully.
  pause
)
exit /b %EXIT_CODE%

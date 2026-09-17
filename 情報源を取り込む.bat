@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0情報源を取り込む.ps1"
echo.
pause

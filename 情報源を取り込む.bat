@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0触る必要なし\情報源を取り込む.ps1"
echo.
pause

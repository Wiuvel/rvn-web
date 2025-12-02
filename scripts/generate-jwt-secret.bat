@echo off
REM Batch скрипт для генерации JWT_SECRET в Windows
REM Использование: scripts\generate-jwt-secret.bat

echo.
echo === JWT_SECRET Generator ===
echo.
echo Используется PowerShell для генерации...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0generate-jwt-secret.ps1"

pause


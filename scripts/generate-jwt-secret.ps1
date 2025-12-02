# PowerShell скрипт для генерации JWT_SECRET в Windows
# Использование: .\scripts\generate-jwt-secret.ps1

# Генерируем случайный секретный ключ длиной 64 байта (512 бит)
$bytes = New-Object byte[] 64
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)

Write-Host ""
Write-Host "=== JWT_SECRET Generated ===" -ForegroundColor Green
Write-Host ""
Write-Host "Добавьте следующую строку в ваш .env файл:" -ForegroundColor Yellow
Write-Host ""
Write-Host "JWT_SECRET=$secret" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠️  ВАЖНО: Храните этот секрет в безопасности!" -ForegroundColor Red
Write-Host ""
Write-Host "Не коммитьте его в Git!" -ForegroundColor Red
Write-Host ""




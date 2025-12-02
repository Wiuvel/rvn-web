/**
 * Скрипт для генерации JWT_SECRET
 * Использование: node scripts/generate-jwt-secret.js
 */

const crypto = require('crypto');

// Генерируем случайный секретный ключ длиной 64 байта (512 бит)
const secret = crypto.randomBytes(64).toString('base64');

console.log('\n=== JWT_SECRET Generated ===\n');
console.log('Добавьте следующую строку в ваш .env файл:\n');
console.log(`JWT_SECRET=${secret}\n`);
console.log('⚠️  ВАЖНО: Храните этот секрет в безопасности!\n');
console.log('Не коммитьте его в Git!\n');




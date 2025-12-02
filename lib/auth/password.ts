/**
 * Безопасные операции с паролями
 */

import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

const SALT_ROUNDS = 12;

/**
 * Хеширует пароль с bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Проверяет пароль с timing-safe сравнением
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  // bcrypt.compare уже timing-safe, но добавляем случайную задержку
  // для защиты от timing атак на уровне сети
  const [result] = await Promise.all([
    bcrypt.compare(password, hash),
    addRandomDelay(50, 150),
  ]);

  return result;
}

/**
 * Добавляет случайную задержку для защиты от timing атак
 */
async function addRandomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = randomInt(minMs, maxMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}


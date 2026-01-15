import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { randomBytes } from "crypto"
import { domains } from './config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Генерирует случайный session ID
 * Используется для CSRF токенов и сессий
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

// Экспортируем domains для удобства
export { domains };

/**
 * Генерирует URL для статических файлов с поддержкой CDN
 * В продакшене использует CDN URL из переменной окружения или дефолтный
 * @param path - Путь к статическому файлу (например, '/static/logo.svg')
 * @returns Полный URL с CDN префиксом в продакшене
 */
export function getStaticUrl(path: string): string {
  // Убираем начальный слэш если есть, чтобы избежать двойных слэшей
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // В продакшене используем CDN, в dev - относительный путь
  if (process.env.NODE_ENV === 'production') {
    // Убираем trailing slash из CDN URL если есть
    const cleanCdnUrl = domains.cdnUrl.endsWith('/') ? domains.cdnUrl.slice(0, -1) : domains.cdnUrl;
    return `${cleanCdnUrl}${cleanPath}`;
  }
  
  return cleanPath;
}

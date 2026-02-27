import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { randomBytes } from 'crypto';
import { domains } from './config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
 * Генерирует URL для статических файлов
 * @param path - Путь к статическому файлу (например, '/static/logo.svg')
 * @returns Относительный путь к статическому файлу
 */
export function getStaticUrl(path: string): string {
  // Убираем начальный слэш если есть, чтобы избежать двойных слэшей
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath;
}

/**
 * Определяет домен для cookie на основе hostname
 * @param hostname - Hostname запроса
 * @returns Cookie domain или undefined для localhost/vercel
 */
export function getCookieDomain(hostname: string): string | undefined {
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isVercel = hostname.includes('vercel.app');

  // Не устанавливаем domain для localhost и vercel
  if (isLocalhost || isVercel) {
    return undefined;
  }

  // Проверяем, является ли hostname поддоменом основного домена
  if (hostname === domains.main || hostname.endsWith(`.${domains.main}`)) {
    return `.${domains.main}`;
  }

  return undefined;
}

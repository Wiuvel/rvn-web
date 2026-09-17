/**
 * Валидация и извлечение IP-адреса из запроса
 * Поддерживает различные заголовки для определения реального IP клиента
 */

import { isIP } from 'node:net';

/**
 * Валидирует формат IP-адреса (IPv4 или IPv6) используя стандарты node:net
 */
export function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  return isIP(ip) !== 0;
}

/**
 * Извлекает и валидирует IP-адрес из запроса
 * Приоритет: Cloudflare > Real-IP > Forwarded-For
 */
export function getClientIP(request: Request): string {
  // Cloudflare IP (наиболее надежный источник)
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP && isValidIP(cfConnectingIP.trim())) {
    return cfConnectingIP.trim();
  }

  // Real-IP (часто используется прокси)
  const realIP = request.headers.get('x-real-ip');
  if (realIP && isValidIP(realIP.trim())) {
    return realIP.trim();
  }

  // Forwarded-For (может содержать несколько IP через запятую)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Берем первый IP из списка (оригинальный клиент)
    const firstIP = forwarded.split(',')[0]?.trim();
    if (firstIP && isValidIP(firstIP)) {
      return firstIP;
    }
  }

  // Fallback: используем 'unknown' если не удалось определить IP
  // Это безопаснее, чем использовать невалидный IP
  return 'unknown';
}

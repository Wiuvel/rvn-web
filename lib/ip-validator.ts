/**
 * Валидация и извлечение IP-адреса из запроса
 * Поддерживает различные заголовки для определения реального IP клиента
 */

/**
 * Валидирует формат IP-адреса (IPv4 или IPv6)
 */
export function isValidIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') {
    return false;
  }

  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 regex (упрощенный, но достаточный)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  if (ipv4Regex.test(ip)) {
    // Проверяем, что каждый октет в диапазоне 0-255
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  if (ipv6Regex.test(ip)) {
    return true;
  }

  return false;
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



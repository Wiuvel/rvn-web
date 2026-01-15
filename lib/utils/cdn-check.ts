/**
 * Утилиты для проверки доступности CDN и fallback на основной домен
 */

import { domains } from './config';

// Ключ для хранения статуса CDN в localStorage
const CDN_STATUS_KEY = 'cdn_available';
const CDN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 минут

/**
 * Проверяет доступность CDN через загрузку небольшого тестового файла
 * @param timeout - Таймаут проверки в миллисекундах (по умолчанию 3 секунды)
 * @returns Promise<boolean> - true если CDN доступен, false если нет
 */
export async function checkCdnAvailability(timeout: number = 3000): Promise<boolean> {
  // В dev режиме всегда возвращаем true (CDN не используется)
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
    return true;
  }

  // Используем небольшой тестовый файл для проверки (favicon)
  // Добавляем timestamp для избежания кеша
  const testUrl = `${domains.cdnUrl}/favicon.ico?cdn_check=${Date.now()}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Используем fetch с проверкой статуса
    const response = await fetch(testUrl, {
      method: 'GET',
      mode: 'cors', // Нужен CORS для проверки статуса
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    // Проверяем, что ответ успешный (статус 200-299)
    const isAvailable = response.ok || response.status === 0; // status 0 может быть при CORS
    
    if (!isAvailable) {
      console.warn('[CDN] CDN вернул ошибку, используем fallback');
    }

    return isAvailable;
  } catch (error) {
    // Если запрос упал - CDN недоступен
    console.warn('[CDN] CDN недоступен, используем fallback:', error);
    return false;
  }
}

/**
 * Проверяет доступность CDN с кешированием результата
 * @returns Promise<boolean> - true если CDN доступен
 */
export async function getCdnAvailability(): Promise<boolean> {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
    return true;
  }

  try {
    const cached = localStorage.getItem(CDN_STATUS_KEY);
    if (cached) {
      const { available, timestamp } = JSON.parse(cached);
      const now = Date.now();

      // Если кеш свежий (менее 5 минут), используем его
      if (now - timestamp < CDN_CHECK_INTERVAL) {
        return available;
      }
    }

    // Проверяем CDN
    const available = await checkCdnAvailability();
    
    // Сохраняем результат в кеш
    localStorage.setItem(CDN_STATUS_KEY, JSON.stringify({
      available,
      timestamp: Date.now(),
    }));

    return available;
  } catch (error) {
    // В случае ошибки считаем CDN доступным (оптимистичный подход)
    console.warn('[CDN] Ошибка при проверке CDN:', error);
    return true;
  }
}

/**
 * Сбрасывает кеш статуса CDN (принудительная проверка при следующем вызове)
 */
export function resetCdnCache(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CDN_STATUS_KEY);
  }
}

/**
 * Инициализирует проверку CDN при загрузке страницы
 * Вызывается один раз при монтировании приложения
 */
export function initCdnCheck(): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') {
    return;
  }

  // Проверяем CDN в фоне
  getCdnAvailability().catch(() => {
    // Игнорируем ошибки при инициализации
  });

  // Периодически проверяем CDN (каждые 5 минут)
  setInterval(() => {
    getCdnAvailability().catch(() => {
      // Игнорируем ошибки при периодической проверке
    });
  }, CDN_CHECK_INTERVAL);
}

/**
 * Простое in-memory кэширование с TTL
 * Для production рекомендуется использовать Redis
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Очистка истекших записей каждые 5 минут
    this.startCleanup();
  }

  private startCleanup() {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      
      this.cache.forEach((entry, key) => {
        if (entry.expiresAt < now) {
          keysToDelete.push(key);
        }
      });
      
      keysToDelete.forEach(key => this.cache.delete(key));
    }, 5 * 60 * 1000); // 5 минут
  }

  /**
   * Получить значение из кэша
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }
    
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Сохранить значение в кэш
   * @param key - Ключ кэша
   * @param data - Данные для кэширования
   * @param ttlSeconds - Время жизни в секундах (по умолчанию 5 минут)
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expiresAt });
  }

  /**
   * Удалить значение из кэша
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Очистить весь кэш
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Проверить наличие ключа в кэше
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Получить все ключи кэша (для инвалидации по паттерну)
   */
  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt >= now) {
        validKeys.push(key);
      } else {
        // Удаляем истекшие ключи
        this.cache.delete(key);
      }
    });
    
    return validKeys;
  }

  /**
   * Удалить все ключи, соответствующие паттерну
   */
  deleteByPattern(pattern: RegExp): number {
    let deletedCount = 0;
    const keysToDelete: string[] = [];
    
    this.cache.forEach((_, key) => {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      if (this.cache.delete(key)) {
        deletedCount++;
      }
    });
    
    return deletedCount;
  }

  /**
   * Очистить интервал очистки (для тестирования или graceful shutdown)
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
export const cache = new SimpleCache();

/**
 * Вспомогательная функция для кэширования результатов асинхронных функций
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  const result = await fn();
  cache.set(key, result, ttlSeconds);
  return result;
}


/**
 * In-memory кэш с TTL для данных приложения (тикеты, роли).
 * Не путать с lib/storage/media-cache.ts — тот кэширует тела медиа в Redis.
 * Здесь: без Redis, один процесс; подходит для dev и когда Redis занят только медиа-кэшем.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private static readonly MAX_SIZE = 10_000;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Очистка истекших записей каждые 5 минут
    this.startCleanup();
  }

  private startCleanup() {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(
      () => {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.cache.forEach((entry, key) => {
          if (entry.expiresAt < now) {
            keysToDelete.push(key);
          }
        });

        keysToDelete.forEach((key) => this.cache.delete(key));
      },
      5 * 60 * 1000,
    ); // 5 минут
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
    /* FIFO eviction when cache is full */
    if (this.cache.size >= SimpleCache.MAX_SIZE && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    const expiresAt = Date.now() + ttlSeconds * 1000;
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

    keysToDelete.forEach((key) => {
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

/** In-flight request map for deduplicating concurrent calls to cached() with the same key */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Вспомогательная функция для кэширования результатов асинхронных функций.
 * Дедуплицирует конкурентные запросы с одним ключом.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300,
): Promise<T> {
  const existing = cache.get<T>(key);
  if (existing !== null) return existing;

  /* Deduplicate concurrent in-flight requests */
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fn()
    .then((result) => {
      cache.set(key, result, ttlSeconds);
      inFlight.delete(key);
      return result;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

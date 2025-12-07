/**
 * Redis клиент для хранения аналитики и кэширования
 */

import Redis from 'ioredis';
import { logger } from '@/lib/utils/secure-logger';

let redis: Redis | null = null;

/**
 * Получить экземпляр Redis клиента
 */
export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    // Не логируем отсутствие Redis - это опциональная функция
    return null;
  }

  // Если соединение существует и активно, возвращаем его
  if (redis && redis.status === 'ready') {
    return redis;
  }

  // Если соединение закрыто или не готово, пересоздаем
  if (redis) {
    try {
      redis.disconnect();
    } catch {
      // Игнорируем ошибки при отключении
    }
    redis = null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000); // Exponential backoff
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect on READONLY error
        }
        // Переподключаемся при ошибке "Connection is closed"
        if (err.message.includes('Connection is closed')) {
          return true;
        }
        return false;
      },
      enableReadyCheck: true,
      lazyConnect: false,
    });

    // Автоматические события подключения не логируются

    redis.on('error', (err) => {
      // Логируем только критические ошибки
      if (!err.message.includes('ECONNREFUSED') && !err.message.includes('Connection is closed')) {
        logger.error('Redis error', { error: err.message });
      }
    });

    redis.on('close', () => {
      // Автоматическое закрытие не логируется
      redis = null;
    });

    redis.on('end', () => {
      // Автоматическое завершение не логируется
      redis = null;
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    redis = null;
    return null;
  }
}

/**
 * Закрыть соединение с Redis
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}


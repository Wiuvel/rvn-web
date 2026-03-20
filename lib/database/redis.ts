/**
 * Redis клиент для хранения аналитики и кэширования
 */

import Redis, { RedisOptions } from 'ioredis';
import { logger } from '@/lib/utils/secure-logger';
import fs from 'fs';

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
    const isTls = redisUrl.startsWith('rediss://');
    const options: RedisOptions = {
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
    };

    if (isTls) {
      options.tls = {
        rejectUnauthorized: true,
      };

      const certPath = process.env.REDIS_CERT_PATH || '/app/certs/ca.pem';
      if (fs.existsSync(certPath)) {
        options.tls.ca = [fs.readFileSync(certPath)];
      } else if (process.env.REDIS_CERT_PATH) {
        logger.warn(`Redis TLS certificate not found at ${certPath}`);
      }
    }

    redis = new Redis(redisUrl, options);

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
      error: error instanceof Error ? error.message : 'Unknown error',
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

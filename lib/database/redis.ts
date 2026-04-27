/**
 * Redis клиент — стабильный singleton с автоматическим reconnect через ioredis.
 *
 * Принцип: создаём инстанс один раз, никогда не обнуляем.
 * ioredis сам управляет reconnect через retryStrategy + enableOfflineQueue.
 * Команды во время reconnect буферизируются (offline queue) и выполняются после восстановления.
 * Отдельные команды фейлятся после maxRetriesPerRequest (3) попыток — это не убивает клиент.
 */

import Redis, { RedisOptions } from 'ioredis';
import { logger } from '@/lib/utils/secure-logger';

let redis: Redis | null = null;

/**
 * Получить экземпляр Redis клиента.
 * Возвращает один и тот же инстанс независимо от текущего статуса соединения.
 * Возвращает null только если REDIS_URL не задан.
 */
export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (redis) return redis;

  try {
    const isTls = redisUrl.startsWith('rediss://');
    const options: RedisOptions = {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        return Math.min(times * 500, 5000);
      },
      reconnectOnError: (err) => {
        if (err.message.includes('READONLY')) return true;
        if (err.message.includes('Connection is closed')) return true;
        return false;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false,
      keepAlive: 30000,
    };

    if (isTls) {
      options.tls = {
        rejectUnauthorized: true,
      };

      const certPath = process.env.REDIS_CERT_PATH;
      try {
        if (certPath) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          if (fs.existsSync(certPath)) {
            const certContent = fs.readFileSync(certPath);
            options.tls.ca = [certContent];
          } else {
            logger.warn(`Redis TLS certificate not found at ${certPath}`);
          }
        }
      } catch (e) {
        logger.warn(`Failed to read Redis TLS certificate at ${certPath}`, { error: e });
      }
    }

    redis = new Redis(redisUrl, options);

    redis.on('error', (err) => {
      if (
        !err.message.includes('ECONNREFUSED') &&
        !err.message.includes('Connection is closed') &&
        !err.message.includes('ENOTFOUND')
      ) {
        logger.error('Redis error', { error: err.message });
      }
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Закрыть соединение с Redis (для graceful shutdown)
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

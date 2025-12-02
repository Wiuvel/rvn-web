/**
 * Периодическая очистка истекших refresh токенов
 * Можно запускать через cron job или в фоновом режиме
 */
import { cleanupExpiredRefreshTokens } from './jwt-storage';
import { logger } from './secure-logger';
import { appConfig } from './config';

let cleanupInterval: NodeJS.Timeout | null = null;

export function startRefreshTokenCleanup(): void {
  if (cleanupInterval) {
    logger.warn('Refresh token cleanup already started');
    return;
  }

  performCleanup();

  cleanupInterval = setInterval(() => {
    performCleanup();
  }, appConfig.jwt.refreshTokenStorage.cleanupInterval);

  logger.info('Refresh token cleanup started', {
    interval: appConfig.jwt.refreshTokenStorage.cleanupInterval
  });
}

export function stopRefreshTokenCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Refresh token cleanup stopped');
  }
}

async function performCleanup(): Promise<void> {
  try {
    const result = await cleanupExpiredRefreshTokens();
    if (result.success && result.deletedCount) {
      logger.info('Refresh token cleanup completed', {
        deletedCount: result.deletedCount
      });
    }
  } catch (error) {
    logger.error('Error during refresh token cleanup', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

if (typeof window === 'undefined') {
  startRefreshTokenCleanup();
}


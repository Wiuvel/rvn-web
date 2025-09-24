import { initRedis, closeRedis } from './redis';
import { logger } from './secure-logger';

// Initialize Redis on module load
let isInitialized = false;

export async function ensureRedisInitialized(): Promise<void> {
  if (isInitialized) return;
  
  try {
    await initRedis();
    isInitialized = true;
    logger.info('Redis initialization completed');
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw - allow app to continue without Redis
  }
}

// Graceful shutdown handler
export function setupRedisShutdown(): void {
  const shutdown = async () => {
    logger.info('Shutting down Redis connection...');
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('beforeExit', shutdown);
}

// Auto-initialize Redis
ensureRedisInitialized().catch((error) => {
  logger.error('Auto-initialization of Redis failed', {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
});

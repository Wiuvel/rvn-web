import { createClient, RedisClientType } from 'redis';
import { logger } from './secure-logger';

class RedisManager {
  private client: RedisClientType | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      this.client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'redis-14849.c328.europe-west3-1.gce.redns.redis-cloud.com'}:${process.env.REDIS_PORT || '14849'}`,
        password: process.env.REDIS_PASSWORD || '',
        socket: {
          connectTimeout: 10000,
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('Redis client disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });

      await this.client.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  getClient(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  isRedisConnected(): boolean {
    return this.isConnected;
  }

  // Helper methods for common operations
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  async del(key: string): Promise<number> {
    const client = this.getClient();
    return await client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const client = this.getClient();
    const result = await client.incr(key);
    if (ttlSeconds && result === 1) {
      await client.expire(key, ttlSeconds);
    }
    return result;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const client = this.getClient();
    const result = await client.expire(key, ttlSeconds);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();
    return await client.keys(pattern);
  }

  async flushPattern(pattern: string): Promise<number> {
    const client = this.getClient();
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    return await client.del(keys);
  }
}

// Singleton instance
export const redisManager = new RedisManager();

// Initialize Redis connection
export async function initRedis(): Promise<void> {
  try {
    await redisManager.connect();
    logger.info('Redis initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Redis', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    // Don't throw error to allow app to continue without Redis
    // In production, you might want to throw here
  }
}

// Graceful shutdown
export async function closeRedis(): Promise<void> {
  try {
    await redisManager.disconnect();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

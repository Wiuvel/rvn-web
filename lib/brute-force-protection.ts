import { redisManager } from './redis';
import { logger } from './secure-logger';

interface BruteForceConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

const DEFAULT_CONFIG: BruteForceConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
  blockDurationMs: 30 * 60 * 1000, // 30 minutes
};

export class BruteForceProtection {
  private config: BruteForceConfig;

  constructor(config: Partial<BruteForceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getAttemptKey(identifier: string): string {
    return `brute_force:attempts:${identifier}`;
  }

  private getBlockKey(identifier: string): string {
    return `brute_force:blocked:${identifier}`;
  }

  async recordFailedAttempt(identifier: string, reason: string = 'login_failed'): Promise<void> {
    try {
      const attemptKey = this.getAttemptKey(identifier);
      const windowSeconds = Math.floor(this.config.windowMs / 1000);
      
      // Increment attempt counter
      const attempts = await redisManager.incr(attemptKey, windowSeconds);
      
      // Set TTL on first attempt
      if (attempts === 1) {
        await redisManager.expire(attemptKey, windowSeconds);
      }
      
      logger.warn('Failed authentication attempt recorded', {
        identifier: this.anonymizeIdentifier(identifier),
        attempts,
        reason,
        maxAttempts: this.config.maxAttempts
      });

      // Check if we should block this identifier
      if (attempts >= this.config.maxAttempts) {
        await this.blockIdentifier(identifier, attempts);
      }
    } catch (error) {
      logger.error('Error recording failed attempt', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
    }
  }

  async recordSuccessfulAttempt(identifier: string): Promise<void> {
    try {
      const attemptKey = this.getAttemptKey(identifier);
      const blockKey = this.getBlockKey(identifier);
      
      // Clear attempt counter and block status
      await Promise.all([
        redisManager.del(attemptKey),
        redisManager.del(blockKey)
      ]);
      
      logger.info('Successful authentication - cleared brute force protection', {
        identifier: this.anonymizeIdentifier(identifier)
      });
    } catch (error) {
      logger.error('Error clearing brute force protection', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
    }
  }

  async isBlocked(identifier: string): Promise<boolean> {
    try {
      const blockKey = this.getBlockKey(identifier);
      return await redisManager.exists(blockKey);
    } catch (error) {
      logger.error('Error checking block status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
      // Fail safe - don't block if we can't check
      return false;
    }
  }

  async getRemainingAttempts(identifier: string): Promise<number> {
    try {
      const attemptKey = this.getAttemptKey(identifier);
      const attempts = await redisManager.get(attemptKey);
      const currentAttempts = attempts ? parseInt(attempts, 10) : 0;
      return Math.max(0, this.config.maxAttempts - currentAttempts);
    } catch (error) {
      logger.error('Error getting remaining attempts', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
      return this.config.maxAttempts;
    }
  }

  async getBlockTimeRemaining(identifier: string): Promise<number> {
    try {
      const blockKey = this.getBlockKey(identifier);
      const ttl = await redisManager.getClient().ttl(blockKey);
      return ttl > 0 ? ttl * 1000 : 0; // Convert to milliseconds
    } catch (error) {
      logger.error('Error getting block time remaining', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
      return 0;
    }
  }

  private async blockIdentifier(identifier: string, attempts: number): Promise<void> {
    try {
      const blockKey = this.getBlockKey(identifier);
      const blockDurationSeconds = Math.floor(this.config.blockDurationMs / 1000);
      
      await redisManager.set(blockKey, 'blocked', blockDurationSeconds);
      
      logger.error('Identifier blocked due to brute force attempts', {
        identifier: this.anonymizeIdentifier(identifier),
        attempts,
        blockDurationMs: this.config.blockDurationMs
      });
    } catch (error) {
      logger.error('Error blocking identifier', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
    }
  }

  private anonymizeIdentifier(identifier: string): string {
    // Anonymize IP addresses and usernames for logging
    if (identifier.includes('.')) {
      // IP address
      const parts = identifier.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
      }
    }
    if (identifier.includes(':')) {
      // IPv6 address
      const parts = identifier.split(':');
      if (parts.length >= 4) {
        return `${parts[0]}:${parts[1]}:xxxx:xxxx:xxxx:xxxx:xxxx:xxxx`;
      }
    }
    // Username - show first 2 chars and last 2 chars
    if (identifier.length > 4) {
      return `${identifier.substring(0, 2)}***${identifier.substring(identifier.length - 2)}`;
    }
    return '***';
  }

  async unblockIdentifier(identifier: string): Promise<void> {
    try {
      const blockKey = this.getBlockKey(identifier);
      await redisManager.del(blockKey);
      
      logger.info('Identifier unblocked manually', {
        identifier: this.anonymizeIdentifier(identifier)
      });
    } catch (error) {
      logger.error('Error unblocking identifier', {
        error: error instanceof Error ? error.message : 'Unknown error',
        identifier: this.anonymizeIdentifier(identifier)
      });
    }
  }

  async getStats(identifier: string): Promise<{
    isBlocked: boolean;
    remainingAttempts: number;
    blockTimeRemaining: number;
  }> {
    const [isBlocked, remainingAttempts, blockTimeRemaining] = await Promise.all([
      this.isBlocked(identifier),
      this.getRemainingAttempts(identifier),
      this.getBlockTimeRemaining(identifier)
    ]);

    return {
      isBlocked,
      remainingAttempts,
      blockTimeRemaining
    };
  }
}

// Default instance
export const bruteForceProtection = new BruteForceProtection();

// Helper function to get identifier from request
export function getBruteForceIdentifier(request: Request, username?: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  const userAgent = request.headers.get('user-agent') || '';
  
  // Use username if available, otherwise use IP+UserAgent
  if (username) {
    return `user:${username}`;
  }
  
  return `ip:${ip}:${userAgent.slice(0, 50)}`;
}

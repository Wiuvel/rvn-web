import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { redisManager } from './redis';
import { logger } from './secure-logger';

interface SessionData {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

const SESSION_TIMEOUT = 60 * 60; // 1 hour in seconds

export class SessionManager {
  static generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  static async createSession(userId: string, username: string, ipAddress: string, userAgent: string): Promise<string> {
    try {
      const sessionId = this.generateSessionId();
      const now = Date.now();
      
      const sessionData: SessionData = {
        id: sessionId,
        userId,
        username,
        createdAt: now,
        lastActivity: now,
        ipAddress,
        userAgent
      };
      
      const redisKey = `session:${sessionId}`;
      await redisManager.set(redisKey, JSON.stringify(sessionData), SESSION_TIMEOUT);
      
      return sessionId;
    } catch (error) {
      logger.error('Error creating session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId.substring(0, 8) + '...'
      });
      throw new Error('Failed to create session');
    }
  }

  static async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const redisKey = `session:${sessionId}`;
      const sessionData = await redisManager.get(redisKey);
      
      if (!sessionData) return null;
      
      const session: SessionData = JSON.parse(sessionData);
      const now = Date.now();
      
      if (now - session.lastActivity > SESSION_TIMEOUT * 1000) {
        await redisManager.del(redisKey);
        return null;
      }
      
      // Update last activity
      session.lastActivity = now;
      await redisManager.set(redisKey, JSON.stringify(session), SESSION_TIMEOUT);
      
      return session;
    } catch (error) {
      logger.error('Error getting session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return null;
    }
  }

  static async updateSession(sessionId: string, updates: Partial<SessionData>): Promise<boolean> {
    try {
      const redisKey = `session:${sessionId}`;
      const sessionData = await redisManager.get(redisKey);
      
      if (!sessionData) return false;
      
      const session: SessionData = JSON.parse(sessionData);
      Object.assign(session, updates);
      session.lastActivity = Date.now();
      
      await redisManager.set(redisKey, JSON.stringify(session), SESSION_TIMEOUT);
      return true;
    } catch (error) {
      logger.error('Error updating session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return false;
    }
  }

  static async destroySession(sessionId: string): Promise<boolean> {
    try {
      const redisKey = `session:${sessionId}`;
      const result = await redisManager.del(redisKey);
      return result > 0;
    } catch (error) {
      logger.error('Error destroying session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return false;
    }
  }

  static async destroyAllUserSessions(userId: string): Promise<number> {
    try {
      const pattern = `session:*`;
      const keys = await redisManager.keys(pattern);
      let destroyed = 0;
      
      for (const key of keys) {
        const sessionData = await redisManager.get(key);
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          if (session.userId === userId) {
            await redisManager.del(key);
            destroyed++;
          }
        }
      }
      
      return destroyed;
    } catch (error) {
      logger.error('Error destroying user sessions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId.substring(0, 8) + '...'
      });
      return 0;
    }
  }

  static async setSessionCookie(sessionId: string, isLocalhost: boolean = false): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set('session_id', sessionId, {
      maxAge: SESSION_TIMEOUT / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/'
    });
  }

  static async clearSessionCookie(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete('session_id');
  }

  static async validateSession(sessionId: string, ipAddress: string, userAgent: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;
      
      if (session.ipAddress !== ipAddress || session.userAgent !== userAgent) {
        await this.destroySession(sessionId);
        logger.warn('Session validation failed - IP or UserAgent mismatch', {
          sessionId: sessionId.substring(0, 8) + '...',
          expectedIP: session.ipAddress,
          actualIP: ipAddress,
          expectedUA: session.userAgent.substring(0, 50),
          actualUA: userAgent.substring(0, 50)
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error validating session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: sessionId.substring(0, 8) + '...'
      });
      return false;
    }
  }
}

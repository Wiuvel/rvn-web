import { cookies } from 'next/headers';
import { SESSION_TIMEOUT, SESSION_CLEANUP_INTERVAL } from './constants';
import { generateSessionId as generateSessionIdUtil } from './utils';

interface SessionData {
  id: string;
  userId: string;
  username: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

interface SessionStore {
  [sessionId: string]: SessionData;
}

const sessions: SessionStore = {};

// Оптимизированная структура для отслеживания времени истечения
const sessionExpirationTimes = new Map<string, number>();

let sessionCleanupInterval: NodeJS.Timeout | null = null;

function startSessionCleanup() {
  if (sessionCleanupInterval) return;
  
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Проходим только по ключам, которые точно истекли
    sessionExpirationTimes.forEach((expirationTime, sessionId) => {
      if (expirationTime < now) {
        keysToDelete.push(sessionId);
      }
    });
    
    // Удаляем истекшие записи
    keysToDelete.forEach(sessionId => {
      delete sessions[sessionId];
      sessionExpirationTimes.delete(sessionId);
    });
  }, SESSION_CLEANUP_INTERVAL);
}

// Запускаем очистку при первом импорте
startSessionCleanup();

export class SessionManager {
  /**
   * Генерирует случайный session ID
   * @deprecated Используйте generateSessionId из lib/utils напрямую
   */
  static generateSessionId(): string {
    return generateSessionIdUtil();
  }

  static createSession(
    userId: string,
    username: string,
    ipAddress: string,
    userAgent: string,
  ): string {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    sessions[sessionId] = {
      id: sessionId,
      userId,
      username,
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent,
    };
    
    sessionExpirationTimes.set(sessionId, now + SESSION_TIMEOUT);

    return sessionId;
  }

  static getSession(sessionId: string): SessionData | null {
    const session = sessions[sessionId];
    if (!session) return null;

    const now = Date.now();
    const expirationTime = sessionExpirationTimes.get(sessionId);
    
    if (!expirationTime || expirationTime < now) {
      delete sessions[sessionId];
      sessionExpirationTimes.delete(sessionId);
      return null;
    }

    session.lastActivity = now;
    // Обновляем время истечения при активности
    sessionExpirationTimes.set(sessionId, now + SESSION_TIMEOUT);
    return session;
  }

  static updateSession(sessionId: string, updates: Partial<SessionData>): boolean {
    const session = sessions[sessionId];
    if (!session) return false;

    Object.assign(session, updates);
    const now = Date.now();
    session.lastActivity = now;
    // Обновляем время истечения при активности
    sessionExpirationTimes.set(sessionId, now + SESSION_TIMEOUT);
    return true;
  }

  static destroySession(sessionId: string): boolean {
    if (sessions[sessionId]) {
      delete sessions[sessionId];
      sessionExpirationTimes.delete(sessionId);
      return true;
    }
    return false;
  }

  static destroyAllUserSessions(userId: string): number {
    let destroyed = 0;
    Object.keys(sessions).forEach((sessionId) => {
      if (sessions[sessionId].userId === userId) {
        delete sessions[sessionId];
        sessionExpirationTimes.delete(sessionId);
        destroyed++;
      }
    });
    return destroyed;
  }

  static async setSessionCookie(
    sessionId: string,
    isLocalhost: boolean = false,
    cookieName = 'session_id',
  ): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(cookieName, sessionId, {
      maxAge: SESSION_TIMEOUT / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && !isLocalhost,
      sameSite: 'strict',
      path: '/',
    });
  }

  static async clearSessionCookie(cookieName = 'session_id'): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(cookieName);
  }

  static validateSession(sessionId: string, ipAddress: string, userAgent: string): boolean {
    const session = this.getSession(sessionId);
    if (!session) return false;

    if (session.ipAddress !== ipAddress || session.userAgent !== userAgent) {
      this.destroySession(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Очищает интервал очистки (для тестирования или graceful shutdown)
   */
  static cleanup(): void {
    if (sessionCleanupInterval) {
      clearInterval(sessionCleanupInterval);
      sessionCleanupInterval = null;
    }
  }
}

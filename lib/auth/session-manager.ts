import { cookies } from 'next/headers';
import { SESSION_TIMEOUT, SESSION_CLEANUP_INTERVAL } from '../utils/constants';
import { generateSessionId as generateSessionIdUtil } from '../utils/index';
import { logger } from '../utils/secure-logger';

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

  static validateSession(
    sessionId: string,
    ipAddress: string,
    userAgent: string,
    options: { strictIP?: boolean; updateCookie?: boolean } = {}
  ): { valid: boolean; reason?: string } {
    const session = this.getSession(sessionId);
    if (!session) {
      return { valid: false, reason: 'Session not found or expired' };
    }

    // Смягченная валидация User-Agent - проверяем только основную часть
    // Извлекаем основную информацию о браузере и ОС (игнорируем версии и детали)
    const normalizeUserAgent = (ua: string): string => {
      // Извлекаем основную информацию: браузер и ОС
      const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|Brave|Vivaldi|YandexBrowser|YaBrowser)/i);
      const osMatch = ua.match(/(Windows|Mac|Linux|Android|iOS|iPhone|iPad)/i);
      const browser = browserMatch ? browserMatch[1].toLowerCase() : 'unknown';
      const os = osMatch ? osMatch[1].toLowerCase() : 'unknown';
      return `${browser}:${os}`;
    };

    const sessionUANormalized = normalizeUserAgent(session.userAgent);
    const requestUANormalized = normalizeUserAgent(userAgent);

    // Если основная часть User-Agent не совпадает - это подозрительно
    if (sessionUANormalized !== requestUANormalized) {
      // Логируем, но не уничтожаем сессию сразу - может быть легитимное изменение
      logger.warn('User-Agent mismatch detected', {
        sessionId: sessionId.substring(0, 8) + '...',
        sessionUA: session.userAgent.substring(0, 50),
        requestUA: userAgent.substring(0, 50),
        sessionNormalized: sessionUANormalized,
        requestNormalized: requestUANormalized
      });
      // Обновляем User-Agent в сессии на новый (адаптируемся к изменениям)
      session.userAgent = userAgent;
    }

    // IP validation - flexible by default, strict if requested
    if (options.strictIP) {
      if (session.ipAddress !== ipAddress) {
        this.destroySession(sessionId);
        return { valid: false, reason: 'IP address mismatch' };
      }
    } else {
      // Flexible IP validation - check first 3 octets (subnet)
      // This allows for IP changes within the same network
      const normalizeIP = (ip: string): string => {
        // Handle IPv4
        if (ip.includes('.')) {
          const parts = ip.split('.');
          if (parts.length >= 3) {
            return parts.slice(0, 3).join('.');
          }
        }
        // Handle IPv6 - use first 64 bits (first 4 groups)
        if (ip.includes(':')) {
          const parts = ip.split(':');
          if (parts.length >= 4) {
            return parts.slice(0, 4).join(':');
          }
        }
        return ip;
      };

      const sessionIPPrefix = normalizeIP(session.ipAddress);
      const requestIPPrefix = normalizeIP(ipAddress);

      if (sessionIPPrefix !== requestIPPrefix) {
        // Log warning but don't block - IP can change legitimately
        // This is logged for monitoring suspicious activity
        return { valid: true, reason: 'IP prefix mismatch (logged)' };
      }
    }

    if (options.updateCookie) {
    }

    return { valid: true };
  }

  /**
   * Обновить cookie сессии (продлить время жизни)
   */
  static async refreshSessionCookie(
    sessionId: string,
    isLocalhost: boolean = false,
    cookieName = 'session_id'
  ): Promise<void> {
    // Проверяем, что сессия существует и не истекла
    const session = this.getSession(sessionId);
    if (!session) {
      return; // Сессия не существует или истекла
    }

    // Обновляем cookie с новым maxAge
    await this.setSessionCookie(sessionId, isLocalhost, cookieName);
  }

  static cleanup(): void {
    if (sessionCleanupInterval) {
      clearInterval(sessionCleanupInterval);
      sessionCleanupInterval = null;
    }
  }
}



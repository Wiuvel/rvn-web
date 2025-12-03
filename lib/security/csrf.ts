import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { getEnv } from '../validation/env-validation';

// Get CSRF secret from validated env (will throw if not set or invalid)
function getCSRFSecret(): string {
  try {
    return getEnv().CSRF_SECRET;
  } catch {
    // Fallback only for development/testing
    if (process.env.NODE_ENV === 'development') {
      return 'default-csrf-secret-change-in-production-dev-only';
    }
    throw new Error('CSRF_SECRET must be configured in production');
  }
}

const CSRF_TOKEN_LIFETIME = 60 * 60 * 1000; // 1 hour

interface CSRFStore {
  [sessionId: string]: {
    token: string;
    createdAt: number;
  };
}

const csrfStore: CSRFStore = {};

// Оптимизированная структура для отслеживания времени истечения
const csrfExpirationTimes = new Map<string, number>();

// Cleanup expired tokens (оптимизированная версия)
let csrfCleanupInterval: NodeJS.Timeout | null = null;

function startCSRFCleanup() {
  if (csrfCleanupInterval) return;
  
  csrfCleanupInterval = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    // Проходим только по ключам, которые точно истекли
    csrfExpirationTimes.forEach((expirationTime, sessionId) => {
      if (expirationTime < now) {
        keysToDelete.push(sessionId);
      }
    });
    
    // Удаляем истекшие записи
    keysToDelete.forEach(sessionId => {
      delete csrfStore[sessionId];
      csrfExpirationTimes.delete(sessionId);
    });
  }, 5 * 60 * 1000); // Cleanup every 5 minutes
}

// Запускаем очистку при первом импорте
startCSRFCleanup();

export function generateCSRFToken(sessionId: string): string {
  const timestamp = Date.now().toString();
  const nonce = randomBytes(16).toString('hex');
  const data = `${sessionId}-${timestamp}-${nonce}`;
  const signature = createHmac('sha256', getCSRFSecret())
    .update(data)
    .digest('hex');
  
  const token = `${data}-${signature}`;
  
  // Store token for validation
  // Если для этого sessionId уже есть токен, перезаписываем его
  const createdAt = Date.now();
  csrfStore[sessionId] = {
    token,
    createdAt
  };
  csrfExpirationTimes.set(sessionId, createdAt + CSRF_TOKEN_LIFETIME);
  
  return token;
}

// Функция для получения информации о токене (для отладки)
export function getCSRFTokenInfo(sessionId: string): { exists: boolean; token?: string; createdAt?: number } {
  const stored = csrfStore[sessionId];
  if (!stored) {
    return { exists: false };
  }
  return {
    exists: true,
    token: stored.token,
    createdAt: stored.createdAt
  };
}

// Overload для обратной совместимости
export function verifyCSRFToken(token: string, sessionId: string): boolean;
export function verifyCSRFToken(token: string, sessionId: string, detailed: true): { valid: boolean; reason?: string };
export function verifyCSRFToken(token: string, sessionId: string, detailed?: boolean): boolean | { valid: boolean; reason?: string } {
  try {
    if (!token || !sessionId) {
      if (detailed) return { valid: false, reason: 'Missing token or sessionId' };
      return false;
    }
    
    const parts = token.split('-');
    if (parts.length < 4) {
      if (detailed) return { valid: false, reason: 'Invalid token format' };
      return false;
    }
    
    const signature = parts.pop();
    const nonce = parts.pop();
    const timestamp = parts.pop();
    const tokenSessionId = parts.join('-');
    
    // Check session ID matches
    if (tokenSessionId !== sessionId) {
      if (detailed) return { valid: false, reason: 'Session ID mismatch' };
      return false;
    }
    
    // Check token is not older than 1 hour (проверяем timestamp без использования хранилища)
    const tokenTime = parseInt(timestamp || '0');
    if (isNaN(tokenTime)) {
      if (detailed) return { valid: false, reason: 'Invalid timestamp' };
      return false;
    }
    
    const now = Date.now();
    if (now - tokenTime > CSRF_TOKEN_LIFETIME) {
      if (detailed) return { valid: false, reason: 'Token expired' };
      return false;
    }
    
    // Verify signature (это основная проверка безопасности)
    const data = `${tokenSessionId}-${timestamp}-${nonce}`;
    const expectedSignature = createHmac('sha256', getCSRFSecret())
      .update(data)
      .digest('hex');
    
    // Use timing-safe comparison
    const signatureBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      if (detailed) return { valid: false, reason: 'Signature length mismatch' };
      return false;
    }
    
    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);
    
    // Опционально: проверяем хранилище для дополнительной безопасности (но не блокируем если его нет)
    // Это помогает предотвратить повторное использование токена, но не критично
    if (isValid) {
      const storedToken = csrfStore[sessionId];
      if (storedToken && storedToken.token !== token) {
        // Токен был использован ранее - это подозрительно
        if (detailed) return { valid: false, reason: 'Token already used' };
        return false;
      }
      // Сохраняем токен в хранилище для предотвращения повторного использования
      const createdAt = Date.now();
      csrfStore[sessionId] = {
        token,
        createdAt
      };
      csrfExpirationTimes.set(sessionId, createdAt + CSRF_TOKEN_LIFETIME);
    }
    
    if (detailed) {
      return { valid: isValid, reason: isValid ? undefined : 'Invalid signature' };
    }
    
    return isValid;
  } catch (error) {
    if (detailed) {
      return { valid: false, reason: `Error: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
    return false;
  }
}

/**
 * Реэкспорт для обратной совместимости
 * @deprecated Используйте generateSessionId из lib/utils напрямую
 */
export { generateSessionId } from '../utils/index';

export function revokeCSRFToken(sessionId: string): void {
  delete csrfStore[sessionId];
  csrfExpirationTimes.delete(sessionId);
}

/**
 * Очищает интервал очистки (для тестирования или graceful shutdown)
 */
export function cleanupCSRF(): void {
  if (csrfCleanupInterval) {
    clearInterval(csrfCleanupInterval);
    csrfCleanupInterval = null;
  }
}

// Экспортируем функцию для получения размера хранилища (для отладки)
export function getCSRFStoreSize(): number {
  return Object.keys(csrfStore).length;
}


/**
 * Централизованные типы ошибок авторизации
 */

export enum AuthErrorCode {
  NOT_AUTHENTICATED = 'NOT_AUTHENTICATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_VERSION_MISMATCH = 'TOKEN_VERSION_MISMATCH',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_INACTIVE = 'USER_INACTIVE',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Создание ошибки авторизации
 */
export function createAuthError(
  code: AuthErrorCode,
  message: string,
  details?: Record<string, unknown>
): AuthError {
  return {
    code,
    message,
    details
  };
}

/**
 * Проверка, является ли ошибка ожидаемой (не требует логирования)
 */
export function isExpectedAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('expired') ||
           message.includes('invalid') ||
           message.includes('not authenticated') ||
           message.includes('no token') ||
           message.includes('malformed') ||
           message.includes('signature');
  }
  return false;
}


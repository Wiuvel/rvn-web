/**
 * Централизованный сервис авторизации
 * Объединяет все функции авторизации для единообразного использования
 */
import { NextRequest } from 'next/server';
import { verifyAuth, type UnifiedAuthResult } from './auth-unified';
import { verifyJwtAuth, type JwtAuthResult } from './auth-jwt';
import { getUserById } from './auth';
import { hasUserRole, getUserRoles, type UserRole } from './user-roles';
import { logger } from './secure-logger';

/**
 * Расширенный результат авторизации с ролями
 */
export interface AuthResult extends UnifiedAuthResult {
  roles?: UserRole[];
  isSupport?: boolean;
  isAdmin?: boolean;
}

/**
 * Опции для проверки авторизации
 */
export interface AuthCheckOptions {
  requireAuth?: boolean;
  requireRoles?: UserRole[];
  checkActive?: boolean;
}

/**
 * Централизованный сервис авторизации
 */
export class AuthService {
  /**
   * Проверка авторизации с дополнительными проверками
   */
  static async checkAuth(
    request: NextRequest,
    options: AuthCheckOptions = {}
  ): Promise<{ result: AuthResult; error?: string }> {
    try {
      const { requireAuth = false, requireRoles = [], checkActive = true } = options;

      // Проверяем авторизацию
      const authResult = await verifyAuth(request);

      if (!authResult.isAuthenticated || !authResult.user) {
        if (requireAuth) {
          return {
            result: authResult,
            error: 'Authentication required'
          };
        }
        return { result: authResult };
      }

      // Проверяем активность пользователя (если требуется)
      if (checkActive) {
        const user = await getUserById(authResult.user.id);
        if (!user || !user.is_active) {
          logger.warn('Inactive user attempted access', {
            userId: authResult.user.id,
            ip: request.headers.get('x-forwarded-for')
          });
          return {
            result: {
              ...authResult,
              isAuthenticated: false,
              error: 'Account is disabled'
            },
            error: 'Account is disabled'
          };
        }
      }

      // Получаем роли пользователя
      let roles: UserRole[] = [];
      let isSupport = false;
      let isAdmin = false;

      try {
        roles = await getUserRoles(authResult.user.id);
        isSupport = roles.includes('support');
        isAdmin = roles.includes('admin');
      } catch (error) {
        logger.warn('Error fetching user roles', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: authResult.user.id
        });
        // Продолжаем с базовой ролью 'user'
        roles = ['user'];
      }

      // Проверяем требуемые роли
      if (requireRoles.length > 0) {
        const hasRequiredRole = requireRoles.some(role => roles.includes(role));
        if (!hasRequiredRole) {
          logger.warn('User attempted access without required role', {
            userId: authResult.user.id,
            userRoles: roles,
            requiredRoles: requireRoles,
            ip: request.headers.get('x-forwarded-for')
          });
          return {
            result: {
              ...authResult,
              isAuthenticated: false,
              error: 'Insufficient permissions'
            },
            error: 'Insufficient permissions'
          };
        }
      }

      return {
        result: {
          ...authResult,
          roles,
          isSupport,
          isAdmin
        }
      };
    } catch (error) {
      logger.error('Error in AuthService.checkAuth', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.headers.get('x-forwarded-for')
      });
      return {
        result: {
          isAuthenticated: false,
          method: null,
          error: 'Internal error'
        },
        error: 'Internal error'
      };
    }
  }

  /**
   * Проверка JWT авторизации (для API endpoints)
   */
  static async checkJwtAuth(
    request: NextRequest,
    options: AuthCheckOptions = {}
  ): Promise<{ result: JwtAuthResult; error?: string }> {
    try {
      const { requireAuth = false, requireRoles = [], checkActive = true } = options;

      // Проверяем JWT авторизацию
      const jwtResult = await verifyJwtAuth(request);

      if (!jwtResult.isAuthenticated || !jwtResult.user) {
        if (requireAuth) {
          return {
            result: jwtResult,
            error: 'Authentication required'
          };
        }
        return { result: jwtResult };
      }

      // Проверяем активность пользователя (если требуется)
      if (checkActive) {
        const user = await getUserById(jwtResult.user.id);
        if (!user || !user.is_active) {
          logger.warn('Inactive user attempted access', {
            userId: jwtResult.user.id,
            ip: request.headers.get('x-forwarded-for')
          });
          return {
            result: {
              ...jwtResult,
              isAuthenticated: false,
              error: 'Account is disabled'
            },
            error: 'Account is disabled'
          };
        }
      }

      // Проверяем требуемые роли
      if (requireRoles.length > 0) {
        const hasRequiredRole = await Promise.all(
          requireRoles.map(role => hasUserRole(jwtResult.user!.id, role))
        ).then(results => results.some(r => r));

        if (!hasRequiredRole) {
          logger.warn('User attempted access without required role', {
            userId: jwtResult.user.id,
            requiredRoles: requireRoles,
            ip: request.headers.get('x-forwarded-for')
          });
          return {
            result: {
              ...jwtResult,
              isAuthenticated: false,
              error: 'Insufficient permissions'
            },
            error: 'Insufficient permissions'
          };
        }
      }

      return { result: jwtResult };
    } catch (error) {
      logger.error('Error in AuthService.checkJwtAuth', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.headers.get('x-forwarded-for')
      });
      return {
        result: {
          isAuthenticated: false,
          error: 'Internal error'
        },
        error: 'Internal error'
      };
    }
  }

  /**
   * Проверка подозрительной активности
   */
  static async checkSuspiciousActivity(
    request: NextRequest,
    userId: string,
    expectedIp?: string,
    expectedUserAgent?: string
  ): Promise<{ suspicious: boolean; reason?: string }> {
    try {
      const currentIp = request.headers.get('x-forwarded-for') || 'unknown';
      const currentUserAgent = request.headers.get('user-agent') || 'unknown';

      // Проверяем изменение IP
      if (expectedIp && expectedIp !== 'unknown' && currentIp !== 'unknown' && currentIp !== expectedIp) {
        logger.warn('Suspicious activity: IP change detected', {
          userId,
          oldIp: expectedIp,
          newIp: currentIp
        });
        return {
          suspicious: true,
          reason: 'IP address changed'
        };
      }

      // Проверяем изменение User-Agent
      if (expectedUserAgent && expectedUserAgent !== 'unknown' && currentUserAgent !== expectedUserAgent) {
        logger.warn('Suspicious activity: User-Agent change detected', {
          userId,
          oldUserAgent: expectedUserAgent,
          newUserAgent: currentUserAgent
        });
        return {
          suspicious: true,
          reason: 'User-Agent changed'
        };
      }

      return { suspicious: false };
    } catch (error) {
      logger.error('Error checking suspicious activity', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });
      // В случае ошибки не блокируем доступ
      return { suspicious: false };
    }
  }
}


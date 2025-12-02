/**
 * Универсальная система авторизации
 * Поддерживает JWT и старую cookie-based авторизацию (обратная совместимость)
 */
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifyJwtAuth } from './auth-jwt';
import { getUserByToken } from './auth';
import { logger } from './secure-logger';

export interface UnifiedAuthResult {
  isAuthenticated: boolean;
  user?: {
    id: string;
    user_id: string;
    username: string;
    dashboard_token: string;
    created_at: string;
    last_login?: string;
    avatar_gradient?: string | null;
  };
  method: 'jwt' | 'cookie' | null;
  error?: string;
}

/**
 * Универсальная проверка авторизации
 * Сначала пробует JWT, затем fallback на cookie-based
 */
export async function verifyAuth(request: NextRequest): Promise<UnifiedAuthResult> {
  try {
    // Пробуем JWT авторизацию сначала
    const jwtAuth = await verifyJwtAuth(request);
    
    if (jwtAuth.isAuthenticated && jwtAuth.user) {
      return {
        isAuthenticated: true,
        user: jwtAuth.user,
        method: 'jwt'
      };
    }

    // Fallback на старую cookie-based авторизацию
    const cookieStore = await cookies();
    const dashboardToken = cookieStore.get('dashboard_token')?.value;
    const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';

    if (!isAuthenticated || !dashboardToken) {
      return {
        isAuthenticated: false,
        method: null,
        error: 'Not authenticated'
      };
    }

    const user = await getUserByToken(dashboardToken);
    
    if (!user) {
      return {
        isAuthenticated: false,
        method: null,
        error: 'User not found'
      };
    }

    return {
      isAuthenticated: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        dashboard_token: user.dashboard_token,
        created_at: user.created_at,
        last_login: user.last_login,
        avatar_gradient: user.avatar_gradient,
      },
      method: 'cookie'
    };
  } catch (error) {
    logger.error('Error verifying auth', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: request.headers.get('x-forwarded-for')
    });
    return {
      isAuthenticated: false,
      method: null,
      error: 'Internal error'
    };
  }
}


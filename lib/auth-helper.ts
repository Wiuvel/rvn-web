/**
 * Вспомогательные функции для авторизации
 * Используются в withApiHandler для устранения дублирования кода
 */

import { cookies } from 'next/headers';
import { getUserByToken } from './auth';
import { hasUserRole } from './user-roles';
import { ERROR_NOT_AUTHENTICATED } from './constants';

export interface AuthResult {
  isAuthenticated: boolean;
  user: Awaited<ReturnType<typeof getUserByToken>> | null;
  error?: string;
}

/**
 * Проверяет авторизацию пользователя
 */
export async function checkAuth(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
  const dashboardToken = cookieStore.get('dashboard_token')?.value;

  if (!isAuthenticated || !dashboardToken) {
    return {
      isAuthenticated: false,
      user: null,
      error: ERROR_NOT_AUTHENTICATED
    };
  }

  const user = await getUserByToken(dashboardToken);
  if (!user) {
    return {
      isAuthenticated: false,
      user: null,
      error: ERROR_NOT_AUTHENTICATED
    };
  }

  return {
    isAuthenticated: true,
    user
  };
}

/**
 * Проверяет, имеет ли пользователь роль поддержки
 */
export async function checkSupportAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'support');
}

/**
 * Проверяет, имеет ли пользователь роль админа
 */
export async function checkAdminAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'admin');
}



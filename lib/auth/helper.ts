// Auth helper functions for API handlers

import { cookies } from 'next/headers';
import { getUserByToken, getUserById, type User } from './index';
import { hasUserRole } from './user-roles';
import { ERROR_NOT_AUTHENTICATED } from '../utils/constants';
import { SessionManager } from './session-manager';
import { createUserDataCookie, USER_DATA_COOKIE_NAME, getUserDataCookieOptions } from './user-cookie.server';

export interface AuthResult {
  isAuthenticated: boolean;
  user: User | null;
  error?: string;
}

/**
 * Устанавливает user_data cookie (HMAC-signed JSON для быстрого UI).
 */
export async function setUserDataCookie(user: User, isLocalhost: boolean): Promise<void> {
  const isAdmin = await hasUserRole(user.id, 'admin');
  const isSupport = await hasUserRole(user.id, 'support');
  
  const payload = {
    user_id: user.user_id,
    username: user.username,
    avatar: user.avatar ?? null,
    banner: user.banner ?? null,
    pex: (isAdmin ? 'a' : isSupport ? 's' : 'u') as 'u' | 's' | 'a',
  };
  const value = createUserDataCookie(payload);
  const opts = getUserDataCookieOptions(isLocalhost);
  const cookieStore = await cookies();
  cookieStore.set(USER_DATA_COOKIE_NAME, value, opts);
}

/**
 * checkAuth: Session + Token binding с refresh flow.
 * Cookies: session_id (httpOnly), token (httpOnly).
 * При истекшей сессии и валидном token — создаём новую сессию (refresh).
 */
export async function checkAuth(request?: { headers: Headers }): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  const sessionId = cookieStore.get('session_id')?.value;

  if (!token) {
    return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
  }

  if (!sessionId) {
    // Refresh flow: token есть, сессии нет — создаём сессию
    const user = await getUserByToken(token);
    if (!user) {
      return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
    }
    if (!request) {
      return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
    }
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const newSessionId = await SessionManager.createSession(
      user.id,
      user.username,
      ipAddress,
      userAgent,
      token
    );
    const host = request.headers.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    await SessionManager.setSessionCookie(newSessionId, isLocalhost);
    return { isAuthenticated: true, user };
  }

  if (!request) {
    return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
  }

  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const validation = await SessionManager.validateSession(sessionId, token, ipAddress, userAgent);

  if (!validation.valid) {
    return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
  }

  const user = await getUserByToken(token);
  if (!user) {
    return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
  }

  const session = await SessionManager.getSession(sessionId);
  if (!session || session.userId !== user.id) {
    return { isAuthenticated: false, user: null, error: ERROR_NOT_AUTHENTICATED };
  }

  return { isAuthenticated: true, user };
}

export async function checkSupportAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'support');
}

export async function checkAdminAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'admin');
}

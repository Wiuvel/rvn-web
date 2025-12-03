// Auth helper functions for API handlers

import { cookies } from 'next/headers';
import { getUserByToken } from './index';
import { hasUserRole } from './user-roles';
import { ERROR_NOT_AUTHENTICATED } from '../utils/constants';
import { SessionManager } from './session-manager';
import { logger } from '../utils/secure-logger';

export interface AuthResult {
  isAuthenticated: boolean;
  user: Awaited<ReturnType<typeof getUserByToken>> | null;
  error?: string;
}

// Check user authentication with session validation
export async function checkAuth(request?: { headers: Headers }): Promise<AuthResult> {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get('user_authenticated')?.value === 'true';
  const dashboardToken = cookieStore.get('dashboard_token')?.value;
  const sessionId = cookieStore.get('session_id')?.value;

  // Validate session if exists and request is provided
  if (sessionId && request) {
    const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const validation = SessionManager.validateSession(sessionId, ipAddress, userAgent);
    
    if (!validation.valid) {
      logger.warn('INVALID SESSION IN CHECKAUTH', {
        sessionId: sessionId.substring(0, 8) + '...',
        reason: validation.reason,
        ip: ipAddress
      });
      return {
        isAuthenticated: false,
        user: null,
        error: ERROR_NOT_AUTHENTICATED
      };
    }
  }

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

// Check if user has support role
export async function checkSupportAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'support');
}

// Check if user has admin role
export async function checkAdminAccess(userId: string): Promise<boolean> {
  return hasUserRole(userId, 'admin');
}




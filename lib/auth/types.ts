/**
 * Типы для системы авторизации
 */

import type { JWTPayload } from 'jose';

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  user_id: string;
  username: string;
  password_hash: string;
  avatar_gradient?: string | null;
  dashboard_token: string;
  is_active: boolean;
  token_version: number;
  last_login?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPublic {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  avatar_gradient?: string | null;
  created_at: string;
  last_login?: string | null;
}

export type UserRole = 'user' | 'support' | 'admin';

// ============================================================================
// JWT Types
// ============================================================================

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // user.id (стандартное поле JWT)
  type: 'access';
  username: string;
  user_id: string; // публичный ID
  ver: number; // token version для инвалидации
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string; // user.id
  type: 'refresh';
  ver: number; // token version
  jti: string; // уникальный ID токена
}

// ============================================================================
// Session/Token Storage Types
// ============================================================================

export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  token_hash: string;
  jti: string;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

// ============================================================================
// Auth Result Types
// ============================================================================

export interface AuthResult {
  success: true;
  user: UserPublic;
  roles: UserRole[];
}

export interface AuthError {
  success: false;
  code: AuthErrorCode;
  message: string;
}

export type AuthResponse = AuthResult | AuthError;

export type AuthErrorCode =
  | 'NO_TOKEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

// ============================================================================
// Cookie Configuration
// ============================================================================

export interface CookieConfig {
  name: string;
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
}

export const ACCESS_TOKEN_COOKIE: Omit<CookieConfig, 'secure'> = {
  name: 'access_token',
  maxAge: 10 * 60, // 10 минут
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
};

export const REFRESH_TOKEN_COOKIE: Omit<CookieConfig, 'secure'> = {
  name: 'refresh_token',
  maxAge: 60 * 60 * 24 * 60, // 60 дней
  httpOnly: true,
  sameSite: 'strict',
  path: '/',
};

// ============================================================================
// JWT Configuration
// ============================================================================

export const JWT_CONFIG = {
  accessToken: {
    expiresIn: '10m',
    algorithm: 'HS256' as const,
  },
  refreshToken: {
    expiresIn: '60d',
    algorithm: 'HS256' as const,
  },
  issuer: 'rvn.market',
  audience: 'rvn.market',
} as const;


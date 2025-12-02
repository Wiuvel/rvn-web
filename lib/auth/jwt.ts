/**
 * JWT операции: генерация и верификация токенов
 */

import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { randomBytes } from 'crypto';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  UserPublic,
} from './types';
import { JWT_CONFIG } from './types';

// ============================================================================
// Secret Key Management
// ============================================================================

let cachedSecretKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (cachedSecretKey) {
    return cachedSecretKey;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  cachedSecretKey = new TextEncoder().encode(secret);
  return cachedSecretKey;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Генерирует уникальный JTI для refresh токена
 */
export function generateJti(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Генерирует Access Token
 */
export async function generateAccessToken(
  user: Pick<UserPublic, 'id' | 'username' | 'user_id'>,
  tokenVersion: number
): Promise<string> {
  const secretKey = getSecretKey();

  const token = await new SignJWT({
    type: 'access',
    username: user.username,
    user_id: user.user_id,
    ver: tokenVersion,
  } satisfies Omit<AccessTokenPayload, 'sub' | 'iat' | 'exp' | 'iss' | 'aud'>)
    .setProtectedHeader({ alg: JWT_CONFIG.accessToken.algorithm })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(JWT_CONFIG.accessToken.expiresIn)
    .setIssuer(JWT_CONFIG.issuer)
    .setAudience(JWT_CONFIG.audience)
    .sign(secretKey);

  return token;
}

/**
 * Генерирует Refresh Token
 */
export async function generateRefreshToken(
  userId: string,
  tokenVersion: number,
  jti?: string
): Promise<{ token: string; jti: string }> {
  const secretKey = getSecretKey();
  const tokenJti = jti || generateJti();

  const token = await new SignJWT({
    type: 'refresh',
    ver: tokenVersion,
    jti: tokenJti,
  } satisfies Omit<RefreshTokenPayload, 'sub' | 'iat' | 'exp' | 'iss' | 'aud'>)
    .setProtectedHeader({ alg: JWT_CONFIG.refreshToken.algorithm })
    .setSubject(userId)
    .setJti(tokenJti)
    .setIssuedAt()
    .setExpirationTime(JWT_CONFIG.refreshToken.expiresIn)
    .setIssuer(JWT_CONFIG.issuer)
    .setAudience(JWT_CONFIG.audience)
    .sign(secretKey);

  return { token, jti: tokenJti };
}

// ============================================================================
// Token Verification
// ============================================================================

export interface VerifyAccessTokenResult {
  valid: true;
  payload: AccessTokenPayload;
}

export interface VerifyAccessTokenError {
  valid: false;
  expired: boolean;
  error: string;
}

export type VerifyAccessTokenResponse = VerifyAccessTokenResult | VerifyAccessTokenError;

/**
 * Верифицирует Access Token
 */
export async function verifyAccessToken(token: string): Promise<VerifyAccessTokenResponse> {
  try {
    const secretKey = getSecretKey();

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    });

    // Проверяем тип токена
    if (payload.type !== 'access') {
      return { valid: false, expired: false, error: 'Invalid token type' };
    }

    // Проверяем обязательные поля
    if (!payload.sub || !payload.username || !payload.user_id) {
      return { valid: false, expired: false, error: 'Invalid token payload' };
    }

    return {
      valid: true,
      payload: payload as AccessTokenPayload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const expired = message.includes('expired') || message.includes('exp');

    return { valid: false, expired, error: message };
  }
}

export interface VerifyRefreshTokenResult {
  valid: true;
  payload: RefreshTokenPayload;
}

export interface VerifyRefreshTokenError {
  valid: false;
  expired: boolean;
  error: string;
}

export type VerifyRefreshTokenResponse = VerifyRefreshTokenResult | VerifyRefreshTokenError;

/**
 * Верифицирует Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<VerifyRefreshTokenResponse> {
  try {
    const secretKey = getSecretKey();

    const { payload } = await jwtVerify(token, secretKey, {
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
    });

    // Проверяем тип токена
    if (payload.type !== 'refresh') {
      return { valid: false, expired: false, error: 'Invalid token type' };
    }

    // Проверяем обязательные поля
    if (!payload.sub || !payload.jti) {
      return { valid: false, expired: false, error: 'Invalid token payload' };
    }

    return {
      valid: true,
      payload: payload as RefreshTokenPayload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const expired = message.includes('expired') || message.includes('exp');

    return { valid: false, expired, error: message };
  }
}

// ============================================================================
// Token Utilities
// ============================================================================

/**
 * Декодирует токен без верификации (только для чтения payload)
 */
export function decodeToken(token: string): { sub?: string; exp?: number; type?: string } | null {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

/**
 * Проверяет, истек ли токен (без верификации подписи)
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return true;

  const now = Math.floor(Date.now() / 1000);
  return decoded.exp < now;
}

/**
 * Получает время до истечения токена в секундах
 */
export function getTokenTTL(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return null;

  const now = Math.floor(Date.now() / 1000);
  const ttl = decoded.exp - now;

  return ttl > 0 ? ttl : null;
}


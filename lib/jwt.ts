/**
 * JWT Dual-Token Strategy: Access + Refresh Tokens
 * 
 * Access Token - короткоживущий токен (10 минут) для авторизации запросов
 * Refresh Token - долгоживущий токен (60 дней) для обновления access token
 * Refresh токены хранятся в базе данных для возможности отзыва
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { appConfig } from './config';
import { logger } from './secure-logger';

// Секретный ключ для подписи токенов
const getSecretKey = () => {
  const secret = appConfig.jwt.secret;
  if (!secret || secret === 'change-me-in-production') {
    logger.warn('JWT_SECRET not set or using default value. This is insecure in production!');
  }
  return new TextEncoder().encode(secret);
};

/**
 * Payload для Access Token
 */
export interface AccessTokenPayload extends JWTPayload {
  userId: string;
  username: string;
  user_id: string; // Публичный ID пользователя
  type: 'access';
}

/**
 * Payload для Refresh Token
 */
export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  tokenVersion?: number; // Для инвалидации токенов при смене пароля
  type: 'refresh';
}

/**
 * Генерация Access Token
 */
export async function generateAccessToken(payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
  try {
    const secretKey = getSecretKey();
    
    const token = await new SignJWT({
      ...payload,
      type: 'access'
    } as AccessTokenPayload)
      .setProtectedHeader({ alg: appConfig.jwt.accessToken.algorithm })
      .setIssuedAt()
      .setExpirationTime(appConfig.jwt.accessToken.expiresIn)
      .setIssuer(appConfig.jwt.issuer)
      .setAudience(appConfig.jwt.audience)
      .sign(secretKey);

    return token;
  } catch (error) {
    logger.error('Error generating access token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: payload.userId
    });
    throw new Error('Failed to generate access token');
  }
}

/**
 * Генерация Refresh Token
 */
export async function generateRefreshToken(payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
  try {
    const secretKey = getSecretKey();
    
    const token = await new SignJWT({
      ...payload,
      type: 'refresh'
    } as RefreshTokenPayload)
      .setProtectedHeader({ alg: appConfig.jwt.refreshToken.algorithm })
      .setIssuedAt()
      .setExpirationTime(appConfig.jwt.refreshToken.expiresIn)
      .setIssuer(appConfig.jwt.issuer)
      .setAudience(appConfig.jwt.audience)
      .sign(secretKey);

    return token;
  } catch (error) {
    logger.error('Error generating refresh token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: payload.userId
    });
    throw new Error('Failed to generate refresh token');
  }
}

/**
 * Верификация Access Token
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const secretKey = getSecretKey();
    
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: appConfig.jwt.issuer,
      audience: appConfig.jwt.audience,
    });

    // Проверяем тип токена
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return payload as AccessTokenPayload;
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      throw new Error('Token expired');
    }
    throw new Error('Invalid token');
  }
}

/**
 * Верификация Refresh Token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const secretKey = getSecretKey();
    
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: appConfig.jwt.issuer,
      audience: appConfig.jwt.audience,
    });

    // Проверяем тип токена
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return payload as RefreshTokenPayload;
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      throw new Error('Token expired');
    }
    throw new Error('Invalid token');
  }
}

/**
 * Декодирование JWT без верификации (для проверки времени истечения на клиенте)
 * ВНИМАНИЕ: Не используйте для проверки валидности токена, только для чтения payload
 */
export function decodeJwtWithoutVerification(token: string): { payload: JWTPayload; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Декодируем payload (вторая часть токена)
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    ) as JWTPayload;

    return {
      payload,
      exp: payload.exp
    };
  } catch (error) {
    return null;
  }
}

/**
 * Проверка времени до истечения токена (в секундах)
 * Возвращает количество секунд до истечения или null если токен истек/невалиден
 */
export function getTokenExpirationTime(token: string): number | null {
  const decoded = decodeJwtWithoutVerification(token);
  if (!decoded || !decoded.exp) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = decoded.exp - now;

  return expiresIn > 0 ? expiresIn : null;
}

/**
 * Извлечение токена из заголовка Authorization
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Извлечение токена из cookies
 */
export function extractTokenFromCookies(cookies: { get: (name: string) => { value: string } | undefined }): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const accessToken = cookies.get('access_token')?.value || null;
  const refreshToken = cookies.get('refresh_token')?.value || null;
  
  return { accessToken, refreshToken };
}


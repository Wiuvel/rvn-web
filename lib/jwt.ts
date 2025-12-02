/**
 * JWT Dual-Token Strategy: Access + Refresh Tokens
 * 
 * Access Token - короткоживущий токен (10 минут) для авторизации запросов
 * Refresh Token - долгоживущий токен (60 дней) для обновления access token
 * Refresh токены хранятся в базе данных для возможности отзыва
 */
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { randomBytes } from 'crypto';
import { appConfig } from './config';
import { logger } from './secure-logger';

/**
 * Генерация уникального ID (совместимо с Edge Runtime)
 */
function generateJti(): string {
  return randomBytes(16).toString('hex');
}

// Секретный ключ для подписи токенов
// Секрет уже валидирован через env-validation при старте приложения
const getSecretKey = () => {
  const secret = appConfig.jwt.secret;
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
  jti?: string; // JWT ID для предотвращения replay атак
  tokenVersion?: number; // Версия токена для инвалидации при смене пароля
}

/**
 * Payload для Refresh Token
 */
export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  tokenVersion?: number; // Для инвалидации токенов при смене пароля
  type: 'refresh';
  jti?: string; // JWT ID для связи с записью в БД
}

/**
 * Генерация Access Token
 */
export async function generateAccessToken(
  payload: Omit<AccessTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
  options?: { jti?: string; tokenVersion?: number }
): Promise<string> {
  try {
    const secretKey = getSecretKey();
    
    // Генерируем уникальный JWT ID если не передан
    const jti = options?.jti || generateJti();
    
    const token = await new SignJWT({
      ...payload,
      type: 'access',
      jti,
      tokenVersion: options?.tokenVersion || 1
    } as AccessTokenPayload)
      .setProtectedHeader({ alg: appConfig.jwt.accessToken.algorithm })
      .setIssuedAt()
      .setExpirationTime(appConfig.jwt.accessToken.expiresIn)
      .setIssuer(appConfig.jwt.issuer)
      .setAudience(appConfig.jwt.audience)
      .setJti(jti)
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
export async function generateRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type' | 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
  options?: { jti?: string; tokenVersion?: number }
): Promise<string> {
  try {
    const secretKey = getSecretKey();
    
    // Генерируем уникальный JWT ID если не передан (для связи с записью в БД)
    const jti = options?.jti || generateJti();
    
    const token = await new SignJWT({
      ...payload,
      type: 'refresh',
      jti,
      tokenVersion: options?.tokenVersion || 1
    } as RefreshTokenPayload)
      .setProtectedHeader({ alg: appConfig.jwt.refreshToken.algorithm })
      .setIssuedAt()
      .setExpirationTime(appConfig.jwt.refreshToken.expiresIn)
      .setIssuer(appConfig.jwt.issuer)
      .setAudience(appConfig.jwt.audience)
      .setJti(jti)
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
export async function verifyAccessToken(
  token: string,
  options?: { checkTokenVersion?: number }
): Promise<AccessTokenPayload> {
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

    // Проверяем версию токена если указана
    if (options?.checkTokenVersion !== undefined) {
      const tokenVersion = (payload as AccessTokenPayload).tokenVersion || 1;
      if (tokenVersion !== options.checkTokenVersion) {
        throw new Error('Token version mismatch');
      }
    }

    // Проверяем наличие обязательных полей
    const accessPayload = payload as AccessTokenPayload;
    if (!accessPayload.userId || !accessPayload.username || !accessPayload.user_id) {
      throw new Error('Invalid token payload');
    }

    return accessPayload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        throw new Error('Token expired');
      }
      if (error.message.includes('version')) {
        throw new Error('Token version mismatch');
      }
      throw new Error(`Invalid token: ${error.message}`);
    }
    throw new Error('Invalid token');
  }
}

/**
 * Верификация Refresh Token
 */
export async function verifyRefreshToken(
  token: string,
  options?: { checkTokenVersion?: number }
): Promise<RefreshTokenPayload> {
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

    // Проверяем версию токена если указана
    if (options?.checkTokenVersion !== undefined) {
      const tokenVersion = (payload as RefreshTokenPayload).tokenVersion || 1;
      if (tokenVersion !== options.checkTokenVersion) {
        throw new Error('Token version mismatch');
      }
    }

    // Проверяем наличие обязательных полей
    const refreshPayload = payload as RefreshTokenPayload;
    if (!refreshPayload.userId) {
      throw new Error('Invalid token payload');
    }

    return refreshPayload;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        throw new Error('Token expired');
      }
      if (error.message.includes('version')) {
        throw new Error('Token version mismatch');
      }
      throw new Error(`Invalid token: ${error.message}`);
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
  } catch {
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


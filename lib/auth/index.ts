/**
 * Централизованный экспорт модуля авторизации
 */

// Types
export type {
  User,
  UserPublic,
  UserRole,
  AccessTokenPayload,
  RefreshTokenPayload,
  RefreshTokenRecord,
  AuthResult,
  AuthError,
  AuthResponse,
  AuthErrorCode,
  CookieConfig,
} from './types';

export {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  JWT_CONFIG,
} from './types';

// JWT
export {
  generateJti,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  isTokenExpired,
  getTokenTTL,
} from './jwt';

export type {
  VerifyAccessTokenResult,
  VerifyAccessTokenError,
  VerifyAccessTokenResponse,
  VerifyRefreshTokenResult,
  VerifyRefreshTokenError,
  VerifyRefreshTokenResponse,
} from './jwt';

// Token Storage
export {
  storeRefreshToken,
  verifyRefreshTokenInDB,
  revokeRefreshToken,
  revokeAllUserTokens,
  revokeTokenByJti,
  cleanupExpiredTokens,
} from './tokens';

// Password
export {
  hashPassword,
  verifyPassword,
} from './password';

// Users
export {
  generateUserId,
  generateDashboardToken,
  createUser,
  authenticateUser,
  getUserById,
  getActiveUserById,
  toPublicUser,
  incrementTokenVersion,
  getUserRoles,
  hasRole,
} from './users';

// Cookies
export {
  isSecureCookie,
  setTokenCookies,
  setAccessTokenCookie,
  clearTokenCookies,
  getTokensFromCookies,
  extractTokensFromRequest,
} from './cookies';

// Verification
export {
  verifyAuth,
  verifyRefreshAuth,
  verifyAuthForMiddleware,
} from './verify';

export type {
  VerifyAuthOptions,
  RefreshAuthResult,
  RefreshAuthError,
  MiddlewareAuthResult,
} from './verify';


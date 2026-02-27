/**
 * Centralized OAuth error handling
 * All error messages are generic (no provider mentions) and concise
 */

export const POPUP_SPECIFIC_ERRORS = new Set(['popup_blocked', 'popup_closed', 'popup_timeout']);

export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Авторизация отменена',
  access_denied: 'Авторизация отменена',
  rate_limit: 'Превышен лимит запросов',
  rate_limit_exceeded: 'Превышен лимит запросов',
  oauth_not_configured: 'Сервис не настроен',
  oauth_init_error: 'Ошибка инициализации',
  invalid_state: 'Ошибка безопасности',
  invalid_request: 'Неверный запрос',
  invalid_hash: 'Ошибка проверки данных',
  auth_expired: 'Время авторизации истекло',
  token_exchange_failed: 'Ошибка обмена токена',
  no_access_token: 'Не получен токен доступа',
  user_info_failed: 'Ошибка получения данных',
  no_email: 'Почта не предоставлена',
  email_not_verified: 'Почта не подтверждена',
  user_creation_failed: 'Не удалось создать аккаунт',
  account_disabled: 'Аккаунт отключен',
  network_error: 'Ошибка подключения',
  connection_failed: 'Ошибка подключения',
  internal_error: 'Внутренняя ошибка',
  unknown_error: 'Неизвестная ошибка',
  telegram_incomplete_data: 'Неполные данные авторизации',
  telegram_init_failed: 'Ошибка инициализации',
  telegram_widget_load_failed: 'Ошибка загрузки',
  telegram_auth_failed: 'Ошибка авторизации',
  popup_blocked: 'Всплывающие окна заблокированы',
  popup_closed: 'Окно закрыто',
  popup_timeout: 'Превышено время ожидания',
  invalid_provider: 'Неизвестный провайдер',
};

export const GOOGLE_ERROR_MAP: Record<string, string> = {
  access_denied: 'oauth_denied',
  invalid_request: 'invalid_request',
  unauthorized_client: 'oauth_not_configured',
  unsupported_response_type: 'oauth_not_configured',
  invalid_scope: 'oauth_not_configured',
  server_error: 'internal_error',
  temporarily_unavailable: 'rate_limit',
};

export function getOAuthErrorMessage(errorCode: string | null | undefined): string {
  if (!errorCode) {
    return OAUTH_ERROR_MESSAGES['unknown_error'];
  }

  const mappedError = GOOGLE_ERROR_MAP[errorCode] || errorCode;

  return OAUTH_ERROR_MESSAGES[mappedError] || OAUTH_ERROR_MESSAGES['unknown_error'];
}

export function isPopupSpecificError(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false;
  return POPUP_SPECIFIC_ERRORS.has(errorCode);
}

export function getErrorRedirectUrl(errorCode: string, origin: string, isPopup: boolean): URL {
  const isPopupSpecific = isPopupSpecificError(errorCode);

  if (isPopupSpecific) {
    return new URL(`/auth?error=${encodeURIComponent(errorCode)}`, origin);
  }

  if (isPopup) {
    return new URL(`/auth/oauth-handler?error=${encodeURIComponent(errorCode)}&popup=true`, origin);
  }

  return new URL(`/auth?error=${encodeURIComponent(errorCode)}`, origin);
}

/**
 * Утилита для перевода ошибок API на русский язык
 */

import {
  ERROR_TOO_MANY_LOGIN_ATTEMPTS,
  ERROR_TOO_MANY_REGISTRATION_ATTEMPTS,
  ERROR_TOO_MANY_REQUESTS,
  ERROR_INVALID_REQUEST_DATA,
  ERROR_INVALID_USERNAME_FORMAT,
  ERROR_INVALID_PASSWORD_FORMAT,
  ERROR_INVALID_REQUEST,
  ERROR_INVALID_REQUEST_REFRESH,
  ERROR_INVALID_REQUEST_REFRESH_AGAIN,
  ERROR_AUTHENTICATION_FAILED,
  ERROR_INVALID_CREDENTIALS,
  ERROR_ACCOUNT_DISABLED,
  ERROR_PASSWORDS_DO_NOT_MATCH,
  ERROR_FAILED_TO_CREATE_ACCOUNT,
  ERROR_INTERNAL_SERVER_ERROR,
  ERROR_NOT_AUTHENTICATED,
  ERROR_USER_NOT_FOUND,
  ERROR_DATABASE_NOT_CONFIGURED,
  ERROR_DATABASE_ERROR,
  ERROR_UNEXPECTED,
  ERROR_DEFAULT,
  ERROR_TICKET_NOT_FOUND,
  ERROR_ACCESS_DENIED,
  ERROR_CANNOT_SEND_TO_CLOSED_TICKET,
  ERROR_MESSAGE_TOO_LONG,
  ERROR_SUBJECT_TOO_LONG,
  ERROR_MAXIMUM_TICKET_LIMIT_REACHED,
  ERROR_INVALID_STATUS_TRANSITION,
  ERROR_TICKET_NOT_ASSIGNED
} from './constants';

const errorTranslations: Record<string, string> = {
  // Общие ошибки (используем константы из lib/constants.ts)
  [ERROR_TOO_MANY_LOGIN_ATTEMPTS]: 'Слишком много попыток входа. Попробуйте позже.',
  [ERROR_TOO_MANY_REGISTRATION_ATTEMPTS]: 'Слишком много попыток регистрации. Попробуйте позже.',
  [ERROR_TOO_MANY_REQUESTS]: 'Слишком много запросов. Попробуйте позже.',
  [ERROR_INVALID_REQUEST_DATA]: 'Неверные данные запроса',
  [ERROR_INVALID_USERNAME_FORMAT]: 'Неверный формат логина',
  [ERROR_INVALID_PASSWORD_FORMAT]: 'Неверный формат пароля',
  [ERROR_INVALID_REQUEST]: 'Неверный запрос',
  [ERROR_INVALID_REQUEST_REFRESH]: 'Неверный запрос. Обновите страницу.',
  [ERROR_INVALID_REQUEST_REFRESH_AGAIN]: 'Неверный запрос. Обновите страницу и попробуйте снова.',
  [ERROR_AUTHENTICATION_FAILED]: 'Ошибка аутентификации',
  [ERROR_INVALID_CREDENTIALS]: 'Неверный логин или пароль',
  [ERROR_ACCOUNT_DISABLED]: 'Аккаунт заблокирован',
  [ERROR_PASSWORDS_DO_NOT_MATCH]: 'Пароли не совпадают',
  [ERROR_FAILED_TO_CREATE_ACCOUNT]: 'Не удалось создать аккаунт',
  [ERROR_INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
  [ERROR_NOT_AUTHENTICATED]: 'Не авторизован',
  [ERROR_USER_NOT_FOUND]: 'Пользователь не найден',
  [ERROR_DATABASE_NOT_CONFIGURED]: 'База данных не настроена',
  [ERROR_DATABASE_ERROR]: 'Ошибка базы данных',
  [ERROR_UNEXPECTED]: 'Неожиданная ошибка',
  
  // Support API Errors
  [ERROR_TICKET_NOT_FOUND]: 'Тикет не найден',
  [ERROR_ACCESS_DENIED]: 'Доступ запрещен',
  [ERROR_CANNOT_SEND_TO_CLOSED_TICKET]: 'Нельзя отправить сообщение в закрытый тикет',
  [ERROR_MESSAGE_TOO_LONG]: 'Сообщение слишком длинное',
  [ERROR_SUBJECT_TOO_LONG]: 'Тема слишком длинная',
  [ERROR_MAXIMUM_TICKET_LIMIT_REACHED]: 'Достигнут лимит тикетов',
  [ERROR_INVALID_STATUS_TRANSITION]: 'Недопустимый переход статуса',
  [ERROR_TICKET_NOT_ASSIGNED]: 'Тикет должен быть назначен вам для изменения статуса',
  
  // Ошибки валидации (из validation-schema.ts)
  'Username is required': 'Логин обязателен',
  'Username must be a string': 'Логин должен быть строкой',
  'Username must be at least 3 characters long': 'Логин должен содержать минимум 3 символа',
  'Username must be no more than 20 characters long': 'Логин должен содержать максимум 20 символов',
  'Username can only contain English letters and numbers': 'Логин может содержать только английские буквы и цифры',
  'Username contains invalid characters': 'Логин содержит недопустимые символы',
  'Password is required': 'Пароль обязателен',
  'Password must be a string': 'Пароль должен быть строкой',
  'Password must be at least 6 characters long': 'Пароль должен содержать минимум 6 символов',
  'Password must be no more than 50 characters long': 'Пароль должен содержать максимум 50 символов',
  'Password cannot contain spaces': 'Пароль не может содержать пробелы',
  'Password can only contain English letters, numbers and special characters': 'Пароль может содержать только английские буквы, цифры и специальные символы',
  // Примечание: 'Passwords do not match' уже переведен через ERROR_PASSWORDS_DO_NOT_MATCH выше
  
  // Ошибки из lib/auth.ts (уже на русском, но для полноты)
  'Пользователь с таким именем уже существует': 'Пользователь с таким именем уже существует',
  'Не удалось создать аккаунт': 'Не удалось создать аккаунт',
  'Непредвиденная ошибка': 'Непредвиденная ошибка',
  
  // Общие сообщения об ошибках
  'Ошибка загрузки тикетов': 'Ошибка загрузки тикетов',
  'Ошибка загрузки сообщений': 'Ошибка загрузки сообщений',
  'Ошибка отправки сообщения': 'Ошибка отправки сообщения',
  'Ошибка обновления статуса': 'Ошибка обновления статуса',
  'An error occurred': 'Произошла ошибка',
  'Ошибка регистрации': 'Ошибка регистрации',
  'Ошибка входа': 'Ошибка входа',
};

/**
 * Переводит сообщение об ошибке на русский язык
 * @param errorMessage - Сообщение об ошибке от API
 * @returns Переведенное сообщение или оригинальное, если перевод не найден
 */
export function translateError(errorMessage: string | undefined | null): string {
  if (!errorMessage) {
    return ERROR_DEFAULT;
  }

  // Убираем лишние пробелы
  const normalizedError = errorMessage.trim();
  
  // Прямой поиск
  if (errorTranslations[normalizedError]) {
    return errorTranslations[normalizedError];
  }

  // Поиск по частичному совпадению (для случаев, когда ошибка может содержать дополнительный текст)
  const lowerError = normalizedError.toLowerCase();
  for (const [key, translation] of Object.entries(errorTranslations)) {
    if (lowerError.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerError)) {
      return translation;
    }
  }

  // Если перевод не найден, возвращаем оригинальное сообщение
  return normalizedError;
}

/**
 * Переводит ошибки валидации на русский язык
 * @param error - Сообщение об ошибке валидации
 * @returns Переведенное сообщение или оригинальное, если перевод не найден
 * @deprecated Используйте translateError() вместо этой функции
 */
export function translateValidationError(error: string): string {
  return translateError(error);
}


/**
 * Утилита для перевода ошибок API на русский язык
 */

const errorTranslations: Record<string, string> = {
  // Общие ошибки
  'Too many login attempts. Please try again later.': 'Слишком много попыток входа. Попробуйте позже.',
  'Too many registration attempts. Please try again later.': 'Слишком много попыток регистрации. Попробуйте позже.',
  'Invalid request data': 'Неверные данные запроса',
  'Invalid username format': 'Неверный формат логина',
  'Invalid password format': 'Неверный формат пароля',
  'Invalid request': 'Неверный запрос',
  'Authentication failed': 'Ошибка аутентификации',
  'Invalid credentials': 'Неверный логин или пароль',
  'Account is disabled': 'Аккаунт заблокирован',
  'Passwords do not match': 'Пароли не совпадают',
  'Failed to create account': 'Не удалось создать аккаунт',
  'Internal server error': 'Внутренняя ошибка сервера',
  'Not authenticated': 'Не авторизован',
  'User not found': 'Пользователь не найден',
  'Database not configured': 'База данных не настроена',
  'Database ERROR': 'Ошибка базы данных',
  'Unexpected error': 'Неожиданная ошибка',
  
  // Ошибки из lib/auth.ts (уже на русском, но для полноты)
  'Пользователь с таким именем уже существует': 'Пользователь с таким именем уже существует',
  'Не удалось создать аккаунт': 'Не удалось создать аккаунт',
  'Непредвиденная ошибка': 'Непредвиденная ошибка',
  'База данных не настроена': 'База данных не настроена',
};

/**
 * Переводит сообщение об ошибке на русский язык
 * @param errorMessage - Сообщение об ошибке от API
 * @returns Переведенное сообщение или оригинальное, если перевод не найден
 */
export function translateError(errorMessage: string | undefined | null): string {
  if (!errorMessage) {
    return 'Произошла ошибка';
  }

  // Убираем лишние пробелы и приводим к нижнему регистру для поиска
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


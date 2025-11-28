/**
 * Утилиты для работы с градиентами аватарок
 */

// Предопределенные градиенты для аватарок (подобраны под стилистику сайта с синим свечением)
export const AVATAR_GRADIENTS = [
  'from-blue-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-indigo-500 to-purple-600',
  'from-blue-600 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-violet-500 to-purple-600',
  'from-teal-500 to-cyan-600',
  'from-cyan-600 to-teal-600',
  'from-emerald-500 to-teal-600',
  'from-green-500 to-emerald-600',
  'from-green-600 to-emerald-600',
] as const;

export type AvatarGradient = typeof AVATAR_GRADIENTS[number];

/**
 * Генерирует случайный градиент для аватарки
 */
export function generateRandomGradient(): AvatarGradient {
  const randomIndex = Math.floor(Math.random() * AVATAR_GRADIENTS.length);
  return AVATAR_GRADIENTS[randomIndex];
}

/**
 * Генерирует детерминированный градиент на основе строки (например, username или user_id)
 * Это гарантирует, что один и тот же пользователь всегда будет иметь один и тот же градиент
 */
export function generateGradientFromString(str: string): AvatarGradient {
  // Простая хеш-функция для преобразования строки в число
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Используем абсолютное значение хеша для выбора градиента
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

/**
 * Получает классы Tailwind для применения градиента
 */
export function getGradientClasses(gradient: string | null | undefined, fallback: AvatarGradient = 'from-blue-500 to-purple-600'): string {
  if (!gradient) {
    return `bg-gradient-to-r ${fallback}`;
  }
  // Валидируем градиент, если он невалидный - используем fallback
  if (isValidGradient(gradient)) {
    return `bg-gradient-to-r ${gradient}`;
  }
  return `bg-gradient-to-r ${fallback}`;
}

/**
 * Валидирует градиент
 */
export function isValidGradient(gradient: string | null | undefined): gradient is AvatarGradient {
  if (!gradient) return false;
  return AVATAR_GRADIENTS.includes(gradient as AvatarGradient);
}


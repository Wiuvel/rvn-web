/**
 * Утилиты для работы с аватарками
 * Использует короткие идентификаторы (0-9) вместо длинных градиентов
 */

// Предопределенные градиенты для аватарок (подобраны под стилистику сайта с синим свечением)
// Индекс соответствует короткому идентификатору
const AVATAR_GRADIENTS = [
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
] as const;

export type AvatarId = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * Генерирует случайный идентификатор аватарки (0-9)
 */
export function generateRandomAvatar(): AvatarId {
  const randomIndex = Math.floor(Math.random() * AVATAR_GRADIENTS.length);
  return String(randomIndex) as AvatarId;
}

/**
 * Генерирует детерминированный идентификатор аватарки на основе строки
 * Это гарантирует, что один и тот же пользователь всегда будет иметь один и тот же аватар
 */
export function generateAvatarFromString(str: string): AvatarId {
  // Простая хеш-функция для преобразования строки в число
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Используем абсолютное значение хеша для выбора аватара
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return String(index) as AvatarId;
}

/**
 * Получает классы Tailwind для применения градиента по идентификатору аватарки
 */
export function getGradientClasses(avatarId: string | null | undefined, fallback: AvatarId = '0'): string {
  if (!avatarId) {
    const gradient = AVATAR_GRADIENTS[parseInt(fallback) || 0];
    return `bg-gradient-to-r ${gradient}`;
  }
  
  // Валидируем идентификатор
  const id = parseInt(avatarId);
  if (isNaN(id) || id < 0 || id >= AVATAR_GRADIENTS.length) {
    const gradient = AVATAR_GRADIENTS[parseInt(fallback) || 0];
    return `bg-gradient-to-r ${gradient}`;
  }
  
  const gradient = AVATAR_GRADIENTS[id];
  return `bg-gradient-to-r ${gradient}`;
}

/**
 * Валидирует идентификатор аватарки
 */
export function isValidAvatar(avatarId: string | null | undefined): avatarId is AvatarId {
  if (!avatarId) return false;
  const id = parseInt(avatarId);
  return !isNaN(id) && id >= 0 && id < AVATAR_GRADIENTS.length;
}

// Обратная совместимость (для миграции)
/**
 * @deprecated Используйте generateRandomAvatar() вместо этого
 */
export function generateRandomGradient(): string {
  return generateRandomAvatar();
}

/**
 * @deprecated Используйте generateAvatarFromString() вместо этого
 */
export function generateGradientFromString(str: string): string {
  return generateAvatarFromString(str);
}


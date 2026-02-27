/**
 * Утилиты для валидации UUID
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Проверяет, является ли строка валидным UUID
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Валидирует UUID и выбрасывает ошибку, если невалиден
 */
export function validateUUID(value: string, fieldName: string = 'id'): void {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid UUID format for ${fieldName}: ${value}`);
  }
}

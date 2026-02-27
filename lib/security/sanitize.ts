/**
 * Утилиты для санитизации входных данных
 * Используется для очистки данных перед сохранением в БД
 */

/**
 * Санитизация строкового ввода
 * Удаляет опасные символы и ограничивает длину
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/[<>'"&]/g, '')
    .slice(0, 1000);
}

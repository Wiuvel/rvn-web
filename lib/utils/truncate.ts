/**
 * Обрезка имени файла для отображения в UI (модалки загрузки аватара/баннера).
 */

import { FILE_NAME_TRUNCATE_LEN } from './constants';

/**
 * Возвращает имя, обрезанное до maxLen символов с «..» в конце.
 * @param name — исходное имя (например, имя файла)
 * @param maxLen — макс. длина (по умолчанию из конфига)
 */
export function truncateFileName(
  name: string,
  maxLen: number = FILE_NAME_TRUNCATE_LEN
): string {
  return name.length > maxLen ? name.slice(0, maxLen - 2) + '..' : name;
}

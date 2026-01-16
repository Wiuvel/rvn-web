/**
 * Утилита для отладки критических функций
 * Использует фиолетовую палитру для консольных сообщений
 */

type DebugLevel = 'info' | 'warn' | 'error' | 'success';

interface DebugOptions {
  level?: DebugLevel;
  group?: string;
  collapsed?: boolean;
}

const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

const COLORS = {
  info: '#a78bfa',      // Фиолетовый 400
  warn: '#c084fc',      // Фиолетовый 500
  error: '#9333ea',     // Фиолетовый 600
  success: '#7c3aed',   // Фиолетовый 700
  group: '#8b5cf6',     // Фиолетовый 500
  reset: '#ffffff'
};

const STYLES = {
  info: `color: ${COLORS.info}; font-weight: 500;`,
  warn: `color: ${COLORS.warn}; font-weight: 600;`,
  error: `color: ${COLORS.error}; font-weight: 700;`,
  success: `color: ${COLORS.success}; font-weight: 600;`,
  group: `color: ${COLORS.group}; font-weight: 600; font-size: 12px;`
};

/**
 * Отладочное логирование с фиолетовой палитрой
 */
export function debug(
  message: string,
  data?: unknown,
  options: DebugOptions = {}
): void {
  if (!DEBUG_ENABLED) return;

  const { level = 'info', group, collapsed = false } = options;
  const style = STYLES[level];
  const icon = getIcon(level);

  if (group) {
    const method = collapsed ? console.groupCollapsed : console.group;
    method(`%c${icon} ${group}`, STYLES.group);
    console.log(`%c${message}`, style, data || '');
    console.groupEnd();
  } else {
    console.log(`%c${icon} ${message}`, style, data || '');
  }
}

/**
 * Логирование начала выполнения функции
 */
export function debugStart(functionName: string, params?: unknown): void {
  if (!DEBUG_ENABLED) return;
  debug(`▶ ${functionName}`, params, { level: 'info', group: 'Function Start' });
}

/**
 * Логирование завершения выполнения функции
 */
export function debugEnd(functionName: string, result?: unknown): void {
  if (!DEBUG_ENABLED) return;
  debug(`✓ ${functionName}`, result, { level: 'success', group: 'Function End' });
}

/**
 * Логирование ошибки
 */
export function debugError(functionName: string, error: unknown): void {
  if (!DEBUG_ENABLED) return;
  debug(`✗ ${functionName}`, error, { level: 'error', group: 'Error' });
}

/**
 * Логирование предупреждения
 */
export function debugWarn(functionName: string, message: string, data?: unknown): void {
  if (!DEBUG_ENABLED) return;
  debug(`⚠ ${functionName}: ${message}`, data, { level: 'warn', group: 'Warning' });
}

function getIcon(level: DebugLevel): string {
  switch (level) {
    case 'info': return 'ℹ';
    case 'warn': return '⚠';
    case 'error': return '✗';
    case 'success': return '✓';
    default: return '•';
  }
}

/**
 * Измерение производительности функции
 */
export function debugPerformance<T>(
  functionName: string,
  fn: () => T
): T {
  if (!DEBUG_ENABLED) return fn();

  const start = performance.now();
  debugStart(functionName);
  
  try {
    const result = fn();
    const duration = performance.now() - start;
    debugEnd(functionName, { duration: `${duration.toFixed(2)}ms` });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    debugError(functionName, { error, duration: `${duration.toFixed(2)}ms` });
    throw error;
  }
}

/**
 * Асинхронное измерение производительности функции
 */
export async function debugPerformanceAsync<T>(
  functionName: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!DEBUG_ENABLED) return fn();

  const start = performance.now();
  debugStart(functionName);
  
  try {
    const result = await fn();
    const duration = performance.now() - start;
    debugEnd(functionName, { duration: `${duration.toFixed(2)}ms` });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    debugError(functionName, { error, duration: `${duration.toFixed(2)}ms` });
    throw error;
  }
}

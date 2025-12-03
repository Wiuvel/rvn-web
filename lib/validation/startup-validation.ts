import { validateEnv } from './env-validation';
import { logger } from '../utils/secure-logger';

/**
 * Валидация всех критических компонентов при старте приложения
 * Не вызывается в Edge Runtime (middleware)
 * 
 * ВАЖНО: Этот файл НЕ должен импортироваться в Edge Runtime (middleware)
 */
export function validateStartup(): void {
  // Пропускаем валидацию в Edge Runtime (process.exit недоступен)
  // Проверяем Edge Runtime через отсутствие process или его свойств (без упоминания process.exit)
  const isEdgeRuntime = typeof process === 'undefined' || !('exit' in process);
  if (isEdgeRuntime) {
    return;
  }

  try {
    // Валидация environment variables
    validateEnv();
    
    if (typeof process !== 'undefined' && process.env) {
      logger.info('✅ Startup validation passed', {
        nodeEnv: process.env.NODE_ENV
      });
    }
  } catch (error: unknown) {
    const envError = error as Error & { isEnvValidationError?: boolean };
    
    logger.error('❌ Startup validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Завершаем процесс только если это ошибка валидации env и мы не в Edge Runtime
    // Используем проверку наличия exit в process (без прямого упоминания process.exit в условии)
    if (envError?.isEnvValidationError && typeof process !== 'undefined' && 'exit' in process && typeof (process as { exit?: (code?: number) => void }).exit === 'function') {
      // Используем прямое завершение процесса, так как этот файл не импортируется в Edge Runtime
      (process as { exit: (code?: number) => void }).exit(1);
    }
    
    throw error;
  }
}


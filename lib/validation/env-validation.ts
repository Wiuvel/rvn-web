import { z } from 'zod';

/**
 * Схема валидации environment variables
 * Все обязательные переменные должны быть установлены и валидны
 */
const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(20, 'SUPABASE_ANON_KEY must be at least 20 characters'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY must be at least 20 characters'),
  
  // CSRF
  CSRF_SECRET: z.string()
    .min(32, 'CSRF_SECRET must be at least 32 characters')
    .refine(
      (val) => val !== 'default-csrf-secret-change-in-production',
      { message: 'CSRF_SECRET must be changed from default value' }
    ),
  
  // Optional
  TURNSTILE_SECRET_KEY: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  
  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Telegram OAuth
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  
  // Public domain for OAuth redirects (optional, falls back to host header)
  PUBLIC_DOMAIN: z.string().url().optional(),
  
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Валидация и получение environment variables
 * Должна быть вызвана при старте приложения
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  // Получаем значения с fallback
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  try {
    validatedEnv = envSchema.parse({
      // Поддержка NEXT_PUBLIC_SUPABASE_URL для обратной совместимости с dockerfile
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      CSRF_SECRET: process.env.CSRF_SECRET,
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
      PUBLIC_DOMAIN: process.env.PUBLIC_DOMAIN,
      NODE_ENV: process.env.NODE_ENV || 'development',
    });
    
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Краткие сообщения об ошибках
      const missingVars = error.issues
        .filter(issue => issue.code === 'invalid_type' && (issue as { received?: string }).received === 'undefined')
        .map(issue => issue.path.join('.'));
      
      const invalidVars = error.issues
        .filter(issue => issue.code !== 'invalid_type' || (issue as { received?: string }).received !== 'undefined')
        .map(issue => `${issue.path.join('.')}: ${issue.message}`);
      
      const errorParts: string[] = [];
      if (missingVars.length > 0) {
        errorParts.push(`Missing: ${missingVars.join(', ')}`);
      }
      if (invalidVars.length > 0) {
        errorParts.push(`Invalid: ${invalidVars.join('; ')}`);
      }
      
      const errorMessage = `Env validation failed: ${errorParts.join(' | ')}`;
      
      // В development показываем подробности, в production - кратко
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ ${errorMessage}`);
      } else {
        console.error(errorMessage);
      }
      
      const envError = new Error(errorMessage) as Error & { isEnvValidationError: boolean };
      envError.isEnvValidationError = true;
      throw envError;
    }
    throw error;
  }
}

/**
 * Получение валидированных environment variables
 * Используйте эту функцию вместо прямого доступа к process.env
 */
export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

// В Edge Runtime не валидируем при импорте - валидация происходит лениво при первом вызове getEnv()
// Валидация при импорте происходит только на сервере (не в Edge Runtime)
// Проверяем, что мы не в Edge Runtime через проверку доступности process (без process.exit)
const canValidateOnImport = typeof window === 'undefined' && typeof process !== 'undefined';

// Проверяем, происходит ли сборка (build-time)
// Во время сборки Next.js переменные окружения могут быть недоступны (например, в CapRover)
// В этом случае валидация будет отложена до runtime
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                    process.env.NEXT_PHASE === 'phase-development-build';

if (canValidateOnImport && !isBuildTime) {
  try {
    validateEnv();
  } catch (error: unknown) {
    // В development режиме можем продолжить с предупреждением
    if (process.env?.NODE_ENV === 'development') {
      // Тихий режим - не логируем, так как ошибка уже была выведена выше
    } else {
      // Просто выбрасываем ошибку - завершение процесса будет на уровне выше
      // (например, в startup-validation.ts, который не импортируется в Edge Runtime)
      throw error;
    }
  }
}


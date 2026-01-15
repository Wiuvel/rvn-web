import { z } from 'zod';

/**
 * Схема валидации environment variables
 * Все обязательные переменные должны быть установлены и валидны
 */
const envSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'SUPABASE_PUBLISHABLE_KEY must be at least 20 characters'),
  SUPABASE_SECRET_KEY: z.string().min(20, 'SUPABASE_SECRET_KEY must be at least 20 characters'),
  
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
  
  // Yandex OAuth
  YANDEX_CLIENT_ID: z.string().optional(),
  YANDEX_CLIENT_SECRET: z.string().optional(),
  
  // VK OAuth
  VK_CLIENT_ID: z.string().optional(),
  VK_CLIENT_SECRET: z.string().optional(),
  
  // Twitch OAuth
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),

  // GitHub OAuth for Admin Panel
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  
  // Public domain for OAuth redirects (optional, falls back to host header)
  NEXT_PUBLIC_DOMAIN: z.string().url().optional(),
  
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
}).superRefine((val, ctx) => {
  const pairs: Array<[keyof typeof val, keyof typeof val, string]> = [
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'Google'],
    ['YANDEX_CLIENT_ID', 'YANDEX_CLIENT_SECRET', 'Yandex'],
    ['VK_CLIENT_ID', 'VK_CLIENT_SECRET', 'VK'],
    ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'Twitch'],
    ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GitHub'],
  ];

  pairs.forEach(([idKey, secretKey, label]) => {
    const hasId = !!val[idKey];
    const hasSecret = !!val[secretKey];
    if (hasId && !hasSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} secret is required when client id is set`,
        path: [secretKey],
      });
    }
    if (hasSecret && !hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} client id is required when secret is set`,
        path: [idKey],
      });
    }
  });
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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  try {
    validatedEnv = envSchema.parse({
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      CSRF_SECRET: process.env.CSRF_SECRET,
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      YANDEX_CLIENT_ID: process.env.YANDEX_CLIENT_ID,
      YANDEX_CLIENT_SECRET: process.env.YANDEX_CLIENT_SECRET,
      VK_CLIENT_ID: process.env.VK_CLIENT_ID,
      VK_CLIENT_SECRET: process.env.VK_CLIENT_SECRET,
      TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
      TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      NEXT_PUBLIC_DOMAIN: process.env.NEXT_PUBLIC_DOMAIN,
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
      
      // Ошибка валидации env переменных логируется через throw
      
      const envError = new Error(errorMessage) as Error & { isEnvValidationError: boolean };
      envError.isEnvValidationError = true;
      throw envError;
    }
    throw error;
  }
}

export function getEnv(): Env {
  if (!validatedEnv) {
    return validateEnv();
  }
  return validatedEnv;
}

const canValidateOnImport = typeof window === 'undefined' && typeof process !== 'undefined';
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                    process.env.NEXT_PHASE === 'phase-development-build';
if (canValidateOnImport && !isBuildTime) {
  try {
    validateEnv();
  } catch (error: unknown) {
    if (process.env?.NODE_ENV === 'development') {
    } else {
      throw error;
    }
  }
}


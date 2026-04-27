import { z } from 'zod';

/**
 * Схема валидации environment variables
 * Все обязательные переменные должны быть установлены и валидны
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(10, 'DATABASE_URL must be a valid PostgreSQL connection string'),

    CSRF_SECRET: z
      .string()
      .min(32, 'CSRF_SECRET must be at least 32 characters')
      .refine((val) => val !== 'default-csrf-secret-change-in-production', {
        message: 'CSRF_SECRET must be changed from default value',
      }),

    /**
     * Secret для HMAC-подписи `user_data` cookie (см. `lib/auth/user-cookie.server.ts`).
     * Обязателен в production; в development опционален и фолбекит на hardcoded dev-secret.
     * Отдельный от `CSRF_SECRET`, чтобы ротация одного не ломала другое.
     */
    USER_DATA_SECRET: z
      .string()
      .min(32, 'USER_DATA_SECRET must be at least 32 characters')
      .refine((val) => val !== 'default-user-data-secret-change-in-production-dev', {
        message: 'USER_DATA_SECRET must be changed from default value',
      })
      .optional(),

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

    // Cloudflare Turnstile site key (public, used in client for captcha widget)
    NEXT_PUBLIC_TURNSTILE_SITEKEY: z.string().optional(),

    // S3-compatible Object Storage
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_REGION: z.string().optional(),

    // Node environment
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production' && !val.USER_DATA_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'USER_DATA_SECRET is required in production',
        path: ['USER_DATA_SECRET'],
      });
    }
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

    // Проверка S3 конфигурации
    const s3Keys: Array<keyof typeof val> = [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'S3_REGION',
    ];
    const hasS3Config = s3Keys.some((key) => !!val[key]);
    if (hasS3Config) {
      s3Keys.forEach((key) => {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `S3 ${key} is required when any S3 config is set`,
            path: [key],
          });
        }
      });
    }
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

  try {
    validatedEnv = envSchema.parse({
      DATABASE_URL: process.env.DATABASE_URL,
      CSRF_SECRET: process.env.CSRF_SECRET,
      USER_DATA_SECRET: process.env.USER_DATA_SECRET,
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
      NEXT_PUBLIC_TURNSTILE_SITEKEY: process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
      S3_SECRET_KEY: process.env.S3_SECRET_KEY,
      S3_REGION: process.env.S3_REGION,
      NODE_ENV: process.env.NODE_ENV || 'development',
    });

    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Краткие сообщения об ошибках
      const missingVars = error.issues
        .filter(
          (issue) =>
            issue.code === 'invalid_type' &&
            (issue as { received?: string }).received === 'undefined',
        )
        .map((issue) => issue.path.join('.'));

      const invalidVars = error.issues
        .filter(
          (issue) =>
            issue.code !== 'invalid_type' ||
            (issue as { received?: string }).received !== 'undefined',
        )
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`);

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
const isBuildTime =
  process.env.NEXT_PHASE === 'phase-production-build' ||
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

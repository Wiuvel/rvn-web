/**
 * Конфигурация приложения
 * Все хардкодные значения вынесены сюда для централизованного управления
 */
import { getEnv } from './env-validation';

// Ленивая валидация - происходит при первом вызове getEnv()
// В Edge Runtime валидация происходит без process.exit
let env: ReturnType<typeof getEnv> | null = null;

function getValidatedEnv() {
  if (!env) {
    try {
      env = getEnv();
    } catch (error) {
      // Проверяем, происходит ли сборка или это Edge Runtime
      const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                          process.env.NEXT_PHASE === 'phase-development-build';
      const isEdgeRuntime = typeof process === 'undefined' || !('exit' in process);
      
      // В Edge Runtime или во время сборки используем fallback значения
      if (isEdgeRuntime || isBuildTime) {
        // Тихий режим - валидация произойдет в runtime
        // Используем значения из process.env напрямую (с предупреждением)
        env = {
          SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
          CSRF_SECRET: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
          TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
          ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
          GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
          NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
        } as ReturnType<typeof getEnv>;
      } else {
        throw error;
      }
    }
  }
  return env;
}

export const appConfig = {
  // Rate limiting
  rateLimit: {
    auth: {
      windowMs: 5 * 60 * 1000, // 5 минут
      maxRequests: 5
    },
    general: {
      windowMs: 5 * 60 * 1000, // 5 минут
      maxRequests: 100
    },
    immunityDuration: 15 * 60 * 1000 // 15 минут - иммунитет после прохождения капчи
  },

  // Session
  session: {
    timeout: 60 * 60 * 1000, // 1 час
    cleanupInterval: 5 * 60 * 1000 // 5 минут
  },

  // CSRF
  csrf: {
    tokenLifetime: 60 * 60 * 1000, // 1 час
    cleanupInterval: 5 * 60 * 1000 // 5 минут
  },

  // Cache
  cache: {
    defaultTTL: 300, // 5 минут
    userRoleTTL: 60, // 1 минута для ролей пользователей
    cleanupInterval: 5 * 60 * 1000 // 5 минут
  },

  // Timeouts
  timeouts: {
    authFetch: 10000, // 10 секунд
    message: 10000 // 10 секунд
  },

  // Delays
  delays: {
    redirect: 1000, // 1 секунда
    animation: 250, // 250ms
    resizeDebounce: 100, // 100ms
    markAsReadDebounce: 2000 // 2 секунды - debounce для отметки сообщений как прочитанных
  },

  // Character limits
  limits: {
    ticketSubjectMaxLength: 50,
    messageMaxLength: 500,
    maxTicketsPerUser: 2
  },

  // GSAP animation defaults
  animations: {
    defaultDuration: 0.5,
    defaultEase: 'power2.out',
    staggerDelay: 0.1
  },

  // Scroll trigger defaults
  scrollTrigger: {
    start: 'top 85%',
    end: 'bottom 15%'
  },

  // JWT Configuration
  jwt: {
    // Access Token - короткоживущий токен для авторизации запросов
    accessToken: {
      expiresIn: '10m', // 10 минут (можно настроить 10-15 минут)
      algorithm: 'HS256' as const
    },
    // Refresh Token - долгоживущий токен для обновления access token
    refreshToken: {
      expiresIn: '60d', // 60 дней (можно настроить 30-60 дней)
      algorithm: 'HS256' as const
    },
    // Секретный ключ для подписи токенов (валидируется при старте)
    // Используем getter для ленивой валидации в Edge Runtime
    get secret() {
      return getValidatedEnv().JWT_SECRET;
    },
    // Дополнительные опции
    issuer: 'rvn.market',
    audience: 'rvn.market',
    // Настройки для хранения refresh токенов в БД
    refreshTokenStorage: {
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 часа - интервал очистки истекших токенов
      maxTokensPerUser: 5 // Максимальное количество активных refresh токенов на пользователя
    }
  }
} as const;



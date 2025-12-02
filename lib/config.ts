/**
 * Конфигурация приложения
 * Все хардкодные значения вынесены сюда для централизованного управления
 */

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
    // Секретный ключ для подписи токенов (должен быть в .env)
    secret: process.env.JWT_SECRET || process.env.NEXT_PUBLIC_JWT_SECRET || 'change-me-in-production',
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



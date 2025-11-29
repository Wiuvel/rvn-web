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
    resizeDebounce: 100 // 100ms
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
  }
} as const;



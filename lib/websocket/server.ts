/**
 * WebSocket сервер для системы поддержки
 * Используется для синхронизации сообщений и обновлений тикетов в реальном времени
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '@/lib/utils/secure-logger';
import type { SupportWebSocketEvents } from './events';
import { supabaseAdmin } from '@/lib/database/supabase';
import { getUserByToken } from '@/lib/auth/index';
import { hasUserRole } from '@/lib/auth/user-roles';
import { SessionManager } from '@/lib/auth/session-manager';
import { isValidUUID } from '@/lib/utils/uuid-validation';

/** Parse cookies from Cookie header string */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

// Вспомогательные типы для извлечения типов данных из событий
type MessageNewData = Parameters<SupportWebSocketEvents['support:message:new']>[0];
type TicketUpdatedData = Parameters<SupportWebSocketEvents['support:ticket:updated']>[0];
type TicketAssignedData = Parameters<SupportWebSocketEvents['support:ticket:assigned']>[0];
type CommentNewData = Parameters<SupportWebSocketEvents['profile:comment:new']>[0];

let io: SocketIOServer<SupportWebSocketEvents> | null = null;

// Флаг для отслеживания попыток инициализации
let initializationAttempted = false;

// Очередь сообщений для отправки после инициализации сервера
type QueuedMessageData =
  | { ticketId: string; message: MessageNewData['message'] }
  | { ticketId: string; ticket: TicketUpdatedData['ticket'] }
  | {
      ticketId: string;
      assignedTo: string | null;
      assignedUser: TicketAssignedData['assignedUser'];
    }
  | { ticketId: string; messageIds: string[]; readBy: 'user' | 'support' }
  | { profileId: string; comment: CommentNewData['comment'] };

interface QueuedMessage {
  type: 'message' | 'ticketUpdate' | 'ticketAssignment' | 'messageRead' | 'comment';
  ticketId: string; // В случае комментария здесь будет profileId
  data: QueuedMessageData;
  timestamp: number;
}

const messageQueue: QueuedMessage[] = [];
const MAX_QUEUE_SIZE = 100; // Максимальный размер очереди
const MAX_QUEUE_AGE = 60000; // Максимальный возраст сообщения в очереди (1 минута)

// Rate limiting для typing событий
const typingRateLimits = new Map<string, { lastEmit: number; count: number }>();
const TYPING_RATE_LIMIT_MS = 1000; // Минимум 1 секунда между событиями
const TYPING_RATE_LIMIT_COUNT = 10; // Максимум 10 событий в минуту

// Rate limiting для попыток подключения без токена (защита от брутфорса)
const connectionAttempts = new Map<
  string,
  { count: number; firstAttempt: number; lastAttempt: number }
>();
const MAX_CONNECTION_ATTEMPTS = 5; // Максимум 5 попыток
const CONNECTION_ATTEMPT_WINDOW = 60000; // За 1 минуту
const CONNECTION_ATTEMPT_BAN_TIME = 300000; // Бан на 5 минут при превышении лимита

/**
 * Инициализация WebSocket сервера
 */
export function initWebSocketServer(
  httpServer: HTTPServer,
): SocketIOServer<SupportWebSocketEvents> {
  if (io) {
    return io;
  }

  initializationAttempted = true;

  // Определяем разрешенные origins для CORS
  const getAllowedOrigins = ():
    | string[]
    | string
    | ((
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => void) => {
    const origins: string[] = [];

    // Добавляем PUBLIC_DOMAIN если указан
    if (process.env.PUBLIC_DOMAIN) {
      const domain = process.env.PUBLIC_DOMAIN.trim();
      // Убираем trailing slash
      const cleanDomain = domain.replace(/\/$/, '');
      // Добавляем с http и https
      if (!cleanDomain.startsWith('http')) {
        origins.push(`https://${cleanDomain}`);
        origins.push(`http://${cleanDomain}`);
      } else {
        origins.push(cleanDomain);
        // Также добавляем противоположный протокол
        if (cleanDomain.startsWith('https://')) {
          origins.push(cleanDomain.replace('https://', 'http://'));
        } else if (cleanDomain.startsWith('http://')) {
          origins.push(cleanDomain.replace('http://', 'https://'));
        }
      }
    }

    // Добавляем localhost и порт из env для разработки (чтобы работало при любом PORT)
    if (process.env.NODE_ENV === 'development') {
      const devPort = process.env.PORT || '3001';
      origins.push(`http://localhost:${devPort}`);
      origins.push('http://localhost:3000');
      origins.push(`http://127.0.0.1:${devPort}`);
      origins.push('http://127.0.0.1:3000');
    }

    // Если origins пустой, разрешаем все (только для разработки)
    if (origins.length === 0) {
      return process.env.NODE_ENV === 'development' ? '*' : [];
    }

    // Функция для динамической проверки origin
    const originChecker = (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        // Если origin не указан, разрешаем (для некоторых клиентов)
        return callback(null, true);
      }

      // Проверяем точное совпадение
      if (origins.includes(origin)) {
        return callback(null, true);
      }

      // Проверяем без протокола (для гибкости)
      const originWithoutProtocol = origin.replace(/^https?:\/\//, '');
      const allowedWithoutProtocol = origins.map((o) => o.replace(/^https?:\/\//, ''));
      if (allowedWithoutProtocol.includes(originWithoutProtocol)) {
        return callback(null, true);
      }

      // В development разрешаем все
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }

      // Отклоняем
      callback(null, false);
    };

    return originChecker;
  };

  const allowedOrigins = getAllowedOrigins();

  io = new SocketIOServer<SupportWebSocketEvents>(httpServer, {
    path: '/api/socket',
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    transports: ['websocket', 'polling'],
    // Отключаем perMessageDeflate для избежания ошибок с bufferUtil
    // bufferutil и utf-8-validate установлены как опциональные зависимости
    perMessageDeflate: false,
    // Разрешаем подключения только через WebSocket и polling
    allowEIO3: false,
    // Увеличиваем таймауты для медленных соединений
    connectTimeout: 45000,
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Middleware для аутентификации при подключении
  io.use(async (socket, next) => {
    try {
      // Получаем IP адрес для rate limiting
      const clientIP =
        socket.handshake.address ||
        socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        socket.handshake.headers['x-real-ip']?.toString() ||
        'unknown';

      // Получаем токен из auth параметра (передается клиентом)
      const token = socket.handshake.auth?.token;

      if (!token) {
        // Rate limiting для попыток подключения без токена
        const now = Date.now();
        const attemptKey = `no-token:${clientIP}`;
        const attempts = connectionAttempts.get(attemptKey);

        if (attempts) {
          // Проверяем, не забанен ли IP
          if (
            now - attempts.firstAttempt < CONNECTION_ATTEMPT_BAN_TIME &&
            attempts.count >= MAX_CONNECTION_ATTEMPTS
          ) {
            // IP забанен, отклоняем подключение без логирования
            return next(new Error('Too many connection attempts'));
          }

          // Сбрасываем счетчик, если прошло окно времени
          if (now - attempts.firstAttempt > CONNECTION_ATTEMPT_WINDOW) {
            connectionAttempts.delete(attemptKey);
          } else {
            attempts.count++;
            attempts.lastAttempt = now;
          }
        } else {
          connectionAttempts.set(attemptKey, {
            count: 1,
            firstAttempt: now,
            lastAttempt: now,
          });
        }

        const currentAttempts = connectionAttempts.get(attemptKey);

        // Логируем только подозрительные попытки (много попыток за короткое время)
        if (currentAttempts && currentAttempts.count >= 3) {
          logger.warn('WebSocket: Multiple connection attempts without token', {
            id: socket.id,
            origin: socket.handshake.headers.origin,
            ip: clientIP,
            attempts: currentAttempts.count,
          });
        }

        // Очищаем старые записи rate limiting
        if (connectionAttempts.size > 1000) {
          for (const [key, value] of connectionAttempts.entries()) {
            if (now - value.lastAttempt > CONNECTION_ATTEMPT_WINDOW * 2) {
              connectionAttempts.delete(key);
            }
          }
        }

        return next(new Error('Authentication required'));
      }

      // Проверяем токен и получаем пользователя
      const user = await getUserByToken(token);

      if (!user) {
        // Rate limiting для невалидных токенов
        const now = Date.now();
        const attemptKey = `invalid-token:${clientIP}`;
        const attempts = connectionAttempts.get(attemptKey);

        if (attempts) {
          if (
            now - attempts.firstAttempt < CONNECTION_ATTEMPT_BAN_TIME &&
            attempts.count >= MAX_CONNECTION_ATTEMPTS
          ) {
            return next(new Error('Too many invalid token attempts'));
          }

          if (now - attempts.firstAttempt > CONNECTION_ATTEMPT_WINDOW) {
            connectionAttempts.delete(attemptKey);
          } else {
            attempts.count++;
            attempts.lastAttempt = now;
          }
        } else {
          connectionAttempts.set(attemptKey, {
            count: 1,
            firstAttempt: now,
            lastAttempt: now,
          });
        }

        const currentAttempts = connectionAttempts.get(attemptKey);

        // Логируем только подозрительные попытки
        if (currentAttempts && currentAttempts.count >= 3) {
          logger.warn('WebSocket: Multiple invalid token attempts', {
            id: socket.id,
            origin: socket.handshake.headers.origin,
            ip: clientIP,
            attempts: currentAttempts.count,
          });
        }

        return next(new Error('Invalid token'));
      }

      // Session binding: require valid session + token from cookie
      const cookieHeader = socket.handshake.headers.cookie;
      const parsedCookies = parseCookies(
        typeof cookieHeader === 'string' ? cookieHeader : cookieHeader?.[0],
      );
      const sessionId = parsedCookies['session_id'];
      const tokenFromCookie = parsedCookies['token'];

      if (!sessionId || !tokenFromCookie) {
        return next(new Error('Session and token required'));
      }

      const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
      const ipForValidation =
        socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || clientIP;
      const validation = await SessionManager.validateSession(
        sessionId,
        tokenFromCookie,
        ipForValidation,
        userAgent,
      );

      if (!validation.valid) {
        return next(new Error('Invalid session'));
      }

      const session = await SessionManager.getSession(sessionId);
      if (!session || session.userId !== user.id) {
        return next(new Error('Session mismatch'));
      }

      // Успешная аутентификация - очищаем счетчики для этого IP
      connectionAttempts.delete(`no-token:${clientIP}`);
      connectionAttempts.delete(`invalid-token:${clientIP}`);

      // Сохраняем пользователя в socket.data для использования в обработчиках
      socket.data.user = user;
      socket.data.userId = user.id;

      // Проверяем роль поддержки заранее для оптимизации
      socket.data.isSupport = await hasUserRole(user.id, 'support');

      next();
    } catch (error) {
      logger.error('WebSocket: Authentication error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        id: socket.id,
      });
      next(new Error('Authentication failed'));
    }
  });

  // Обработка ошибок подключения
  io.engine.on('connection_error', (err) => {
    logger.error('WebSocket: Connection error', {
      error: err.message,
      code: err.code,
      context: err.context,
    });
  });

  io.on('connection', async (socket) => {
    // Логируем подключение для диагностики
    logger.info('WebSocket: Client connected', {
      id: socket.id,
      origin: socket.handshake.headers.origin,
      transport: socket.conn.transport.name,
    });

    // Трекинг аналитики WebSocket подключения
    try {
      const { trackWebSocketConnection } = await import('@/lib/analytics/support-analytics');
      await trackWebSocketConnection();
    } catch {
      // Игнорируем ошибки аналитики
    }

    socket.on('disconnect', (reason) => {
      logger.info('WebSocket: Client disconnected', {
        id: socket.id,
        reason: reason,
      });
    });

    // Обработка присоединения к тикету с полной валидацией прав доступа
    socket.on('support:join', async (data) => {
      const { ticketId } = data;
      const userId = socket.data.userId;
      const isSupport = socket.data.isSupport;

      // Валидация входных данных
      if (!ticketId) {
        socket.emit('support:error', { message: 'Invalid join request', code: 'INVALID_DATA' });
        return;
      }

      // Валидация UUID формата ticketId
      if (!isValidUUID(ticketId)) {
        logger.warn('WebSocket: Invalid ticket ID format', {
          ticketId,
          userId,
          socketId: socket.id,
        });
        socket.emit('support:error', { message: 'Invalid ticket ID', code: 'INVALID_TICKET_ID' });
        return;
      }

      // Проверка существования тикета и прав доступа
      if (!supabaseAdmin) {
        socket.emit('support:error', {
          message: 'Service unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      try {
        const { data: ticket, error: ticketError } = await supabaseAdmin
          .from('support_tickets')
          .select('id, user_id')
          .eq('id', ticketId)
          .single();

        if (ticketError || !ticket) {
          socket.emit('support:error', { message: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
          return;
        }

        // Проверка прав доступа: пользователь может видеть только свои тикеты, поддержка - все
        if (!isSupport && ticket.user_id !== userId) {
          logger.warn('WebSocket: Access denied to ticket', {
            userId,
            ticketId,
            ticketOwnerId: ticket.user_id,
          });
          socket.emit('support:error', { message: 'Access denied', code: 'ACCESS_DENIED' });
          return;
        }

        // Все проверки пройдены, присоединяемся к комнате
        const room = `ticket:${ticketId}`;
        socket.join(room);

        // Не логируем успешные присоединения к комнатам
      } catch (error) {
        logger.error('Error validating ticket access', {
          ticketId,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        socket.emit('support:error', {
          message: 'Error validating access',
          code: 'VALIDATION_ERROR',
        });
      }
    });

    // Обработка выхода из тикета
    socket.on('support:leave', (data) => {
      const { ticketId } = data;

      // Валидация входных данных
      if (!ticketId || !isValidUUID(ticketId)) {
        return; // Игнорируем невалидные запросы
      }

      const room = `ticket:${ticketId}`;
      socket.leave(room);
      // Не логируем выходы из комнат
    });

    // Обработка статуса печати с rate limiting
    socket.on('support:typing', (data) => {
      const { ticketId, isTyping } = data;
      const userId = socket.data.userId;

      // Валидация входных данных
      if (!ticketId || typeof isTyping !== 'boolean' || !userId) {
        return;
      }

      // Валидация UUID формата ticketId
      if (!isValidUUID(ticketId)) {
        return; // Игнорируем невалидные UUID
      }

      // Проверяем, что пользователь присоединен к тикету
      const room = `ticket:${ticketId}`;
      if (!socket.rooms.has(room)) {
        // Пользователь не присоединен к тикету, игнорируем событие
        return;
      }

      // Rate limiting для typing событий
      const key = `${socket.id}:${ticketId}:${userId}`;
      const now = Date.now();
      const limit = typingRateLimits.get(key);

      if (limit) {
        const timeSinceLastEmit = now - limit.lastEmit;
        if (timeSinceLastEmit < TYPING_RATE_LIMIT_MS) {
          // Слишком частое событие, игнорируем
          return;
        }
        if (limit.count >= TYPING_RATE_LIMIT_COUNT && timeSinceLastEmit < 60000) {
          // Превышен лимит событий в минуту
          return;
        }
        limit.lastEmit = now;
        limit.count = timeSinceLastEmit < 60000 ? limit.count + 1 : 1;
      } else {
        typingRateLimits.set(key, { lastEmit: now, count: 1 });
      }

      // Очищаем старые записи rate limiting (старше 2 минут)
      // Оптимизация: очищаем при достижении 500 записей вместо 1000
      if (typingRateLimits.size > 500) {
        for (const [k, v] of typingRateLimits.entries()) {
          if (now - v.lastEmit > 120000) {
            typingRateLimits.delete(k);
          }
        }
      }
      // Отправляем статус печати всем в комнате, кроме отправителя
      socket.to(room).emit('support:typing:status', {
        ticketId,
        userId: userId, // Из аутентификации
        username: socket.data.user?.username || '', // Из аутентификации
        isTyping,
      });
    });

    // Обработка присоединения к профилю для комментариев
    socket.on('profile:join', (data) => {
      const { profileId } = data;

      if (!profileId || !isValidUUID(profileId)) {
        return;
      }

      // К профилям может присоединиться любой аутентифицированный пользователь
      const room = `profile:${profileId}`;
      socket.join(room);
    });

    // Обработка выхода из профиля
    socket.on('profile:leave', (data) => {
      const { profileId } = data;
      if (!profileId || !isValidUUID(profileId)) {
        return;
      }
      const room = `profile:${profileId}`;
      socket.leave(room);
    });

    socket.on('disconnect', () => {
      // Автоматическое отключение не логируем

      // Очищаем rate limiting для этого соединения
      for (const [key] of typingRateLimits.entries()) {
        if (key.startsWith(`${socket.id}:`)) {
          typingRateLimits.delete(key);
        }
      }
    });

    socket.on('error', (error) => {
      // Логируем только критические ошибки, не все ошибки подключения
      // Игнорируем ошибки транспорта, которые нормальны при переподключении
      if (
        error.message &&
        !error.message.includes('transport close') &&
        !error.message.includes('transport error')
      ) {
        logger.error('WebSocket error', { error: error.message });
      }
    });
  });

  // Инициализация не логируется

  // Обрабатываем очередь сообщений после инициализации
  processMessageQueue();

  // Периодическое логирование статистики (каждые 5 минут)
  setInterval(
    () => {
      if (io) {
        const rooms = new Set<string>();
        io.sockets.adapter.rooms.forEach((_, roomName) => {
          if (roomName.startsWith('ticket:')) {
            rooms.add(roomName);
          }
        });

        // Автоматическая статистика не логируется
      }
    },
    5 * 60 * 1000,
  ); // 5 минут

  return io;
}

// Интерфейс для сообщений с retry счетчиком
interface QueuedMessageWithRetry extends QueuedMessage {
  retryCount?: number;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000; // 1 секунда

/**
 * Обработать очередь сообщений с retry механизмом
 */
function processMessageQueue(): void {
  if (!io || messageQueue.length === 0) {
    return;
  }

  const now = Date.now();
  const processedMessages: QueuedMessage[] = [];
  const failedMessages: QueuedMessageWithRetry[] = [];

  for (const queuedMessage of messageQueue) {
    // Пропускаем устаревшие сообщения
    if (now - queuedMessage.timestamp > MAX_QUEUE_AGE) {
      processedMessages.push(queuedMessage); // Удаляем устаревшие
      continue;
    }

    // Проверяем retry счетчик
    const retryCount = (queuedMessage as QueuedMessageWithRetry).retryCount || 0;
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      // Превышен лимит попыток, удаляем сообщение
      logger.warn('Message queue: Max retry attempts reached, removing message', {
        type: queuedMessage.type,
        ticketId: queuedMessage.ticketId,
        retryCount,
      });
      processedMessages.push(queuedMessage);
      continue;
    }

    try {
      switch (queuedMessage.type) {
        case 'message':
          if ('message' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit(
              'support:message:new',
              queuedMessage.data as { ticketId: string; message: MessageNewData['message'] },
            );
          }
          break;
        case 'ticketUpdate':
          if ('ticket' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit(
              'support:ticket:updated',
              queuedMessage.data as { ticketId: string; ticket: TicketUpdatedData['ticket'] },
            );
          }
          break;
        case 'ticketAssignment':
          if ('assignedTo' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit(
              'support:ticket:assigned',
              queuedMessage.data as {
                ticketId: string;
                assignedTo: string | null;
                assignedUser: TicketAssignedData['assignedUser'];
              },
            );
          }
          break;
        case 'messageRead':
          if ('messageIds' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit(
              'support:message:read',
              queuedMessage.data as {
                ticketId: string;
                messageIds: string[];
                readBy: 'user' | 'support';
              },
            );
          }
          if ('messageIds' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit(
              'support:message:read',
              queuedMessage.data as {
                ticketId: string;
                messageIds: string[];
                readBy: 'user' | 'support';
              },
            );
          }
          break;
        case 'comment':
          if ('profileId' in queuedMessage.data && 'comment' in queuedMessage.data) {
            const data = queuedMessage.data as {
              profileId: string;
              comment: CommentNewData['comment'];
            };
            io.to(`profile:${data.profileId}`).emit('profile:comment:new', data);
          }
          break;
      }
      processedMessages.push(queuedMessage);
    } catch (error) {
      // Увеличиваем retry счетчик и планируем повторную попытку
      const messageWithRetry: QueuedMessageWithRetry = {
        ...queuedMessage,
        retryCount: retryCount + 1,
      };
      failedMessages.push(messageWithRetry);

      logger.error('Error processing queued message, will retry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        type: queuedMessage.type,
        ticketId: queuedMessage.ticketId,
        retryCount: retryCount + 1,
      });
    }
  }

  // Удаляем обработанные сообщения из очереди
  for (const processed of processedMessages) {
    const index = messageQueue.indexOf(processed);
    if (index > -1) {
      messageQueue.splice(index, 1);
    }
  }

  // Обновляем failed messages с новым retry счетчиком
  for (const failed of failedMessages) {
    const index = messageQueue.findIndex(
      (m) =>
        m.type === failed.type &&
        m.ticketId === failed.ticketId &&
        m.timestamp === failed.timestamp,
    );
    if (index > -1) {
      (messageQueue[index] as QueuedMessageWithRetry).retryCount = failed.retryCount;
    }
  }

  // Планируем повторную обработку failed messages через задержку
  if (failedMessages.length > 0) {
    setTimeout(() => {
      processMessageQueue();
    }, RETRY_DELAY_MS);
  }
}

/**
 * Добавить сообщение в очередь
 */
function queueMessage(
  type: QueuedMessage['type'],
  ticketId: string,
  data: QueuedMessageData,
): void {
  // Ограничиваем размер очереди
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    // Удаляем самые старые сообщения
    const removedCount = messageQueue.length - MAX_QUEUE_SIZE + 1;
    messageQueue.sort((a, b) => a.timestamp - b.timestamp);
    messageQueue.splice(0, removedCount);
    logger.warn('Message queue overflow, removed old messages', {
      removedCount,
      queueSize: messageQueue.length,
    });
  }

  messageQueue.push({
    type,
    ticketId,
    data,
    timestamp: Date.now(),
  });
}

/**
 * Получить экземпляр WebSocket сервера
 */
export function getWebSocketServer(): SocketIOServer<SupportWebSocketEvents> | null {
  return io;
}

/**
 * Отправить новое сообщение всем подписчикам тикета
 */
export function broadcastNewMessage(ticketId: string, message: MessageNewData['message']): void {
  if (!io) {
    // Пытаемся инициализировать, если сервер еще не инициализирован
    const httpServer = global.__httpServer;
    if (httpServer && !initializationAttempted) {
      // Не логируем попытки инициализации
      try {
        initWebSocketServer(httpServer);
      } catch (error) {
        logger.error('Failed to initialize WebSocket server', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Проверяем еще раз после попытки инициализации
    if (!io) {
      // Добавляем сообщение в очередь для отправки после инициализации
      queueMessage('message', ticketId, { ticketId, message });
      return;
    }
  }

  const room = `ticket:${ticketId}`;
  io!.to(room).emit('support:message:new', {
    ticketId,
    message,
  });

  // Успешные broadcast не логируются

  // Трекинг аналитики WebSocket сообщений (неблокирующий)
  import('@/lib/analytics/support-analytics')
    .then(({ trackWebSocketMessage }) => trackWebSocketMessage())
    .catch(() => {
      // Игнорируем ошибки аналитики
    });
}

/**
 * Отправить обновление тикета всем подписчикам
 */
export function broadcastTicketUpdate(ticketId: string, ticket: TicketUpdatedData['ticket']): void {
  if (!io) {
    queueMessage('ticketUpdate', ticketId, { ticketId, ticket });
    return;
  }

  const room = `ticket:${ticketId}`;
  io!.to(room).emit('support:ticket:updated', {
    ticketId,
    ticket,
  });

  // Успешные broadcast не логируются
}

/**
 * Отправить информацию о назначении тикета
 */
export function broadcastTicketAssignment(
  ticketId: string,
  assignedTo: string | null,
  assignedUser: TicketAssignedData['assignedUser'],
): void {
  if (!io) {
    queueMessage('ticketAssignment', ticketId, { ticketId, assignedTo, assignedUser });
    return;
  }

  const room = `ticket:${ticketId}`;
  io!.to(room).emit('support:ticket:assigned', {
    ticketId,
    assignedTo,
    assignedUser,
  });

  // Успешные broadcast не логируются
}

/**
 * Отправить обновление статуса прочитанности сообщений
 */
export function broadcastMessageRead(
  ticketId: string,
  messageIds: string[],
  readBy: 'user' | 'support',
): void {
  if (!io) {
    // Пытаемся инициализировать, если сервер еще не инициализирован
    const httpServer = global.__httpServer;
    if (httpServer) {
      initWebSocketServer(httpServer);
    }

    // Проверяем еще раз после попытки инициализации
    if (!io) {
      queueMessage('messageRead', ticketId, { ticketId, messageIds, readBy });
      return;
    }
  }

  const room = `ticket:${ticketId}`;
  io!.to(room).emit('support:message:read', { ticketId, messageIds, readBy });

  // Успешные broadcast не логируются
}

/**
 * Отправить новый комментарий всем подписчикам профиля
 */
export function broadcastNewComment(profileId: string, comment: CommentNewData['comment']): void {
  if (!io) {
    const httpServer = global.__httpServer;
    if (httpServer) {
      try {
        initWebSocketServer(httpServer);
      } catch {}
    }
  }

  if (io) {
    const room = `profile:${profileId}`;
    io.to(room).emit('profile:comment:new', {
      profileId,
      comment,
    });
  }
}

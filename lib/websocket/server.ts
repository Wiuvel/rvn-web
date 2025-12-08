/**
 * WebSocket сервер для системы поддержки
 * Используется для синхронизации сообщений и обновлений тикетов в реальном времени
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '@/lib/utils/secure-logger';
import type { SupportWebSocketEvents } from './events';
import { supabaseAdmin } from '@/lib/database/supabase';

// Вспомогательные типы для извлечения типов данных из событий
type MessageNewData = Parameters<SupportWebSocketEvents['support:message:new']>[0];
type TicketUpdatedData = Parameters<SupportWebSocketEvents['support:ticket:updated']>[0];
type TicketAssignedData = Parameters<SupportWebSocketEvents['support:ticket:assigned']>[0];

let io: SocketIOServer<SupportWebSocketEvents> | null = null;

// Флаг для отслеживания попыток инициализации
let initializationAttempted = false;

// Очередь сообщений для отправки после инициализации сервера
type QueuedMessageData = 
  | { ticketId: string; message: MessageNewData['message'] }
  | { ticketId: string; ticket: TicketUpdatedData['ticket'] }
  | { ticketId: string; assignedTo: string | null; assignedUser: TicketAssignedData['assignedUser'] }
  | { ticketId: string; messageIds: string[]; readBy: 'user' | 'support' };

interface QueuedMessage {
  type: 'message' | 'ticketUpdate' | 'ticketAssignment' | 'messageRead';
  ticketId: string;
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

/**
 * Инициализация WebSocket сервера
 */
export function initWebSocketServer(httpServer: HTTPServer): SocketIOServer<SupportWebSocketEvents> {
  if (io) {
    return io;
  }
  
  initializationAttempted = true;

  // Определяем разрешенные origins для CORS
  const getAllowedOrigins = (): string[] | string | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) => {
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
    
    // Добавляем localhost для разработки
    if (process.env.NODE_ENV === 'development') {
      origins.push('http://localhost:3001');
      origins.push('http://localhost:3000');
      origins.push('http://127.0.0.1:3001');
      origins.push('http://127.0.0.1:3000');
    }
    
    // Если origins пустой, разрешаем все (только для разработки)
    if (origins.length === 0) {
      return process.env.NODE_ENV === 'development' ? '*' : [];
    }
    
    // Функция для динамической проверки origin
    const originChecker = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
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
      const allowedWithoutProtocol = origins.map(o => o.replace(/^https?:\/\//, ''));
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
  
  // Обработка ошибок подключения
  io.engine.on('connection_error', (err) => {
    logger.error('WebSocket: Connection error', {
      error: err.message,
      code: err.code,
      context: err.context
    });
  });

  io.on('connection', async (socket) => {
    // Логируем подключение для диагностики
    logger.info('WebSocket: Client connected', {
      id: socket.id,
      origin: socket.handshake.headers.origin,
      transport: socket.conn.transport.name
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
        reason: reason
      });
    });

    // Обработка присоединения к тикету с валидацией
    socket.on('support:join', async (data) => {
      const { ticketId, userId, isSupport } = data;
      
      // Валидация входных данных
      if (!ticketId || !userId || typeof isSupport !== 'boolean') {
        // Не логируем валидационные ошибки - это нормальная ситуация
        socket.emit('support:error', { message: 'Invalid join request', code: 'INVALID_DATA' });
        return;
      }

      // Валидация UUID формата ticketId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(ticketId)) {
        // Не логируем валидационные ошибки
        socket.emit('support:error', { message: 'Invalid ticket ID', code: 'INVALID_TICKET_ID' });
        return;
      }

      // Проверка существования тикета (базовая валидация)
      // Примечание: Полная проверка прав доступа требует токена, который передается через cookies
      // Для полной валидации нужно использовать proxy аутентификации Socket.IO
      if (supabaseAdmin) {
        try {
          const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .select('id')
            .eq('id', ticketId)
            .single();

          if (ticketError || !ticket) {
            // Не логируем - тикет может быть удален или недоступен
            socket.emit('support:error', { message: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
            return;
          }
        } catch (error) {
          logger.error('Error validating ticket', { ticketId, error: error instanceof Error ? error.message : 'Unknown error' });
          // Не блокируем присоединение при ошибке валидации, но логируем
        }
      }

      const room = `ticket:${ticketId}`;
      socket.join(room);
      // Не логируем успешные присоединения к комнатам
    });

    // Обработка выхода из тикета
    socket.on('support:leave', (data) => {
      const { ticketId } = data;
      const room = `ticket:${ticketId}`;
      socket.leave(room);
      // Не логируем выходы из комнат
    });

    // Обработка статуса печати с rate limiting
    socket.on('support:typing', (data) => {
      const { ticketId, userId, isTyping } = data;
      
      // Валидация входных данных
      if (!ticketId || !userId || typeof isTyping !== 'boolean') {
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
      if (typingRateLimits.size > 1000) {
        for (const [k, v] of typingRateLimits.entries()) {
          if (now - v.lastEmit > 120000) {
            typingRateLimits.delete(k);
          }
        }
      }

      const room = `ticket:${ticketId}`;
      // Отправляем статус печати всем в комнате, кроме отправителя
      socket.to(room).emit('support:typing:status', {
        ticketId,
        userId,
        username: '', // Будет заполнено на клиенте
        isTyping,
      });
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
      if (error.message && !error.message.includes('transport close') && !error.message.includes('transport error')) {
        logger.error('WebSocket error', { error: error.message });
      }
    });
  });

  // Инициализация не логируется
  
  // Обрабатываем очередь сообщений после инициализации
  processMessageQueue();
  
  // Периодическое логирование статистики (каждые 5 минут)
  setInterval(() => {
    if (io) {
      const rooms = new Set<string>();
      io.sockets.adapter.rooms.forEach((_, roomName) => {
        if (roomName.startsWith('ticket:')) {
          rooms.add(roomName);
        }
      });
      
      // Автоматическая статистика не логируется
    }
  }, 5 * 60 * 1000); // 5 минут
  
  return io;
}

/**
 * Обработать очередь сообщений
 */
function processMessageQueue(): void {
  if (!io || messageQueue.length === 0) {
    return;
  }

  const now = Date.now();
  const processedMessages: QueuedMessage[] = [];

  for (const queuedMessage of messageQueue) {
    // Пропускаем устаревшие сообщения
    if (now - queuedMessage.timestamp > MAX_QUEUE_AGE) {
      continue;
    }

    try {
      switch (queuedMessage.type) {
        case 'message':
          if ('message' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit('support:message:new', queuedMessage.data as { ticketId: string; message: MessageNewData['message'] });
          }
          break;
        case 'ticketUpdate':
          if ('ticket' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit('support:ticket:updated', queuedMessage.data as { ticketId: string; ticket: TicketUpdatedData['ticket'] });
          }
          break;
        case 'ticketAssignment':
          if ('assignedTo' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit('support:ticket:assigned', queuedMessage.data as { ticketId: string; assignedTo: string | null; assignedUser: TicketAssignedData['assignedUser'] });
          }
          break;
        case 'messageRead':
          if ('messageIds' in queuedMessage.data) {
            io.to(`ticket:${queuedMessage.ticketId}`).emit('support:message:read', queuedMessage.data as { ticketId: string; messageIds: string[]; readBy: 'user' | 'support' });
          }
          break;
      }
      processedMessages.push(queuedMessage);
    } catch (error) {
      logger.error('Error processing queued message', {
        error: error instanceof Error ? error.message : 'Unknown error'
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

  // Не логируем успешную обработку очереди
}

/**
 * Добавить сообщение в очередь
 */
function queueMessage(type: QueuedMessage['type'], ticketId: string, data: QueuedMessageData): void {
  // Ограничиваем размер очереди
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    // Удаляем самые старые сообщения
    const removedCount = messageQueue.length - MAX_QUEUE_SIZE + 1;
    messageQueue.sort((a, b) => a.timestamp - b.timestamp);
    messageQueue.splice(0, removedCount);
    logger.warn('Message queue overflow, removed old messages', {
      removedCount,
      queueSize: messageQueue.length
    });
  }

  messageQueue.push({
    type,
    ticketId,
    data,
    timestamp: Date.now()
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
export function broadcastNewMessage(
  ticketId: string,
  message: MessageNewData['message']
): void {
  if (!io) {
    // Пытаемся инициализировать, если сервер еще не инициализирован
    const httpServer = global.__httpServer;
    if (httpServer && !initializationAttempted) {
      // Не логируем попытки инициализации
      try {
        initWebSocketServer(httpServer);
      } catch (error) {
        logger.error('Failed to initialize WebSocket server', {
          error: error instanceof Error ? error.message : 'Unknown error'
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
export function broadcastTicketUpdate(
  ticketId: string,
  ticket: TicketUpdatedData['ticket']
): void {
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
  assignedUser: TicketAssignedData['assignedUser']
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
  readBy: 'user' | 'support'
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



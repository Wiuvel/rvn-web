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

  io = new SocketIOServer<SupportWebSocketEvents>(httpServer, {
    path: '/api/socket',
    cors: {
      origin: process.env.PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_SUPABASE_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    // Отключаем perMessageDeflate для избежания ошибок с bufferUtil
    // bufferutil и utf-8-validate установлены как опциональные зависимости
    perMessageDeflate: false,
  });

  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id });

    // Обработка присоединения к тикету с валидацией
    socket.on('support:join', async (data) => {
      const { ticketId, userId, isSupport } = data;
      
      // Валидация входных данных
      if (!ticketId || !userId || typeof isSupport !== 'boolean') {
        logger.warn('Invalid join request', { socketId: socket.id, data });
        socket.emit('support:error', { message: 'Invalid join request', code: 'INVALID_DATA' });
        return;
      }

      // Валидация UUID формата ticketId
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(ticketId)) {
        logger.warn('Invalid ticket ID format', { socketId: socket.id, ticketId });
        socket.emit('support:error', { message: 'Invalid ticket ID', code: 'INVALID_TICKET_ID' });
        return;
      }

      // Проверка существования тикета (базовая валидация)
      // Примечание: Полная проверка прав доступа требует токена, который передается через cookies
      // Для полной валидации нужно использовать middleware аутентификации Socket.IO
      if (supabaseAdmin) {
        try {
          const { data: ticket, error: ticketError } = await supabaseAdmin
            .from('support_tickets')
            .select('id')
            .eq('id', ticketId)
            .single();

          if (ticketError || !ticket) {
            logger.warn('Ticket not found', { socketId: socket.id, ticketId, error: ticketError?.message });
            socket.emit('support:error', { message: 'Ticket not found', code: 'TICKET_NOT_FOUND' });
            return;
          }
        } catch (error) {
          logger.error('Error validating ticket', { socketId: socket.id, ticketId, error: error instanceof Error ? error.message : 'Unknown error' });
          // Не блокируем присоединение при ошибке валидации, но логируем
        }
      }

      const room = `ticket:${ticketId}`;
      socket.join(room);
      logger.info('Client joined ticket room', { socketId: socket.id, ticketId, userId, isSupport });
    });

    // Обработка выхода из тикета
    socket.on('support:leave', (data) => {
      const { ticketId } = data;
      const room = `ticket:${ticketId}`;
      socket.leave(room);
      logger.info('Client left ticket room', { socketId: socket.id, ticketId });
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
          logger.warn('Typing rate limit exceeded', { socketId: socket.id, ticketId, userId });
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
      logger.info('WebSocket client disconnected', { socketId: socket.id });
      
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
        logger.error('WebSocket error', { socketId: socket.id, error: error.message });
      }
    });
  });

  logger.info('WebSocket server initialized');
  
  // Обрабатываем очередь сообщений после инициализации
  processMessageQueue();
  
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
        error: error instanceof Error ? error.message : 'Unknown error',
        type: queuedMessage.type,
        ticketId: queuedMessage.ticketId
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

  if (processedMessages.length > 0) {
    logger.info('Processed queued messages', { count: processedMessages.length });
  }
}

/**
 * Добавить сообщение в очередь
 */
function queueMessage(type: QueuedMessage['type'], ticketId: string, data: QueuedMessageData): void {
  // Ограничиваем размер очереди
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    // Удаляем самые старые сообщения
    messageQueue.sort((a, b) => a.timestamp - b.timestamp);
    messageQueue.splice(0, messageQueue.length - MAX_QUEUE_SIZE + 1);
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
      logger.warn('WebSocket server not initialized, attempting to initialize...');
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
      logger.warn('WebSocket server not initialized, queuing message', {
        ticketId,
        messageId: message.id,
        initializationAttempted
      });
      // Добавляем сообщение в очередь для отправки после инициализации
      queueMessage('message', ticketId, { ticketId, message });
      return;
    }
  }

  const room = `ticket:${ticketId}`;
  io.to(room).emit('support:message:new', {
    ticketId,
    message,
  });

  logger.info('Broadcasted new message', { 
    ticketId, 
    messageId: message.id,
    senderType: message.sender_type,
    roomClients: io.sockets.adapter.rooms.get(room)?.size || 0
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
    logger.warn('WebSocket server not initialized, queuing ticket update');
    queueMessage('ticketUpdate', ticketId, { ticketId, ticket });
    return;
  }

  const room = `ticket:${ticketId}`;
  io.to(room).emit('support:ticket:updated', {
    ticketId,
    ticket,
  });

  logger.info('Broadcasted ticket update', { ticketId, status: ticket.status });
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
    logger.warn('WebSocket server not initialized, queuing ticket assignment');
    queueMessage('ticketAssignment', ticketId, { ticketId, assignedTo, assignedUser });
    return;
  }

  const room = `ticket:${ticketId}`;
  io.to(room).emit('support:ticket:assigned', {
    ticketId,
    assignedTo,
    assignedUser,
  });

  logger.info('Broadcasted ticket assignment', { ticketId, assignedTo });
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
      logger.warn('WebSocket server not initialized, attempting to initialize...');
      initWebSocketServer(httpServer);
    }
    
    // Проверяем еще раз после попытки инициализации
    if (!io) {
      logger.warn('WebSocket server not initialized, queuing message read status');
      queueMessage('messageRead', ticketId, { ticketId, messageIds, readBy });
      return;
    }
  }

  const room = `ticket:${ticketId}`;
  io.to(room).emit('support:message:read', { ticketId, messageIds, readBy });
  logger.info('Broadcasted message read status', { ticketId, messageIds: messageIds.length, readBy });
}



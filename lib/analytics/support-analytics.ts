/**
 * Система аналитики для поддержки
 * Использует Redis для хранения метрик и событий
 */

import { getRedisClient } from '@/lib/database/redis';
import { logger } from '@/lib/utils/secure-logger';

// Ключи для Redis
const REDIS_KEYS = {
  // Счетчики
  TICKETS_CREATED: 'analytics:support:tickets:created',
  TICKETS_CLOSED: 'analytics:support:tickets:closed',
  MESSAGES_SENT: 'analytics:support:messages:sent',
  TICKETS_BY_STATUS: 'analytics:support:tickets:by_status',

  // Временные серии (по дням)
  TICKETS_CREATED_DAILY: 'analytics:support:tickets:created:daily',
  TICKETS_CLOSED_DAILY: 'analytics:support:tickets:closed:daily',
  MESSAGES_SENT_DAILY: 'analytics:support:messages:sent:daily',

  // Временные серии (по часам)
  TICKETS_CREATED_HOURLY: 'analytics:support:tickets:created:hourly',
  MESSAGES_SENT_HOURLY: 'analytics:support:messages:sent:hourly',

  // Средние значения
  AVG_RESPONSE_TIME: 'analytics:support:avg_response_time',
  AVG_RESOLUTION_TIME: 'analytics:support:avg_resolution_time',

  // WebSocket метрики
  WEBSOCKET_CONNECTIONS: 'analytics:support:websocket:connections',
  WEBSOCKET_MESSAGES: 'analytics:support:websocket:messages',
} as const;

/**
 * Получить ключ для временной серии (день)
 */
function getDailyKey(baseKey: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  return `${baseKey}:${dateStr}`;
}

/**
 * Получить ключ для временной серии (час)
 */
function getHourlyKey(baseKey: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  const hour = d.getUTCHours();
  return `${baseKey}:${dateStr}:${hour}`;
}

/**
 * Записать событие создания тикета
 */
export async function trackTicketCreated(
  ticketId: string,
  userId: string,
  status: string,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    // Проверяем состояние соединения и переподключаемся при необходимости
    if (client.status !== 'ready') {
      try {
        await client.connect();
      } catch {
        // Redis необязателен - не логируем ошибки переподключения
        return;
      }
    }

    const now = new Date();

    // Увеличиваем счетчики
    await Promise.all([
      client.incr(REDIS_KEYS.TICKETS_CREATED),
      client.incr(getDailyKey(REDIS_KEYS.TICKETS_CREATED_DAILY, now)),
      client.incr(getHourlyKey(REDIS_KEYS.TICKETS_CREATED_HOURLY, now)),
      client.hincrby(REDIS_KEYS.TICKETS_BY_STATUS, status, 1),
    ]);

    // Сохраняем информацию о тикете для расчета времени ответа
    await client.setex(
      `analytics:support:ticket:${ticketId}:created`,
      86400 * 30,
      now.toISOString(),
    ); // 30 дней
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Если ошибка связана с закрытым соединением, не логируем как ошибку
    // Redis необязателен для работы системы
    if (
      errorMessage.includes('Connection is closed') ||
      errorMessage.includes('Connection closed')
    ) {
      // Не логируем - Redis необязателен
      return;
    }

    // Логируем только другие ошибки
    logger.error('Error tracking ticket creation', {
      error: errorMessage,
      ticketId,
    });
  }
}

/**
 * Записать событие закрытия тикета
 */
export async function trackTicketClosed(
  ticketId: string,
  userId: string,
  status: string,
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    // Проверяем состояние соединения и переподключаемся при необходимости
    if (client.status !== 'ready') {
      try {
        await client.connect();
      } catch {
        // Redis необязателен - не логируем ошибки переподключения
        return;
      }
    }

    const now = new Date();

    // Увеличиваем счетчики
    await Promise.all([
      client.incr(REDIS_KEYS.TICKETS_CLOSED),
      client.incr(getDailyKey(REDIS_KEYS.TICKETS_CLOSED_DAILY, now)),
      client.hincrby(REDIS_KEYS.TICKETS_BY_STATUS, status, -1), // Уменьшаем счетчик открытых
      client.hincrby(REDIS_KEYS.TICKETS_BY_STATUS, 'closed', 1), // Увеличиваем счетчик закрытых
    ]);

    // Рассчитываем время решения
    const createdTime = await client.get(`analytics:support:ticket:${ticketId}:created`);
    if (createdTime) {
      const created = new Date(createdTime);
      const resolutionTime = now.getTime() - created.getTime(); // в миллисекундах

      // Обновляем среднее время решения (используем скользящее среднее)
      const currentAvg = await client.get(REDIS_KEYS.AVG_RESOLUTION_TIME);
      if (currentAvg) {
        const avg = parseFloat(currentAvg);
        const newAvg = avg * 0.9 + (resolutionTime / 1000 / 60) * 0.1; // в минутах, экспоненциальное сглаживание
        await client.set(REDIS_KEYS.AVG_RESOLUTION_TIME, newAvg.toString());
      } else {
        await client.set(REDIS_KEYS.AVG_RESOLUTION_TIME, (resolutionTime / 1000 / 60).toString());
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Если ошибка связана с закрытым соединением, не логируем как ошибку
    // Redis необязателен для работы системы
    if (
      errorMessage.includes('Connection is closed') ||
      errorMessage.includes('Connection closed')
    ) {
      // Не логируем - Redis необязателен
      return;
    }

    // Логируем только другие ошибки
    logger.error('Error tracking ticket closure', {
      error: errorMessage,
      ticketId,
    });
  }
}

/**
 * Записать событие отправки сообщения
 */
export async function trackMessageSent(
  ticketId: string,
  userId: string,
  senderType: 'user' | 'support' | 'system',
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    // Проверяем состояние соединения и переподключаемся при необходимости
    if (client.status !== 'ready') {
      try {
        await client.connect();
      } catch {
        // Redis необязателен - не логируем ошибки переподключения
        return;
      }
    }

    const now = new Date();

    // Увеличиваем счетчики
    await Promise.all([
      client.incr(REDIS_KEYS.MESSAGES_SENT),
      client.incr(getDailyKey(REDIS_KEYS.MESSAGES_SENT_DAILY, now)),
      client.incr(getHourlyKey(REDIS_KEYS.MESSAGES_SENT_HOURLY, now)),
    ]);

    // Если сообщение от поддержки, рассчитываем время ответа
    if (senderType === 'support') {
      const createdTime = await client.get(`analytics:support:ticket:${ticketId}:created`);
      if (createdTime) {
        const created = new Date(createdTime);
        const responseTime = now.getTime() - created.getTime(); // в миллисекундах

        // Обновляем среднее время ответа
        const currentAvg = await client.get(REDIS_KEYS.AVG_RESPONSE_TIME);
        if (currentAvg) {
          const avg = parseFloat(currentAvg);
          const newAvg = avg * 0.9 + (responseTime / 1000 / 60) * 0.1; // в минутах
          await client.set(REDIS_KEYS.AVG_RESPONSE_TIME, newAvg.toString());
        } else {
          await client.set(REDIS_KEYS.AVG_RESPONSE_TIME, (responseTime / 1000 / 60).toString());
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Если ошибка связана с закрытым соединением, не логируем как ошибку
    // Redis необязателен для работы системы
    if (
      errorMessage.includes('Connection is closed') ||
      errorMessage.includes('Connection closed')
    ) {
      // Не логируем - Redis необязателен
      return;
    }

    // Логируем только другие ошибки
    logger.error('Error tracking message sent', {
      error: errorMessage,
      ticketId,
    });
  }
}

/**
 * Записать событие WebSocket подключения
 */
export async function trackWebSocketConnection(): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.incr(REDIS_KEYS.WEBSOCKET_CONNECTIONS);
  } catch (error) {
    logger.error('Error tracking WebSocket connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Записать событие WebSocket сообщения
 */
export async function trackWebSocketMessage(): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.incr(REDIS_KEYS.WEBSOCKET_MESSAGES);
  } catch (error) {
    logger.error('Error tracking WebSocket message', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Получить статистику за период
 */
export interface SupportAnalytics {
  // Общие метрики
  totalTicketsCreated: number;
  totalTicketsClosed: number;
  totalMessagesSent: number;

  // По статусам
  ticketsByStatus: Record<string, number>;

  // Средние значения
  avgResponseTime: number; // в минутах
  avgResolutionTime: number; // в минутах

  // Временные серии (последние 30 дней)
  ticketsCreatedDaily: Array<{ date: string; count: number }>;
  ticketsClosedDaily: Array<{ date: string; count: number }>;
  messagesSentDaily: Array<{ date: string; count: number }>;

  // Временные серии (последние 24 часа)
  ticketsCreatedHourly: Array<{ hour: number; count: number }>;
  messagesSentHourly: Array<{ hour: number; count: number }>;

  // WebSocket метрики
  websocketConnections: number;
  websocketMessages: number;

  // Период аналитики
  period: AnalyticsPeriod;
}

export type AnalyticsPeriod = 'hour' | 'day' | 'week' | 'month';

export async function getSupportAnalytics(
  period: AnalyticsPeriod = 'month',
): Promise<SupportAnalytics> {
  const client = getRedisClient();
  if (!client) {
    // Redis необязателен - не логируем
    // Возвращаем пустую аналитику вместо null, если Redis не подключен
    return {
      totalTicketsCreated: 0,
      totalTicketsClosed: 0,
      totalMessagesSent: 0,
      ticketsByStatus: {},
      avgResponseTime: 0,
      avgResolutionTime: 0,
      ticketsCreatedDaily: [],
      ticketsClosedDaily: [],
      messagesSentDaily: [],
      ticketsCreatedHourly: [],
      messagesSentHourly: [],
      websocketConnections: 0,
      websocketMessages: 0,
      period,
    };
  }

  // Проверяем состояние соединения
  if (client.status !== 'ready') {
    // Автоматическое переподключение не логируется
    try {
      await client.connect();
    } catch (error) {
      logger.error('Failed to reconnect to Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Возвращаем пустую аналитику при ошибке переподключения
      return {
        totalTicketsCreated: 0,
        totalTicketsClosed: 0,
        totalMessagesSent: 0,
        ticketsByStatus: {},
        avgResponseTime: 0,
        avgResolutionTime: 0,
        ticketsCreatedDaily: [],
        ticketsClosedDaily: [],
        messagesSentDaily: [],
        ticketsCreatedHourly: [],
        messagesSentHourly: [],
        websocketConnections: 0,
        websocketMessages: 0,
        period,
      };
    }
  }

  try {
    // Получаем общие счетчики
    const [
      totalTicketsCreatedRaw,
      totalTicketsClosedRaw,
      totalMessagesSentRaw,
      ticketsByStatus,
      avgResponseTimeRaw,
      avgResolutionTimeRaw,
      websocketConnectionsRaw,
      websocketMessagesRaw,
    ] = await Promise.all([
      client.get(REDIS_KEYS.TICKETS_CREATED),
      client.get(REDIS_KEYS.TICKETS_CLOSED),
      client.get(REDIS_KEYS.MESSAGES_SENT),
      client.hgetall(REDIS_KEYS.TICKETS_BY_STATUS),
      client.get(REDIS_KEYS.AVG_RESPONSE_TIME),
      client.get(REDIS_KEYS.AVG_RESOLUTION_TIME),
      client.get(REDIS_KEYS.WEBSOCKET_CONNECTIONS),
      client.get(REDIS_KEYS.WEBSOCKET_MESSAGES),
    ]);

    // Обрабатываем null значения
    const totalTicketsCreated = totalTicketsCreatedRaw || '0';
    const totalTicketsClosed = totalTicketsClosedRaw || '0';
    const totalMessagesSent = totalMessagesSentRaw || '0';
    const avgResponseTime = avgResponseTimeRaw || '0';
    const avgResolutionTime = avgResolutionTimeRaw || '0';
    const websocketConnections = websocketConnectionsRaw || '0';
    const websocketMessages = websocketMessagesRaw || '0';

    // Определяем количество дней/часов в зависимости от периода
    let daysToFetch = 30;
    let hoursToFetch = 24;

    switch (period) {
      case 'hour':
        daysToFetch = 0;
        hoursToFetch = 1;
        break;
      case 'day':
        daysToFetch = 1;
        hoursToFetch = 24;
        break;
      case 'week':
        daysToFetch = 7;
        hoursToFetch = 24;
        break;
      case 'month':
        daysToFetch = 30;
        hoursToFetch = 24;
        break;
    }

    // Получаем данные за период (по дням)
    const ticketsCreatedDaily: Array<{ date: string; count: number }> = [];
    const ticketsClosedDaily: Array<{ date: string; count: number }> = [];
    const messagesSentDaily: Array<{ date: string; count: number }> = [];

    if (daysToFetch > 0) {
      for (let i = daysToFetch - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const [created, closed, messages] = await Promise.all([
          client.get(getDailyKey(REDIS_KEYS.TICKETS_CREATED_DAILY, date)),
          client.get(getDailyKey(REDIS_KEYS.TICKETS_CLOSED_DAILY, date)),
          client.get(getDailyKey(REDIS_KEYS.MESSAGES_SENT_DAILY, date)),
        ]);

        ticketsCreatedDaily.push({ date: dateStr, count: parseInt(created || '0', 10) });
        ticketsClosedDaily.push({ date: dateStr, count: parseInt(closed || '0', 10) });
        messagesSentDaily.push({ date: dateStr, count: parseInt(messages || '0', 10) });
      }
    }

    // Получаем данные за период (по часам)
    const ticketsCreatedHourly: Array<{ hour: number; count: number }> = [];
    const messagesSentHourly: Array<{ hour: number; count: number }> = [];

    if (hoursToFetch > 0) {
      const now = new Date();

      if (period === 'hour') {
        // Для периода "1 час" получаем данные только за текущий час
        const currentHour = now.getUTCHours();
        const date = new Date(now);
        date.setUTCHours(currentHour, 0, 0, 0);

        const [created, messages] = await Promise.all([
          client.get(getHourlyKey(REDIS_KEYS.TICKETS_CREATED_HOURLY, date)),
          client.get(getHourlyKey(REDIS_KEYS.MESSAGES_SENT_HOURLY, date)),
        ]);

        ticketsCreatedHourly.push({ hour: currentHour, count: parseInt(created || '0', 10) });
        messagesSentHourly.push({ hour: currentHour, count: parseInt(messages || '0', 10) });
      } else {
        // Для остальных периодов получаем данные за последние 24 часа
        for (let hour = 0; hour < 24; hour++) {
          const date = new Date(now);
          date.setUTCHours(hour, 0, 0, 0);

          const [created, messages] = await Promise.all([
            client.get(getHourlyKey(REDIS_KEYS.TICKETS_CREATED_HOURLY, date)),
            client.get(getHourlyKey(REDIS_KEYS.MESSAGES_SENT_HOURLY, date)),
          ]);

          ticketsCreatedHourly.push({ hour, count: parseInt(created || '0', 10) });
          messagesSentHourly.push({ hour, count: parseInt(messages || '0', 10) });
        }
      }
    }

    // Преобразуем ticketsByStatus в объект
    const statusMap: Record<string, number> = {};
    for (const [status, count] of Object.entries(ticketsByStatus)) {
      statusMap[status] = parseInt(count || '0', 10);
    }

    return {
      totalTicketsCreated: parseInt(totalTicketsCreated, 10),
      totalTicketsClosed: parseInt(totalTicketsClosed, 10),
      totalMessagesSent: parseInt(totalMessagesSent, 10),
      ticketsByStatus: statusMap,
      avgResponseTime: parseFloat(avgResponseTime) || 0,
      avgResolutionTime: parseFloat(avgResolutionTime) || 0,
      ticketsCreatedDaily,
      ticketsClosedDaily,
      messagesSentDaily,
      ticketsCreatedHourly,
      messagesSentHourly,
      websocketConnections: parseInt(websocketConnections, 10),
      websocketMessages: parseInt(websocketMessages, 10),
      period,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Если ошибка связана с закрытым соединением, логируем как предупреждение
    if (
      errorMessage.includes('Connection is closed') ||
      errorMessage.includes('Connection closed')
    ) {
      logger.warn('Redis connection closed during analytics fetch', {
        error: errorMessage,
      });
    } else {
      logger.error('Error getting support analytics', {
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    // Возвращаем пустую аналитику вместо null при ошибке
    return {
      totalTicketsCreated: 0,
      totalTicketsClosed: 0,
      totalMessagesSent: 0,
      ticketsByStatus: {},
      avgResponseTime: 0,
      avgResolutionTime: 0,
      ticketsCreatedDaily: [],
      ticketsClosedDaily: [],
      messagesSentDaily: [],
      ticketsCreatedHourly: [],
      messagesSentHourly: [],
      websocketConnections: 0,
      websocketMessages: 0,
      period,
    };
  }
}

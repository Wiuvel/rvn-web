/**
 * Хук для работы с WebSocket в системе поддержки
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import type { SupportWebSocketEvents } from '@/lib/websocket/events';

// Используем ReturnType для получения типа Socket из функции io
type SocketType = ReturnType<typeof io>;

interface UseWebSocketOptions {
  enabled?: boolean;
  userId?: string;
  ticketId?: string;
  isSupport?: boolean;
  token?: string; // dashboard_token для аутентификации
}

interface UseWebSocketReturn {
  socket: SocketType | null;
  isConnected: boolean;
  joinTicket: (ticketId: string) => void;
  leaveTicket: (ticketId: string) => void;
  sendTyping: (ticketId: string, isTyping: boolean) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { enabled = true, userId, ticketId, isSupport = false, token } = options;
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<SocketType | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const currentTokenRef = useRef<string | undefined>(undefined); // Отслеживаем текущий токен
  const currentTicketIdRef = useRef<string | undefined>(undefined); // Отслеживаем текущий тикет
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Debounce для переподключения
  const isConnectingRef = useRef<boolean>(false); // Предотвращаем множественные попытки подключения

  useEffect(() => {
    // Очищаем таймер при размонтировании
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  // Эффект для подключения WebSocket - подключается один раз при наличии токена
  // НЕ зависит от ticketId, чтобы избежать переподключений при смене тикета
  useEffect(() => {
    // Очищаем предыдущий таймер переподключения
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!enabled || typeof window === 'undefined') {
      // Если WebSocket отключен, очищаем соединение
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      currentTokenRef.current = undefined;
      isConnectingRef.current = false;
      return;
    }

    // Если токен еще не получен, не создаем соединение
    // Это предотвращает множественные подключения при изменении token с undefined на значение
    if (!token) {
      // Информационное сообщение только в dev режиме для дебага загрузки сообщений
      if (process.env.NODE_ENV === 'development') {
        console.info('%cWebSocket: No token available. Skipping connection..', 'color: #a855f7; font-weight: 500;');
      }
      // Очищаем предыдущее соединение, если токен был удален
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      currentTokenRef.current = undefined;
      isConnectingRef.current = false;
      return;
    }

    // Проверяем, нужно ли переподключаться (только если токен изменился)
    if (currentTokenRef.current === token && socketRef.current?.connected) {
      // Токен не изменился и соединение активно - не переподключаемся
      return;
    }

    // Debounce для переподключения - предотвращаем множественные попытки при быстрой смене токена
    // Это особенно важно при первой загрузке страницы, когда токен загружается асинхронно
    // Задержка 100ms предотвращает циклические переподключения при быстрой загрузке данных
    reconnectTimeoutRef.current = setTimeout(() => {
      isConnectingRef.current = false;

      // Очищаем предыдущее соединение перед созданием нового (только если токен изменился)
      if (cleanupRef.current && currentTokenRef.current !== token) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
      // Сохраняем текущий токен для проверки в следующий раз
      currentTokenRef.current = token;

      // Если соединение уже существует и токен не изменился, не переподключаемся
      if (socketRef.current?.connected && currentTokenRef.current === token) {
        return;
      }

      // Создаем новое соединение (используем текущий домен)
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '');
      
      // Получаем токен из параметров
      // ВАЖНО: dashboard_token установлен как httpOnly cookie, поэтому JavaScript не может его прочитать
      // Токен должен быть передан через параметр token из компонента, который получает его из API ответа
      const authToken = token;
      
      const socket = io(wsUrl, {
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false,
        autoConnect: true,
        auth: {
          token: authToken || undefined // Передаем токен для аутентификации
        }
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsConnected(true);
        isConnectingRef.current = false;
        // Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
          console.log('WebSocket connected');
        }
        // При подключении автоматически присоединяемся к текущему тикету, если он есть
        if (currentTicketIdRef.current) {
          socket.emit('support:join', { ticketId: currentTicketIdRef.current });
          if (process.env.NODE_ENV === 'development') {
            console.log(`WebSocket: Auto-joined room ticket:${currentTicketIdRef.current} after connection`);
          }
        }
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        isConnectingRef.current = false;
        // Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
          console.log('WebSocket disconnected');
        }
      });

      socket.on('connect_error', (error: Error) => {
        setIsConnected(false);
        isConnectingRef.current = false;
        // Логируем ошибки подключения для диагностики
        console.error('WebSocket connection error:', {
          message: error.message,
          type: error.name,
          url: wsUrl,
          path: '/api/socket'
        });
        
        // Специальная обработка ошибок аутентификации
        if (error.message.includes('Authentication') || error.message.includes('Invalid token') || error.message.includes('Authentication required')) {
          console.error('WebSocket authentication failed - token may be invalid or expired');
          // Токен может быть невалидным или истекшим
          // В этом случае нужно обновить токен через API или перенаправить на страницу входа
          // НЕ пытаемся переподключиться автоматически с невалидным токеном
          currentTokenRef.current = undefined; // Сбрасываем токен чтобы не пытаться снова
        }
        
        // Если ошибка связана с CORS или origin, показываем более детальную информацию
        if (error.message.includes('CORS') || error.message.includes('origin')) {
          console.error('WebSocket CORS error - check server CORS configuration');
        }
      });

      // Обработчик общих ошибок WebSocket
      // Socket.IO автоматически обрабатывает большинство ошибок через connect_error
      // Этот обработчик нужен только для критических ошибок
      socket.on('error', (error: Error) => {
        // Игнорируем ошибки транспорта, которые нормальны при переподключении
        if (error.message && !error.message.includes('transport')) {
          // Логируем только в dev режиме
          if (process.env.NODE_ENV === 'development') {
            console.warn('WebSocket error:', error.message);
          }
        }
      });

      // Функция очистки
      const cleanup = () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('error');
        // Всегда отключаем socket при cleanup для предотвращения утечек памяти
        socket.disconnect();
        socketRef.current = null;
      };

      cleanupRef.current = cleanup;
      isConnectingRef.current = true;
    }, 100); // Debounce 100ms для предотвращения циклических переподключений

    // Возвращаем cleanup функцию для очистки при unmount или изменении зависимостей
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // ВАЖНО: только enabled и token в зависимостях - при изменении токена WebSocket переподключится
    // ticketId, userId, isSupport НЕ должны вызывать переподключение
  }, [enabled, token]);

  // Отдельный эффект для отслеживания изменений ticketId и автоматического join/leave комнат
  // Это позволяет менять комнаты без переподключения WebSocket
  useEffect(() => {
    const socket = socketRef.current;
    const previousTicketId = currentTicketIdRef.current;

    // Если ticketId не изменился, ничего не делаем
    if (previousTicketId === ticketId) {
      return;
    }

    // Если есть предыдущий тикет и соединение активно, выходим из старой комнаты
    if (previousTicketId && socket?.connected) {
      socket.emit('support:leave', { ticketId: previousTicketId });
      if (process.env.NODE_ENV === 'development') {
        console.log(`WebSocket: Left room ticket:${previousTicketId}`);
      }
    }

    // Обновляем текущий ticketId
    currentTicketIdRef.current = ticketId || undefined;

    // Если есть новый тикет и соединение активно, присоединяемся к новой комнате
    if (ticketId && socket?.connected) {
      socket.emit('support:join', { ticketId });
      if (process.env.NODE_ENV === 'development') {
        console.log(`WebSocket: Joined room ticket:${ticketId}`);
      }
    } else if (ticketId && socket && !socket.connected) {
      // Если соединение еще не установлено, присоединимся после подключения
      // Используем once, чтобы избежать множественных подписок
      const onConnect = () => {
        // Проверяем, что ticketId не изменился пока мы ждали подключения
        if (currentTicketIdRef.current === ticketId && socket.connected) {
          socket.emit('support:join', { ticketId });
          if (process.env.NODE_ENV === 'development') {
            console.log(`WebSocket: Joined room ticket:${ticketId} after connection`);
          }
        }
      };
      socket.once('connect', onConnect);
    }
  }, [ticketId]);

  const joinTicket = useCallback((ticketId: string) => {
    if (socketRef.current) {
      // userId и isSupport теперь не нужны - они берутся из аутентификации
      socketRef.current.emit('support:join', { ticketId });
    }
  }, []);

  const leaveTicket = useCallback((ticketId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('support:leave', { ticketId });
    }
  }, []);

  const sendTyping = useCallback((ticketId: string, isTyping: boolean) => {
    if (socketRef.current) {
      // userId теперь не нужен - он берется из аутентификации
      socketRef.current.emit('support:typing', { ticketId, isTyping });
    }
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    joinTicket,
    leaveTicket,
    sendTyping,
  };
}


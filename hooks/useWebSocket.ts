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
      currentTicketIdRef.current = undefined;
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
      currentTicketIdRef.current = undefined;
      isConnectingRef.current = false;
      return;
    }

    // Если соединение уже существует, активно и токен не изменился - переиспользуем его
    if (socketRef.current && socketRef.current.connected && currentTokenRef.current === token) {
      // Соединение уже активно с тем же токеном, просто обновляем присоединение к тикету если изменился
      if (ticketId && currentTicketIdRef.current !== ticketId) {
        socketRef.current.emit('support:join', { ticketId });
        currentTicketIdRef.current = ticketId;
      } else if (!ticketId && currentTicketIdRef.current) {
        // Если тикет был удален, покидаем предыдущий
        socketRef.current.emit('support:leave', { ticketId: currentTicketIdRef.current });
        currentTicketIdRef.current = undefined;
      }
      // Возвращаем пустую cleanup функцию, чтобы не пересоздавать соединение
      return () => {
        // Cleanup не нужен, так как соединение переиспользуется
      };
    }

    // Debounce для переподключения - предотвращаем множественные попытки при быстрой смене токена
    // Это особенно важно при первой загрузке страницы, когда токен загружается асинхронно
    // Задержка 100ms предотвращает циклические переподключения при быстрой загрузке данных
    reconnectTimeoutRef.current = setTimeout(() => {
      isConnectingRef.current = false;
      
      // Проверяем еще раз, что токен не изменился за время debounce
      if (currentTokenRef.current === token && socketRef.current?.connected) {
        // Обновляем тикет если нужно
        if (ticketId && currentTicketIdRef.current !== ticketId) {
          socketRef.current.emit('support:join', { ticketId });
          currentTicketIdRef.current = ticketId;
        }
        return; // Токен уже обработан, соединение уже установлено
      }

      // Если токен изменился или соединение не активно - переподключаемся
      // Очищаем предыдущее соединение перед созданием нового
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
      // Сохраняем текущий токен для проверки в следующий раз
      currentTokenRef.current = token;
      currentTicketIdRef.current = ticketId || undefined;

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

      // Автоматически присоединяемся к тикету после подключения
      const onConnect = () => {
        if (currentTicketIdRef.current) {
          // userId и isSupport теперь не нужны - они берутся из аутентификации
          socket.emit('support:join', { ticketId: currentTicketIdRef.current });
        }
      };

      // Если уже подключен, присоединяемся сразу
      if (socket.connected) {
        onConnect();
      } else {
        socket.once('connect', onConnect);
      }

      // Функция очистки
      const cleanup = () => {
        if (currentTicketIdRef.current && socket.connected) {
          socket.emit('support:leave', { ticketId: currentTicketIdRef.current });
        }
        socket.off('connect', onConnect);
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
    // ВАЖНО: token в зависимостях - при изменении токена WebSocket переподключится
    // Это важно для обновления токена после истечения или изменения
  }, [enabled, ticketId, userId, isSupport, token]);

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


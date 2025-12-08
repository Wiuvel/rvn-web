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

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    // Очищаем предыдущее соединение, если оно существует
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Если соединение уже существует и активно, переиспользуем его
    if (socketRef.current && socketRef.current.connected) {
      // Соединение уже активно, просто обновляем присоединение к тикету
      if (ticketId) {
        socketRef.current.emit('support:join', { ticketId });
      }
      return;
    }

    // Создаем новое соединение (используем текущий домен)
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    
    // Получаем токен из параметров или из cookies
    let authToken = token;
    if (!authToken && typeof document !== 'undefined') {
      // Пытаемся получить токен из cookies
      const cookies = document.cookie.split(';');
      const tokenCookie = cookies.find(c => c.trim().startsWith('dashboard_token='));
      if (tokenCookie) {
        authToken = tokenCookie.split('=')[1]?.trim();
      }
    }
    
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
      // Логируем только в dev режиме
      if (process.env.NODE_ENV === 'development') {
        console.log('WebSocket connected');
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      // Логируем только в dev режиме
      if (process.env.NODE_ENV === 'development') {
        console.log('WebSocket disconnected');
      }
    });

    socket.on('connect_error', (error: Error) => {
      setIsConnected(false);
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
        // Можно добавить логику для обновления токена или перенаправления на страницу входа
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
      if (ticketId) {
        // userId и isSupport теперь не нужны - они берутся из аутентификации
        socket.emit('support:join', { ticketId });
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
      if (ticketId && socket.connected) {
        socket.emit('support:leave', { ticketId });
      }
      socket.off('connect', onConnect);
      // Всегда отключаем socket при cleanup для предотвращения утечек памяти
      socket.disconnect();
      socketRef.current = null;
    };

    cleanupRef.current = cleanup;

    return cleanup;
  }, [enabled, ticketId, userId, isSupport]);

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


/**
 * Hook for working with WebSocket in support system.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';

// Use ReturnType to get the type of Socket from io function.
type SocketType = ReturnType<typeof io>;

interface UseWebSocketOptions {
  enabled?: boolean;
  userId?: string;
  ticketId?: string;
  isSupport?: boolean;
  token?: string;
}

interface UseWebSocketReturn {
  socket: SocketType | null;
  isConnected: boolean;
  joinTicket: (ticketId: string) => void;
  leaveTicket: (ticketId: string) => void;
  joinProfile: (profileId: string) => void;
  leaveProfile: (profileId: string) => void;
  sendTyping: (ticketId: string, isTyping: boolean) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    enabled = true,
    userId: _userId,
    ticketId,
    isSupport: _isSupport = false,
    token,
  } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<SocketType | null>(null);
  const socketRef = useRef<SocketType | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const currentTokenRef = useRef<string | undefined>(undefined);
  const currentTicketIdRef = useRef<string | undefined>(undefined);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  useEffect(() => {
    // Clear previous connection on unmount.
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  // WebSocket connection effect: establishes a single persistent connection when a valid token is present.
  // Excludes ticketId from dependencies to prevent reconnection on ticket changes; ticket switching is handled separately via room join/leave events.
  useEffect(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (!enabled || typeof window === 'undefined') {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      currentTokenRef.current = undefined;
      isConnectingRef.current = false;
      return;
    }

    // Skip connection until token is available; prevents duplicate sockets when token flips from undefined to a value on initial fetch.
    if (!token) {
      // Dev-only log to trace why messages are not loading (missing token blocks socket creation)
      if (process.env.NODE_ENV === 'development') {
        console.info(
          '%cWebSocket: No token available. Skipping connection..',
          'color: #a855f7; font-weight: 500;',
        );
      }
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      currentTokenRef.current = undefined;
      isConnectingRef.current = false;
      return;
    }

    // Reconnect only when the token changes; skip if already connected with the same token.
    if (currentTokenRef.current === token && socketRef.current?.connected) {
      return;
    }

    // Debounce reconnection to prevent rapid reconnection attempts when the token changes quickly (e.g., during async token fetch on initial load).
    // A 100ms delay stops cyclic reconnects and avoids multiple sockets when the token updates in quick succession.
    reconnectTimeoutRef.current = setTimeout(() => {
      isConnectingRef.current = false;

      // Disconnect previous socket only when the token changes; prevents duplicate connections during token refresh.
      if (cleanupRef.current && currentTokenRef.current !== token) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Save the current token for future comparisons.
      currentTokenRef.current = token;

      // If a connection already exists and the token hasn't changed, don't reconnect.
      if (socketRef.current?.connected && currentTokenRef.current === token) {
        return;
      }

      // Connect to the external WebSocket server via NEXT_PUBLIC_WS_URL env var.
      // Falls back to current origin for backwards compatibility during migration.
      const wsUrl =
        process.env.NEXT_PUBLIC_WS_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');

      // Use the token passed via the hook's options. The server sets token as an httpOnly cookie, so it is inaccessible to JS.
      // The consuming component must fetch the token from an API endpoint and pass it here.
      const authToken = token;

      const socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false,
        autoConnect: true,
        auth: {
          token: authToken || undefined,
        },
      });

      socketRef.current = socket;
      setSocket(socket);

      socket.on('connect', () => {
        setIsConnected(true);
        isConnectingRef.current = false;
        // Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
          console.log('WebSocket connected');
        }
        // On connection, automatically join the current ticket room if one is already set.
        if (currentTicketIdRef.current) {
          socket.emit('support:join', { ticketId: currentTicketIdRef.current });
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `WebSocket: Auto-joined room ticket:${currentTicketIdRef.current} after connection`,
            );
          }
        }
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        isConnectingRef.current = false;
        if (process.env.NODE_ENV === 'development') {
          console.log('WebSocket disconnected');
        }
      });

      socket.on('connect_error', (error: Error) => {
        setIsConnected(false);
        isConnectingRef.current = false;
        // Log connection errors with full context for quick diagnostics.
        console.error('WebSocket connection error:', {
          message: error.message,
          type: error.name,
          url: wsUrl,
        });

        // Detect and handle auth failures early to avoid reconnect loops with an invalid token.
        if (
          error.message.includes('Authentication') ||
          error.message.includes('Invalid token') ||
          error.message.includes('Authentication required')
        ) {
          console.error('WebSocket authentication failed - token may be invalid or expired');
          // Token is invalid or expired; refresh it via API or redirect to login. Do NOT auto-reconnect with a bad token.
          currentTokenRef.current = undefined;
        }

        // Log detailed CORS or origin-related errors to help diagnose server configuration issues.
        if (error.message.includes('CORS') || error.message.includes('origin')) {
          console.error('WebSocket CORS error - check server CORS configuration');
        }
      });

      // Fallback error handler for WebSocket errors not caught by connect_error.
      // Socket.IO handles most errors automatically; this handler is only for critical runtime errors that could affect application stability.
      socket.on('error', (error: Error) => {
        if (error.message && !error.message.includes('transport')) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('WebSocket error:', error.message);
          }
        }
      });

      // Cleanup function to disconnect socket when component unmounts.
      // Always disconnect socket on cleanup to prevent memory leaks.
      const cleanup = () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
        socket.off('error');
        socket.disconnect();
        socketRef.current = null;
        setSocket(null);
      };

      cleanupRef.current = cleanup;
      isConnectingRef.current = true;
    }, 100); // Debounce 100ms to prevent cyclic reconnection attempts.

    // Return cleanup function to clear on unmount or dependency changes.
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
    // Only 'enabled' and 'token' are in the dependency array - WebSocket reconnects only when the token changes.
    // 'ticketId', 'userId', and 'isSupport' do NOT trigger a reconnection.
  }, [enabled, token]);

  // Separate effect to track ticketId changes and auto join/leave rooms.
  // This allows switching rooms without reconnecting the WebSocket connection.
  useEffect(() => {
    const socket = socketRef.current;
    const previousTicketId = currentTicketIdRef.current;

    // If ticketId hasn't changed, do nothing
    if (previousTicketId === ticketId) {
      return;
    }

    // If there's a previous ticket and the connection is active, leave the old room.
    if (previousTicketId && socket?.connected) {
      socket.emit('support:leave', { ticketId: previousTicketId });
      if (process.env.NODE_ENV === 'development') {
        console.log(`WebSocket: Left room ticket:${previousTicketId}`);
      }
    }

    // Update the current ticketId.
    currentTicketIdRef.current = ticketId || undefined;

    // If there's a new ticket and the connection is active, join the new room.
    if (ticketId && socket?.connected) {
      socket.emit('support:join', { ticketId });
      if (process.env.NODE_ENV === 'development') {
        console.log(`WebSocket: Joined room ticket:${ticketId}`);
      }
    } else if (ticketId && socket && !socket.connected) {
      // If connection is not yet established, join after connection.
      // Use 'once' to avoid multiple subscriptions to the same event.
      const onConnect = () => {
        // Verify that ticketId hasn't changed while we were waiting for the connection.
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
      socketRef.current.emit('support:typing', { ticketId, isTyping });
    }
  }, []);

  const joinProfile = useCallback((profileId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('profile:join', { profileId });
    }
  }, []);

  const leaveProfile = useCallback((profileId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('profile:leave', { profileId });
    }
  }, []);

  return {
    socket,
    isConnected,
    joinTicket,
    leaveTicket,
    joinProfile,
    leaveProfile,
    sendTyping,
  };
}

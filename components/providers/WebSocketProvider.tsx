'use client';

import { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';

type SocketType = ReturnType<typeof useWebSocket>['socket'];

interface WebSocketContextValue {
  socket: SocketType;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  socket: null,
  isConnected: false,
});

/** Returns the global socket instance and connection status */
export function useGlobalSocket() {
  return useContext(WebSocketContext);
}

/** Global WebSocket provider — wraps the app, auto-connects for authenticated users */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { userData } = useAuth({ silent: true, lightweight: true });

  const { socket, isConnected } = useWebSocket({
    enabled: !!userData?.token,
    userId: userData?.id,
    token: userData?.token,
  });

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

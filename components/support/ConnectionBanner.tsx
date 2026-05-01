'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

interface ConnectionBannerProps {
  isConnected: boolean;
}

const OFFLINE_GRACE_MS = 2500;

/**
 * Compact, non-blocking banner shown when the WebSocket is offline.
 * Tickets and messages still work via tRPC polling — this is informational.
 *
 * Hidden during initial connect: only renders after the socket has stayed
 * offline for OFFLINE_GRACE_MS, so it doesn't flash on page load.
 */
export default function ConnectionBanner({ isConnected }: ConnectionBannerProps) {
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setShowOffline(false);
      return;
    }
    const timer = setTimeout(() => setShowOffline(true), OFFLINE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isConnected]);

  if (isConnected || !showOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300 sm:pointer-events-none sm:fixed sm:inset-x-0 sm:bottom-0 sm:z-40 sm:border-b-0 sm:border-t sm:px-4 sm:text-xs sm:backdrop-blur-sm"
    >
      <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">
        <span className="sm:hidden">Нет соединения. Обновления с задержкой.</span>
        <span className="hidden sm:inline">
          Нет соединения с сервером. Сообщения могут приходить с задержкой — переподключение
          автоматически.
        </span>
      </span>
    </div>
  );
}

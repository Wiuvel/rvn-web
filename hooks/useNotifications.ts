'use client';

import { useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useGlobalSocket } from '@/components/providers/WebSocketProvider';

interface UseNotificationsOptions {
  /** Active ticket ID — notifications for this ticket are auto-marked as read */
  activeTicketId?: string;
  /** Enable the hook (default: true) */
  enabled?: boolean;
}

/**
 * Notifications hook — combines tRPC queries with WebSocket real-time updates.
 * Provides unread count, recent notifications list, and mark-read actions.
 */
export function useNotifications(options: UseNotificationsOptions = {}) {
  const { activeTicketId, enabled = true } = options;
  const { socket } = useGlobalSocket();
  const utils = trpc.useUtils();

  /* Unread count with 60s polling baseline */
  const { data: unreadData } = trpc.notification.unreadCount.useQuery(undefined, {
    enabled,
    refetchInterval: 60_000,
    staleTime: 10_000,
  });

  /* Last 5 notifications for dropdown preview */
  const { data: listData, isLoading } = trpc.notification.list.useQuery(
    { limit: 5 },
    {
      enabled,
      staleTime: 15_000,
    },
  );

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
    onError: () => {
      /* Refetch to restore consistent state */
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
    onError: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const markRead = useCallback((id: string) => markReadMutation.mutate({ id }), [markReadMutation]);

  const markAllRead = useCallback(() => markAllReadMutation.mutate(), [markAllReadMutation]);

  /* WebSocket subscription for instant updates */
  useEffect(() => {
    if (!socket || !enabled) return;

    const handler = (data: { notification: { id: string; related_ticket_id?: string | null } }) => {
      /* Auto-mark-read if user is viewing this ticket */
      if (activeTicketId && data.notification.related_ticket_id === activeTicketId) {
        markRead(data.notification.id);
        /* markRead onSuccess already invalidates queries */
        return;
      }
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    };

    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [socket, enabled, activeTicketId, markRead, utils]);

  return {
    unreadCount: unreadData?.count ?? 0,
    notifications: listData?.items ?? [],
    isLoading,
    markRead,
    markAllRead,
  };
}

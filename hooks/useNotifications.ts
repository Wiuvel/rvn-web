'use client';

import { useEffect, useCallback, useRef } from 'react';
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
    staleTime: 60_000,
  });

  /* Last 5 notifications for dropdown preview */
  const { data: listData, isLoading } = trpc.notification.list.useQuery(
    { limit: 5 },
    {
      enabled,
      staleTime: 15_000,
    },
  );

  /** Invalidate all notification-related queries */
  const invalidateAll = useCallback(() => {
    utils.notification.unreadCount.invalidate();
    utils.notification.list.invalidate();
    utils.notification.groupedList.invalidate();
  }, [utils]);

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: invalidateAll,
    onError: invalidateAll,
  });

  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: invalidateAll,
    onError: invalidateAll,
  });

  const markGroupReadMutation = trpc.notification.markGroupRead.useMutation({
    onSuccess: invalidateAll,
    onError: invalidateAll,
  });

  const markRead = useCallback((id: string) => markReadMutation.mutate({ id }), [markReadMutation]);
  const markAllRead = useCallback(() => markAllReadMutation.mutate(), [markAllReadMutation]);
  const markGroupRead = useCallback(
    (relatedTicketId: string) => markGroupReadMutation.mutate({ relatedTicketId }),
    [markGroupReadMutation],
  );

  /**
   * Stable refs for WS handler callbacks.
   * Prevents the socket effect from re-running when markRead/invalidateAll
   * get new references on every render cycle.
   */
  const markReadRef = useRef(markRead);
  const invalidateAllRef = useRef(invalidateAll);
  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);
  useEffect(() => {
    invalidateAllRef.current = invalidateAll;
  }, [invalidateAll]);

  /** WebSocket subscription for instant updates */
  useEffect(() => {
    if (!socket || !enabled) return;

    const handler = (data: { notification: { id: string; related_ticket_id?: string | null } }) => {
      /** Auto-mark-read if user is viewing this ticket */
      if (activeTicketId && data.notification.related_ticket_id === activeTicketId) {
        markReadRef.current(data.notification.id);
        return;
      }
      invalidateAllRef.current();
    };

    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [socket, enabled, activeTicketId]);

  return {
    unreadCount: unreadData?.count ?? 0,
    notifications: listData?.items ?? [],
    isLoading,
    markRead,
    markAllRead,
    markGroupRead,
  };
}

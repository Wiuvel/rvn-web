'use client';

import { trpc } from '@/lib/trpc/client';

const DEFAULT_PAGE_SIZE = 50;

/**
 * Бесконечная загрузка сообщений тикета для useInfiniteQuery.
 * Процедура support.tickets.getMessages с cursor-based пагинацией (cursor = offset).
 */
export function useTicketMessagesInfinite(ticketId: string | null, pageSize = DEFAULT_PAGE_SIZE) {
  const query = trpc.support.tickets.getMessages.useInfiniteQuery(
    { ticketId: ticketId!, limit: pageSize },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialCursor: 0,
      enabled: !!ticketId,
    },
  );

  return {
    ...query,
    messages: query.data?.pages.flatMap((p) => p.messages) ?? [],
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

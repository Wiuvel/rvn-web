import { useState, useCallback, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { PanelUser } from '@/types';

export function useAdminUsers(isAuthenticated: boolean) {
  const [userSearch, setUserSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(userSearch.trim());
    }, 350);
    return () => clearTimeout(timeoutId);
  }, [userSearch]);

  const queryInput = useMemo(
    () => ({ q: debouncedSearch || undefined, order: sortDirection }),
    [debouncedSearch, sortDirection],
  );

  const {
    data: rawData,
    error: trpcError,
    isLoading: usersLoading,
  } = trpc.admin.users.list.useQuery(queryInput, {
    enabled: isAuthenticated,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  const sortUsersByRole = useCallback(
    (usersList: PanelUser[], sort: 'asc' | 'desc'): PanelUser[] => {
      return [...usersList].sort((a: PanelUser, b: PanelUser) => {
        const getHighestRole = (user: PanelUser): number => {
          if (!user.roles || user.roles.length === 0) return 3;
          if (user.roles.includes('admin')) return 1;
          if (user.roles.includes('support')) return 2;
          return 3;
        };

        const roleA = getHighestRole(a);
        const roleB = getHighestRole(b);

        if (roleA !== roleB) {
          return roleA - roleB;
        }

        const usernameA = (a.username || '').toLowerCase();
        const usernameB = (b.username || '').toLowerCase();

        return sort === 'asc'
          ? usernameA.localeCompare(usernameB)
          : usernameB.localeCompare(usernameA);
      });
    },
    [],
  );

  const users = useMemo(() => {
    const raw = Array.isArray(rawData?.users) ? (rawData.users as PanelUser[]) : [];
    const sorted = sortUsersByRole(raw, sortDirection);
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_panel_users_count', sorted.length.toString());
    }
    return sorted;
  }, [rawData, sortDirection, sortUsersByRole]);

  const usersError = trpcError?.message ?? '';

  const setUsers = useCallback(
    (updater: PanelUser[] | ((prev: PanelUser[]) => PanelUser[])) => {
      utils.admin.users.list.setData(queryInput, (prev: any) => {
        if (!prev) return prev;
        const current = (prev.users ?? []) as PanelUser[];
        const next = typeof updater === 'function' ? updater(current) : updater;
        return { users: next };
      });
    },
    [utils, queryInput],
  );

  const fetchUsers = useCallback(
    async (_query?: string, _sort?: 'asc' | 'desc') => {
      await utils.admin.users.list.invalidate();
    },
    [utils],
  );

  return {
    users,
    setUsers,
    usersLoading,
    usersError,
    userSearch,
    setUserSearch,
    debouncedSearch,
    sortDirection,
    setSortDirection,
    fetchUsers,
    sortUsersByRole,
  };
}

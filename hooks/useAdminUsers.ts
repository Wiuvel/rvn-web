import { useState, useCallback, useEffect, useMemo } from 'react';
import { useApiSWR } from '@/lib/swr';
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

  const swrKey = useMemo(() => {
    if (!isAuthenticated) return null;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    params.set('order', sortDirection);
    return `/api/admin/users?${params.toString()}`;
  }, [isAuthenticated, debouncedSearch, sortDirection]);

  const {
    data: rawData,
    error: swrError,
    isLoading: usersLoading,
    mutate,
  } = useApiSWR<{ users: PanelUser[] }>(swrKey, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

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
    const raw = Array.isArray(rawData?.users) ? rawData.users : [];
    const sorted = sortUsersByRole(raw, sortDirection);
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_panel_users_count', sorted.length.toString());
    }
    return sorted;
  }, [rawData, sortDirection, sortUsersByRole]);

  const usersError = swrError?.message ?? '';

  const setUsers = useCallback(
    (updater: PanelUser[] | ((prev: PanelUser[]) => PanelUser[])) => {
      mutate(
        (prev) => {
          const current = prev?.users ?? [];
          const next = typeof updater === 'function' ? updater(current) : updater;
          return { users: next };
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  const fetchUsers = useCallback(
    async (_query?: string, _sort?: 'asc' | 'desc') => {
      await mutate();
    },
    [mutate],
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

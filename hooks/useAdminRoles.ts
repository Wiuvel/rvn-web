import { useState } from 'react';
import { PanelUser } from '@/types';

export function useAdminRoles(
  setUsers: React.Dispatch<React.SetStateAction<PanelUser[]>>,
  sortUsersByRole: (users: PanelUser[], sort: 'asc' | 'desc') => PanelUser[],
  sortDirection: 'asc' | 'desc',
  setUserActionMessage: (msg: string) => void,
) {
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null);
  const [showAddRoleMenu, setShowAddRoleMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PanelUser | null>(null);

  const handleManageRoles = async (user: PanelUser) => {
    if (!user || !user.id) return;
    setSelectedUser(user);
    setRolesLoading(true);
    try {
      const response = await fetch(`/api/admin/users/roles?userId=${user.id}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setUserRoles([]);
        return;
      }
      const data = await response.json();
      setUserRoles(data.roles || []);
    } catch {
      setUserRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const refreshUserRoles = async (user: PanelUser) => {
    if (!user || !user.id) return;
    try {
      const response = await fetch(`/api/admin/users/roles?userId=${user.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return;
      const data = await response.json();
      const updatedRoles = data.roles || [];

      setUserRoles(updatedRoles);
      setUsers((prev) => {
        const updated = prev.map((u) => (u.id === user.id ? { ...u, roles: updatedRoles } : u));
        return sortUsersByRole(updated, sortDirection);
      });
    } catch {
      // Silent error
    }
  };

  const handleGrantRole = async (role: 'support' | 'admin') => {
    if (!selectedUser || roleActionLoading) return;

    const actionKey = `grant-${role}`;
    setRoleActionLoading(actionKey);

    try {
      const response = await fetch('/api/admin/users/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedUser.id, role }),
      });
      const data = await response.json();
      if (response.ok) {
        setUserRoles((prev) => [...prev, role]);
        setUsers((prev) => {
          const updated = prev.map((user) =>
            user.id === selectedUser.id ? { ...user, roles: [...(user.roles || []), role] } : user,
          );
          return sortUsersByRole(updated, sortDirection);
        });
        setUserActionMessage(`Роль выдана ${selectedUser.username.toUpperCase()}`);
        setTimeout(() => setUserActionMessage(''), 2500);
        refreshUserRoles(selectedUser);
      } else {
        setUserActionMessage(data.error || 'Ошибка выдачи роли');
        setTimeout(() => setUserActionMessage(''), 2500);
        refreshUserRoles(selectedUser);
      }
    } catch (error) {
      console.error('Error granting role:', error);
      setUserActionMessage('Ошибка выдачи роли');
      setTimeout(() => setUserActionMessage(''), 2500);
      refreshUserRoles(selectedUser);
    } finally {
      setRoleActionLoading(null);
    }
  };

  const handleRevokeRole = async (role: 'support' | 'admin') => {
    if (!selectedUser || roleActionLoading) return;

    const actionKey = `revoke-${role}`;
    setRoleActionLoading(actionKey);

    try {
      const response = await fetch(
        `/api/admin/users/roles?userId=${selectedUser.id}&role=${role}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      const data = await response.json();
      if (response.ok) {
        setUserRoles((prev) => prev.filter((r) => r !== role));
        setUsers((prev) => {
          const updated = prev.map((user) =>
            user.id === selectedUser.id
              ? { ...user, roles: (user.roles || []).filter((r) => r !== role) }
              : user,
          );
          return sortUsersByRole(updated, sortDirection);
        });
        setUserActionMessage(
          `Роль "${role}" отозвана у пользователя ${selectedUser.username.toUpperCase()}`,
        );
        setTimeout(() => setUserActionMessage(''), 2500);
        refreshUserRoles(selectedUser);
      } else {
        setUserActionMessage(data.error || 'Ошибка отзыва роли');
        setTimeout(() => setUserActionMessage(''), 2500);
        refreshUserRoles(selectedUser);
      }
    } catch (error) {
      console.error('Error revoking role:', error);
      setUserActionMessage('Ошибка отзыва роли');
      setTimeout(() => setUserActionMessage(''), 2500);
      refreshUserRoles(selectedUser);
    } finally {
      setRoleActionLoading(null);
    }
  };

  return {
    userRoles,
    rolesLoading,
    roleActionLoading,
    showAddRoleMenu,
    setShowAddRoleMenu,
    selectedUser,
    setSelectedUser,
    handleManageRoles,
    handleGrantRole,
    handleRevokeRole,
  };
}

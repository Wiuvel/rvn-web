import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
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

  const utils = trpc.useUtils();
  const grantMutation = trpc.admin.users.roles.grant.useMutation();
  const revokeMutation = trpc.admin.users.roles.revoke.useMutation();

  const handleManageRoles = async (user: PanelUser) => {
    if (!user || !user.id) return;
    setSelectedUser(user);
    setRolesLoading(true);
    try {
      const data = await utils.admin.users.roles.get.fetch({ userId: user.id });
      setUserRoles((data as any).roles || []);
    } catch {
      setUserRoles([]);
    } finally {
      setRolesLoading(false);
    }
  };

  const refreshUserRoles = async (user: PanelUser) => {
    if (!user || !user.id) return;
    try {
      const data = await utils.admin.users.roles.get.fetch({ userId: user.id });
      const updatedRoles = (data as any).roles || [];
      setUserRoles(updatedRoles);
      setUsers((prev) => {
        const updated = prev.map((u) => (u.id === user.id ? { ...u, roles: updatedRoles } : u));
        return sortUsersByRole(updated, sortDirection);
      });
    } catch {}
  };

  const handleGrantRole = async (role: 'support' | 'admin') => {
    if (!selectedUser || roleActionLoading) return;

    const actionKey = `grant-${role}`;
    setRoleActionLoading(actionKey);

    try {
      await grantMutation.mutateAsync({ userId: selectedUser.id, role });
      void utils.auth.me.invalidate();
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Ошибка выдачи роли';
      setUserActionMessage(msg);
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
      await revokeMutation.mutateAsync({ userId: selectedUser.id, role });
      void utils.auth.me.invalidate();
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Ошибка отзыва роли';
      setUserActionMessage(msg);
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { trpc } from '@/lib/trpc/client';
import { gsap } from 'gsap';
import {
  User as PersonIcon,
  CreditCard as IdCardIcon,
  Ban as CircleBackslashIcon,
  Star as StarFilledIcon,
  MessageSquare as ChatBubbleIcon,
  Search as MagnifyingGlassIcon,
  X as Cross2Icon,
  Menu as HamburgerMenuIcon,
} from 'lucide-react';
import AdminAuthForm from '@/components/auth/AdminForm';
import MagicBentoGrid from '@/components/ui/MagicBentoGrid';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE, APP_VERSION } from '@/lib/utils/constants';
import { PanelUser } from '@/types';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { useAdminBan } from '@/hooks/useAdminBan';

const SupportAnalytics = dynamic(() => import('@/components/admin/SupportAnalytics'), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const TrustedDevelopersSettings = dynamic(
  () => import('@/components/admin/TrustedDevelopersSettings'),
  {
    loading: () => <LoadingSpinner />,
  },
);

const RemnawaveSettings = dynamic(() => import('@/components/admin/RemnawaveSettings'), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});

const SubscriptionPlansSettings = dynamic(
  () => import('@/components/admin/SubscriptionPlansSettings'),
  {
    loading: () => <LoadingSpinner />,
    ssr: false,
  },
);

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  adminExists: boolean;
}

interface AdminPanelContentProps {
  teamCount: number;
}

export default function AdminPanelContent({ teamCount }: AdminPanelContentProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_panel_active_tab') || 'dashboard';
    }
    return 'dashboard';
  });
  const { data: authData, isLoading: authLoading } = trpc.admin.check.useQuery(undefined, {
    staleTime: 30_000,
  });
  const utils = trpc.useUtils();
  const mutateAuth = () => utils.admin.check.invalidate();
  const authState: AuthState = authData ?? {
    isAuthenticated: false,
    username: null,
    adminExists: false,
  };
  const [showPanel, setShowPanel] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userActionMessage, setUserActionMessage] = useState('');
  const userActionMessageRef = useRef<HTMLDivElement>(null);

  // @Hooks
  const {
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
  } = useAdminUsers(authState.isAuthenticated);

  const {
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
  } = useAdminRoles(setUsers, sortUsersByRole, sortDirection, setUserActionMessage);

  const {
    banUser,
    setBanUser,
    banDuration,
    setBanDuration,
    banReason,
    setBanReason,
    banLoading,
    handleBanUser,
    handleBanSubmit,
  } = useAdminBan(setUserActionMessage);

  // Animation for userActionMessage..
  useEffect(() => {
    if (userActionMessage && userActionMessageRef.current) {
      if (userActionMessageRef.current.style.display === 'none') {
        userActionMessageRef.current.style.display = '';
      }
      gsap.fromTo(
        userActionMessageRef.current,
        { opacity: 0, y: -10, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: GSAP_DEFAULT_DURATION,
          ease: GSAP_DEFAULT_EASE,
        },
      );
    } else if (!userActionMessage && userActionMessageRef.current) {
      gsap.to(userActionMessageRef.current, {
        opacity: 0,
        y: -10,
        scale: 0.95,
        duration: GSAP_DEFAULT_DURATION,
        ease: GSAP_DEFAULT_EASE,
        onComplete: () => {
          if (userActionMessageRef.current) {
            userActionMessageRef.current.style.display = 'none';
          }
        },
      });
    }
  }, [userActionMessage]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showAddRoleMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.role-menu-container')) {
          setShowAddRoleMenu(false);
        }
      }
    };

    if (showAddRoleMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showAddRoleMenu, setShowAddRoleMenu]);

  useEffect(() => {
    if (authState.isAuthenticated) {
      const timer = setTimeout(() => setShowPanel(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPanel(false);
    }
  }, [authState.isAuthenticated]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => mutateAuth(),
  });

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync({ scope: 'admin' });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    if (authState.isAuthenticated && activeTab === 'users') {
      fetchUsers(debouncedSearch, sortDirection);
    }
  }, [activeTab, authState.isAuthenticated, debouncedSearch, fetchUsers, sortDirection]);

  // Saving the active tab to localStorage..
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_panel_active_tab', activeTab);
    }
  }, [activeTab]);

  const formatDateShort = (value?: string | null) => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} - ${hours}:${minutes}`;
    } catch {
      return value;
    }
  };

  const handleSubscriptionManage = (user: PanelUser) => {
    setUserActionMessage(`Управление подпиской для ${user.username.toUpperCase()}`);
    setTimeout(() => setUserActionMessage(''), 2500);
  };

  if (authLoading) {
    return <LoadingSpinner />;
  }

  if (!authState.isAuthenticated) {
    return <AdminAuthForm initialAuthState={authState} onAuthSuccess={() => mutateAuth()} />;
  }

  const tabs = [
    { id: 'dashboard', name: 'Обзор', icon: '📊' },
    { id: 'users', name: 'Пользователи', icon: '👥' },
    { id: 'servers', name: 'Серверы', icon: '🖥️' },
    { id: 'analytics', name: 'Аналитика', icon: '📈' },
    { id: 'remnawave', name: 'Remnawave', icon: '🌐' },
    { id: 'subscriptions', name: 'Подписки', icon: '📋' },
    { id: 'settings', name: 'Настройки', icon: '⚙️' },
  ];

  return (
    <div
      className={`flex h-screen transition-all duration-700 ease-out ${
        showPanel ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setMobileMenuOpen(false);
            }
          }}
          aria-label="Закрыть меню"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 transform flex-col border-r border-neutral-800 bg-neutral-900 transition-transform duration-300 ease-in-out md:static md:z-auto ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} `}
      >
        {/* Header */}
        <div className="border-b border-neutral-800 p-6">
          <div className="flex items-center space-x-3">
            <div>
              <h1 className="text-lg font-semibold text-white">Raven Team</h1>
              <p className="text-xs text-neutral-400">NextJS 16.2.3 / React 19.2.4</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2 p-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (window.innerWidth < 768) {
                  setMobileMenuOpen(false);
                }
              }}
              className={`flex w-full touch-manipulation items-center space-x-3 rounded-lg px-3 py-3 text-left transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-neutral-300 hover:bg-neutral-800 hover:text-white active:bg-neutral-700'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-sm font-medium sm:text-base">{tab.name}</span>
            </button>
          ))}
        </nav>

        {/* Bottom Navigation */}
        <div className="border-t border-neutral-800 p-4">
          <button
            onClick={() => {
              router.push('/ui/panel');
              if (window.innerWidth < 768) {
                setMobileMenuOpen(false);
              }
            }}
            className="flex w-full touch-manipulation items-center space-x-3 rounded-lg px-3 py-3 text-left text-neutral-300 transition-all duration-200 hover:bg-neutral-800 hover:text-white active:bg-neutral-700"
          >
            <span className="text-lg">🗂</span>
            <span className="text-sm font-medium sm:text-base">Сменить панель</span>
          </button>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800 p-4">
          <div className="text-xs text-neutral-500">
            <p>Версия: {APP_VERSION}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:ml-0">
        {/* Top Bar */}
        <header className="border-b border-neutral-800 bg-neutral-900 px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="touch-manipulation rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white md:hidden"
                aria-label="Открыть меню"
              >
                <HamburgerMenuIcon className="h-6 w-6" />
              </button>

              <h2 className="text-lg font-semibold capitalize text-white sm:text-xl">
                {tabs.find((tab) => tab.id === activeTab)?.name}
              </h2>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden text-sm text-neutral-400 sm:block">{authState.username}</div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                {authState.username?.charAt(0).toUpperCase() || 'A'}
              </div>
              <button
                onClick={handleLogout}
                className="touch-manipulation rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white active:bg-neutral-800"
              >
                <span className="hidden sm:inline">Выйти</span>
                <span className="sm:hidden">🚪</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <MagicBentoGrid teamCount={teamCount} />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4 sm:space-y-6">
              <div className="user-management-card">
                <div className="user-management-header">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Управление пользователями</h3>
                    <p className="mt-1 text-sm text-neutral-400">Всего записей: {users.length}</p>
                  </div>
                  <div className="user-search">
                    <div className="user-search-wrapper">
                      <MagnifyingGlassIcon className="user-search-icon h-4 w-4" />
                      <input
                        type="text"
                        className="user-search-input"
                        placeholder="Поиск по логину или ID"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        aria-label="Поиск пользователей"
                      />
                    </div>
                    <button
                      onClick={() => fetchUsers(debouncedSearch, sortDirection)}
                      className="user-refresh-btn"
                      disabled={usersLoading}
                    >
                      <svg
                        className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.6}
                          d="M4 4v5h.582m0 0A7 7 0 0112 5a7 7 0 016.418 4.582M20 20v-5h-.581m0 0A7 7 0 0112 19a7 7 0 01-6.418-4.582"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {userActionMessage && (
                  <div ref={userActionMessageRef} className="user-feedback" role="status">
                    {userActionMessage}
                  </div>
                )}
                {usersError && (
                  <div className="user-error" role="alert">
                    {usersError}
                  </div>
                )}

                <div className="user-table">
                  <div className="user-table-head">
                    <span>Логин</span>
                    <span>ID</span>
                    <span>Роль</span>
                    <button
                      className="user-sort-btn"
                      onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    >
                      Создан
                      <svg
                        className={`sort-arrow ${sortDirection === 'desc' ? 'down' : 'up'}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 9l6-6 6 6M18 15l-6 6-6-6"
                        />
                      </svg>
                    </button>
                    <span>Действия</span>
                  </div>

                  <div className="user-table-body">
                    {usersLoading &&
                      (() => {
                        // Получаем сохраненное количество пользователей из localStorage
                        const savedCount =
                          typeof window !== 'undefined'
                            ? parseInt(localStorage.getItem('admin_panel_users_count') || '3', 10)
                            : 3;
                        // Если сохранено 0, не показываем skeleton loader
                        if (savedCount === 0) return null;
                        const skeletonCount = savedCount > 0 ? savedCount : 3;

                        return Array.from({ length: skeletonCount }).map((_, index) => (
                          <div key={`user-skeleton-${index}`} className="user-row user-row-loading">
                            <div className="skeleton w-32" />
                            <div className="skeleton w-20" />
                            <div className="skeleton w-24" />
                            <div className="skeleton w-28" />
                            <div className="skeleton w-40" />
                          </div>
                        ));
                      })()}

                    {!usersLoading && users.length === 0 && !usersError && (
                      <div className="user-empty-state">
                        <p>Пользователи не найдены</p>
                      </div>
                    )}

                    {!usersLoading &&
                      users.map((user) => {
                        let highestRole: string | null = null;
                        if (user.roles && user.roles.length > 0) {
                          if (user.roles.includes('admin')) {
                            highestRole = 'admin';
                          } else if (user.roles.includes('support')) {
                            highestRole = 'support';
                          } else if (user.roles.includes('user')) {
                            highestRole = 'user';
                          } else {
                            highestRole = user.roles[0];
                          }
                        }

                        const getUsernameColor = () => {
                          if (highestRole === 'admin') {
                            return '!text-purple-400';
                          } else if (highestRole === 'support') {
                            return '!text-green-400';
                          }
                          return '';
                        };

                        return (
                          <div key={user.id} className="user-row">
                            <div>
                              <p className={`user-primary ${getUsernameColor()}`}>
                                {user.username}
                              </p>
                              <span className="user-muted">
                                {user.isActive ? 'Активен' : 'Отключен'}
                              </span>
                            </div>
                            <div>
                              <p className={`user-primary tracking-wide ${getUsernameColor()}`}>
                                {user.userId}
                              </p>
                              <span className="user-muted">Идентификатор</span>
                            </div>
                            <div>
                              {(() => {
                                if (highestRole) {
                                  const roleText =
                                    highestRole === 'support'
                                      ? 'Поддержка'
                                      : highestRole === 'admin'
                                        ? 'Админ'
                                        : 'Клиент';
                                  const isSupport = highestRole === 'support';
                                  const isClient = highestRole === 'user';
                                  const isAdmin = highestRole === 'admin';
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                                        isSupport
                                          ? 'border border-green-500/30 bg-green-500/20 text-green-400'
                                          : isClient
                                            ? 'border border-blue-500/30 bg-blue-500/20 text-blue-400'
                                            : 'border border-purple-500/30 bg-purple-500/20 text-purple-400'
                                      }`}
                                    >
                                      {isClient && (
                                        <PersonIcon
                                          className="h-4 w-4"
                                          style={{ color: '#6699ff' }}
                                        />
                                      )}
                                      {isSupport && (
                                        <ChatBubbleIcon
                                          className="h-4 w-4"
                                          style={{ color: '#4ade80' }}
                                        />
                                      )}
                                      {isAdmin && (
                                        <StarFilledIcon
                                          className="h-4 w-4"
                                          style={{ color: '#cc99ff' }}
                                        />
                                      )}
                                      {roleText}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-400">
                                    Нет роли
                                  </span>
                                );
                              })()}
                            </div>
                            <div>
                              <span className="user-date" title={user.createdAt}>
                                {formatDateShort(user.createdAt)}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleManageRoles(user)}
                                className="group relative rounded-lg p-2 text-purple-400 transition-colors hover:bg-neutral-800"
                                title="Управление ролями"
                              >
                                <PersonIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleSubscriptionManage(user)}
                                className="group relative rounded-lg p-2 text-blue-400 transition-colors hover:bg-neutral-800"
                                title="Управление подпиской"
                              >
                                <IdCardIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleBanUser(user)}
                                className="group relative rounded-lg p-2 text-red-400 transition-colors hover:bg-neutral-800"
                                title="Заблокировать"
                              >
                                <CircleBackslashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'servers' && (
            <div className="flex h-64 items-center justify-center text-neutral-500">
              Раздел &quot;Серверы&quot; в разработке
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <SupportAnalytics />
            </div>
          )}

          {activeTab === 'remnawave' && (
            <div className="space-y-6">
              <RemnawaveSettings />
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <div className="space-y-6">
              <SubscriptionPlansSettings />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <TrustedDevelopersSettings />
            </div>
          )}
        </main>
      </div>

      {/* Role Management Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedUser(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSelectedUser(null);
            }
          }}
          aria-label="Закрыть модальное окно"
        >
          <div className="role-menu-container w-full max-w-md overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-800 p-4">
              <h3 className="text-lg font-semibold text-white">Управление ролями</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-neutral-400 transition-colors hover:text-white"
              >
                <Cross2Icon className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800 text-lg font-bold text-neutral-400">
                  {selectedUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-white">{selectedUser.username}</div>
                  <div className="text-xs text-neutral-500">{selectedUser.userId}</div>
                </div>
              </div>

              <div className="min-h-[280px] space-y-2">
                {rolesLoading ? (
                  <>
                    <div className="mb-4 h-4 w-32 animate-pulse rounded bg-neutral-800" />
                    {/* Skeleton Client Role */}
                    <div className="flex items-center justify-between rounded-lg border border-neutral-800/50 bg-neutral-950/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-800" />
                        <div className="space-y-2">
                          <div className="h-4 w-20 animate-pulse rounded bg-neutral-800" />
                          <div className="h-3 w-24 animate-pulse rounded bg-neutral-800" />
                        </div>
                      </div>
                      <div className="h-6 w-16 animate-pulse rounded bg-neutral-800" />
                    </div>
                    {/* Skeleton Support Role */}
                    <div className="flex items-center justify-between rounded-lg border border-neutral-800/50 bg-neutral-950/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-800" />
                        <div className="space-y-2">
                          <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
                          <div className="h-3 w-28 animate-pulse rounded bg-neutral-800" />
                        </div>
                      </div>
                      <div className="h-6 w-20 animate-pulse rounded bg-neutral-800" />
                    </div>
                    {/* Skeleton Admin Role */}
                    <div className="flex items-center justify-between rounded-lg border border-neutral-800/50 bg-neutral-950/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 animate-pulse rounded-lg bg-neutral-800" />
                        <div className="space-y-2">
                          <div className="h-4 w-28 animate-pulse rounded bg-neutral-800" />
                          <div className="h-3 w-24 animate-pulse rounded bg-neutral-800" />
                        </div>
                      </div>
                      <div className="h-6 w-20 animate-pulse rounded bg-neutral-800" />
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-400">
                      Назначенные роли
                    </h4>

                    {/* Default User Role - Always Active */}
                    <div className="flex items-center justify-between rounded-lg border border-neutral-800/50 bg-neutral-950/50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                          <PersonIcon className="h-4 w-4" style={{ color: '#6699ff' }} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Клиент</div>
                          <div className="text-xs text-neutral-500">Базовая роль</div>
                        </div>
                      </div>
                      <div className="rounded border border-green-500/20 bg-green-500/10 px-2 py-1 text-xs text-green-500">
                        Активна
                      </div>
                    </div>

                    {/* Support Role */}
                    <div
                      className={`flex items-center justify-between rounded-lg p-3 transition-colors ${
                        userRoles.includes('support')
                          ? 'border border-green-500/20 bg-green-950/20'
                          : 'border border-neutral-800/50 bg-neutral-950/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            userRoles.includes('support')
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-neutral-800 text-neutral-500'
                          }`}
                        >
                          <ChatBubbleIcon
                            className={`h-4 w-4 ${!userRoles.includes('support') && 'opacity-50 grayscale'}`}
                            style={{ color: userRoles.includes('support') ? '#4ade80' : undefined }}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Поддержка</div>
                          <div className="text-xs text-neutral-500">Доступ к тикетам</div>
                        </div>
                      </div>
                      <button
                        disabled={!!roleActionLoading}
                        onClick={() =>
                          userRoles.includes('support')
                            ? handleRevokeRole('support')
                            : handleGrantRole('support')
                        }
                        className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${
                          roleActionLoading === 'grant-support' ||
                          roleActionLoading === 'revoke-support'
                            ? 'cursor-wait bg-neutral-800 text-neutral-500'
                            : userRoles.includes('support')
                              ? 'border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-500'
                        }`}
                      >
                        {roleActionLoading === 'grant-support' ||
                        roleActionLoading === 'revoke-support' ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : userRoles.includes('support') ? (
                          'Отозвать'
                        ) : (
                          'Выдать'
                        )}
                      </button>
                    </div>

                    {/* Admin Role */}
                    <div
                      className={`flex items-center justify-between rounded-lg p-3 transition-colors ${
                        userRoles.includes('admin')
                          ? 'border border-purple-500/20 bg-purple-950/20'
                          : 'border border-neutral-800/50 bg-neutral-950/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            userRoles.includes('admin')
                              ? 'bg-purple-500/20 text-purple-400'
                              : 'bg-neutral-800 text-neutral-500'
                          }`}
                        >
                          <StarFilledIcon
                            className={`h-4 w-4 ${!userRoles.includes('admin') && 'opacity-50 grayscale'}`}
                            style={{ color: userRoles.includes('admin') ? '#cc99ff' : undefined }}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">Администратор</div>
                          <div className="text-xs text-neutral-500">Полный доступ</div>
                        </div>
                      </div>
                      <button
                        disabled={!!roleActionLoading}
                        onClick={() =>
                          userRoles.includes('admin')
                            ? handleRevokeRole('admin')
                            : handleGrantRole('admin')
                        }
                        className={`rounded px-3 py-1.5 text-xs font-medium transition-all ${
                          roleActionLoading === 'grant-admin' ||
                          roleActionLoading === 'revoke-admin'
                            ? 'cursor-wait bg-neutral-800 text-neutral-500'
                            : userRoles.includes('admin')
                              ? 'border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-600 text-white shadow-lg shadow-green-900/20 hover:bg-green-500'
                        }`}
                      >
                        {roleActionLoading === 'grant-admin' ||
                        roleActionLoading === 'revoke-admin' ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : userRoles.includes('admin') ? (
                          'Отозвать'
                        ) : (
                          'Выдать'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban User Modal */}
      {banUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBanUser(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setBanUser(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ban-modal-title"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 p-4">
              <h3 id="ban-modal-title" className="text-lg font-semibold text-white">
                Блокировка пользователя
              </h3>
            </div>

            <div className="space-y-4 p-4">
              <div className="text-sm text-neutral-400">
                Вы собираетесь заблокировать{' '}
                <span className="font-medium text-white">{banUser.username}</span>. Выберите
                длительность и укажите причину.
              </div>

              <div className="space-y-2">
                <div
                  id="ban-duration-label"
                  className="text-xs font-semibold uppercase text-neutral-500"
                >
                  Длительность
                </div>
                <div
                  className="grid grid-cols-4 gap-2"
                  role="group"
                  aria-labelledby="ban-duration-label"
                >
                  <button
                    onClick={() => setBanDuration(1)}
                    className={`rounded border px-2 py-1.5 text-sm ${banDuration === 1 ? 'border-white bg-white text-black' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600'}`}
                  >
                    1 день
                  </button>
                  <button
                    onClick={() => setBanDuration(7)}
                    className={`rounded border px-2 py-1.5 text-sm ${banDuration === 7 ? 'border-white bg-white text-black' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600'}`}
                  >
                    7 дней
                  </button>
                  <button
                    onClick={() => setBanDuration(30)}
                    className={`rounded border px-2 py-1.5 text-sm ${banDuration === 30 ? 'border-white bg-white text-black' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600'}`}
                  >
                    30 дней
                  </button>
                  <button
                    onClick={() => setBanDuration('forever')}
                    className={`rounded border px-2 py-1.5 text-sm ${banDuration === 'forever' ? 'border-red-500 bg-red-500 text-white' : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600'}`}
                  >
                    Навсегда
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="ban-reason"
                  className="text-xs font-semibold uppercase text-neutral-500"
                >
                  Причина
                </label>
                <textarea
                  id="ban-reason"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="BRUH.."
                  className="h-24 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-white focus:border-neutral-600 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setBanUser(null)}
                  className="flex-1 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  Отмена
                </button>
                <button
                  onClick={handleBanSubmit}
                  disabled={banLoading || !banReason.trim()}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {banLoading ? 'Блокировка...' : 'Заблокировать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

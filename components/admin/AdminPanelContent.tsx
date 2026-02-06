'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { gsap } from 'gsap';
import AdminAuthForm from '@/components/auth/AdminForm';
import MagicBentoGrid from '@/components/ui/MagicBentoGrid';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SupportAnalytics from '@/components/admin/SupportAnalytics';
import TrustedDevelopersSettings from '@/components/admin/TrustedDevelopersSettings';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE, APP_VERSION } from '@/lib/utils/constants';

interface AuthState {
    isAuthenticated: boolean;
    username: string | null;
    adminExists: boolean;
}

interface PanelUser {
    id: string;
    user_id: string;
    username: string;
    created_at: string;
    last_login?: string | null;
    is_active: boolean;
    token?: string;
    roles?: string[];
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
    const [authState, setAuthState] = useState<AuthState>({
        isAuthenticated: false,
        username: null,
        adminExists: false
    });
    const [loading, setLoading] = useState(true);
    const [showPanel, setShowPanel] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [users, setUsers] = useState<PanelUser[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [userActionMessage, setUserActionMessage] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [selectedUser, setSelectedUser] = useState<PanelUser | null>(null);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);
    const [roleActionLoading, setRoleActionLoading] = useState<string | null>(null); // 'grant-support' | 'revoke-support' | 'grant-admin' | 'revoke-admin' | null
    const [showAddRoleMenu, setShowAddRoleMenu] = useState(false);
    const [banUser, setBanUser] = useState<PanelUser | null>(null);
    const [banDuration, setBanDuration] = useState<number | 'forever'>(1);
    const [banReason, setBanReason] = useState<string>('');
    const [banLoading, setBanLoading] = useState(false);
    const userActionMessageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    // Анимация для userActionMessage
    useEffect(() => {
        if (userActionMessage && userActionMessageRef.current) {
            // Сбрасываем display перед анимацией появления
            if (userActionMessageRef.current.style.display === 'none') {
                userActionMessageRef.current.style.display = '';
            }
            gsap.fromTo(userActionMessageRef.current,
                { opacity: 0, y: -10, scale: 0.95 },
                {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: GSAP_DEFAULT_DURATION,
                    ease: GSAP_DEFAULT_EASE
                }
            );
        } else if (!userActionMessage && userActionMessageRef.current) {
            gsap.to(userActionMessageRef.current,
                {
                    opacity: 0,
                    y: -10,
                    scale: 0.95,
                    duration: GSAP_DEFAULT_DURATION,
                    ease: GSAP_DEFAULT_EASE,
                    onComplete: () => {
                        if (userActionMessageRef.current) {
                            userActionMessageRef.current.style.display = 'none';
                        }
                    }
                }
            );
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
    }, [showAddRoleMenu]);

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

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedSearch(userSearch.trim());
        }, 350);

        return () => clearTimeout(timeoutId);
    }, [userSearch]);

    const checkAuthStatus = async () => {
        try {
            const response = await fetch('/api/admin/check');
            const data = await response.json();
            setAuthState(data);
        } catch (error) {
            console.error('Error checking auth status:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch('/api/admin/logout', { method: 'POST' });
            setAuthState((prev) => ({
                ...prev,
                isAuthenticated: false,
                username: null,
            }));
            checkAuthStatus();
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const sortUsersByRole = useCallback((users: PanelUser[], sort: 'asc' | 'desc'): PanelUser[] => {
        return [...users].sort((a: PanelUser, b: PanelUser) => {
            // Определяем самую старшую роль для каждого пользователя
            const getHighestRole = (user: PanelUser): number => {
                if (!user.roles || user.roles.length === 0) return 3;
                if (user.roles.includes('admin')) return 1;
                if (user.roles.includes('support')) return 2; 
                return 3; // user
            };

            const roleA = getHighestRole(a);
            const roleB = getHighestRole(b);

            // Сначала сортируем по ролям
            if (roleA !== roleB) {
                return roleA - roleB; // admin (1) < support (2) < user (3)
            }

            // Если роли одинаковые, применяем обычную сортировку по username
            const usernameA = (a.username || '').toLowerCase();
            const usernameB = (b.username || '').toLowerCase();

            if (sort === 'asc') {
                return usernameA.localeCompare(usernameB);
            } else {
                return usernameB.localeCompare(usernameA);
            }
        });
    }, []);

    const fetchUsers = useCallback(
        async (query: string, sort: 'asc' | 'desc') => {
            if (!authState.isAuthenticated) return;
            setUsersLoading(true);
            setUsersError('');
            try {
                const params = new URLSearchParams();
                if (query) {
                    params.set('q', query);
                }
                params.set('order', sort);
                const response = await fetch(
                    `/api/admin/users?${params.toString()}`,
                    { credentials: 'include' },
                );
                const data = await response.json();
                if (!response.ok) {
                    setUsers([]);
                    setUsersError(data.error || 'Не удалось загрузить пользователей');
                    return;
                }

                // Сортируем пользователей: сначала по ролям (admin > support > user), затем по обычной сортировке
                const sortedUsers = sortUsersByRole(Array.isArray(data.users) ? data.users : [], sort);

                // Сохраняем количество пользователей в localStorage для skeleton loader
                if (typeof window !== 'undefined') {
                    if (sortedUsers.length > 0) {
                        localStorage.setItem('admin_panel_users_count', sortedUsers.length.toString());
                    } else {
                        // Если пользователей нет, сохраняем 0, чтобы не показывать skeleton loader
                        localStorage.setItem('admin_panel_users_count', '0');
                    }
                }

                setUsers(sortedUsers);
            } catch (error) {
                console.error('Failed to load users:', error);
                setUsers([]);
                setUsersError('Ошибка загрузки списка пользователей');
            } finally {
                setUsersLoading(false);
            }
        },
        [authState.isAuthenticated, sortUsersByRole],
    );

    useEffect(() => {
        if (authState.isAuthenticated && activeTab === 'users') {
            fetchUsers(debouncedSearch, sortDirection);
        }
    }, [activeTab, authState.isAuthenticated, debouncedSearch, fetchUsers, sortDirection]);

    // Сохранение активной вкладки в localStorage
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

    const handleBanUser = (user: PanelUser) => {
        setBanUser(user);
        setBanDuration(1);
        setBanReason('');
    };

    const handleBanSubmit = async () => {
        if (!banUser || !banReason.trim() || (typeof banDuration === 'number' && banDuration < 1)) return;

        setBanLoading(true);
        try {
            // TODO: Реализовать API для бана пользователя
            // const response = await fetch('/api/admin/users/ban', {
            //   method: 'POST',
            //   headers: { 'Content-Type': 'application/json' },
            //   credentials: 'include',
            //   body: JSON.stringify({
            //     userId: banUser.id,
            //     duration: banDuration,
            //     reason: banReason
            //   })
            // });

            // Временная заглушка
            const durationText = banDuration === 'forever'
                ? 'навсегда'
                : `${banDuration} ${banDuration === 1 ? 'день' : banDuration < 5 ? 'дня' : 'дней'}`;
            setUserActionMessage(`Пользователь ${banUser.username.toUpperCase()} заблокирован на ${durationText}`);
            setTimeout(() => setUserActionMessage(''), 3000);
            setBanUser(null);
            setBanReason('');
            setBanDuration(1);
        } catch (error) {
            console.error('Error banning user:', error);
            setUserActionMessage('Ошибка при бане пользователя');
            setTimeout(() => setUserActionMessage(''), 3000);
        } finally {
            setBanLoading(false);
        }
    };

    const handleManageRoles = async (user: PanelUser) => {
        if (!user || !user.id) return;
        setSelectedUser(user);
        setRolesLoading(true);
        try {
            const response = await fetch(`/api/admin/users/roles?userId=${user.id}`, {
                credentials: 'include'
            });
            if (!response.ok) {
                // Тихо обрабатываем ошибки, не логируем в консоль
                setUserRoles([]);
                return;
            }
            const data = await response.json();
            setUserRoles(data.roles || []);
        } catch {
            // Тихо обрабатываем ошибки, не логируем в консоль
            setUserRoles([]);
        } finally {
            setRolesLoading(false);
        }
    };

    // Фоновая синхронизация ролей без показа спиннера
    const refreshUserRoles = async (user: PanelUser) => {
        if (!user || !user.id) return;
        try {
            const response = await fetch(`/api/admin/users/roles?userId=${user.id}`, {
                credentials: 'include'
            });
            if (!response.ok) {
                // Тихо обрабатываем ошибки, не логируем в консоль
                return;
            }
            const data = await response.json();
            const updatedRoles = data.roles || [];
            // Обновляем роли в модальном окне
            setUserRoles(updatedRoles);
            // Обновляем роли в основном списке пользователей
            setUsers(prev => {
                const updated = prev.map(u =>
                    u.id === user.id
                        ? { ...u, roles: updatedRoles }
                        : u
                );
                return sortUsersByRole(updated, sortDirection);
            });
        } catch {
            // Тихо обрабатываем ошибки, не логируем в консоль
        }
    };

    const handleGrantRole = async (role: 'support' | 'admin') => {
        if (!selectedUser || roleActionLoading) return;

        const actionKey = `grant-${role}`;
        setRoleActionLoading(actionKey);

        try {
            const response = await fetch('/api/admin/users/roles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    userId: selectedUser.id,
                    role
                })
            });
            const data = await response.json();
            if (response.ok) {
                // Оптимистично обновляем список ролей в модальном окне
                setUserRoles(prev => [...prev, role]);
                // Обновляем роль в основном списке пользователей
                setUsers(prev => {
                    const updated = prev.map(user =>
                        user.id === selectedUser.id
                            ? { ...user, roles: [...(user.roles || []), role] }
                            : user
                    );
                    return sortUsersByRole(updated, sortDirection);
                });
                setUserActionMessage(`Роль выдана ${selectedUser.username.toUpperCase()}`);
                setTimeout(() => setUserActionMessage(''), 2500);
                // Обновляем список ролей в фоне для синхронизации (без спиннера)
                refreshUserRoles(selectedUser);
            } else {
                setUserActionMessage(data.error || 'Ошибка выдачи роли');
                setTimeout(() => setUserActionMessage(''), 2500);
                // Откатываем оптимистичное обновление при ошибке
                refreshUserRoles(selectedUser);
            }
        } catch (error) {
            console.error('Error granting role:', error);
            setUserActionMessage('Ошибка выдачи роли');
            setTimeout(() => setUserActionMessage(''), 2500);
            // Откатываем оптимистичное обновление при ошибке
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
            const response = await fetch(`/api/admin/users/roles?userId=${selectedUser.id}&role=${role}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok) {
                // Оптимистично обновляем список ролей в модальном окне
                setUserRoles(prev => prev.filter(r => r !== role));
                // Обновляем роль в основном списке пользователей
                setUsers(prev => {
                    const updated = prev.map(user =>
                        user.id === selectedUser.id
                            ? { ...user, roles: (user.roles || []).filter(r => r !== role) }
                            : user
                    );
                    return sortUsersByRole(updated, sortDirection);
                });
                setUserActionMessage(`Роль "${role}" отозвана у пользователя ${selectedUser.username.toUpperCase()}`);
                setTimeout(() => setUserActionMessage(''), 2500);
                // Обновляем список ролей в фоне для синхронизации (без спиннера)
                refreshUserRoles(selectedUser);
            } else {
                setUserActionMessage(data.error || 'Ошибка отзыва роли');
                setTimeout(() => setUserActionMessage(''), 2500);
                // Откатываем оптимистичное обновление при ошибке
                refreshUserRoles(selectedUser);
            }
        } catch (error) {
            console.error('Error revoking role:', error);
            setUserActionMessage('Ошибка отзыва роли');
            setTimeout(() => setUserActionMessage(''), 2500);
            // Откатываем оптимистичное обновление при ошибке
            refreshUserRoles(selectedUser);
        } finally {
            setRoleActionLoading(null);
        }
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!authState.isAuthenticated) {
        return <AdminAuthForm onAuthSuccess={checkAuthStatus} />;
    }

    const tabs = [
        { id: 'dashboard', name: 'Обзор', icon: '📊' },
        { id: 'users', name: 'Пользователи', icon: '👥' },
        { id: 'servers', name: 'Серверы', icon: '🖥️' },
        { id: 'analytics', name: 'Аналитика', icon: '📈' },
        { id: 'settings', name: 'Настройки', icon: '⚙️' },
    ];

    return (
        <div className={`flex h-screen transition-all duration-700 ease-out ${showPanel ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}>
            {/* Mobile Menu Overlay */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`
        fixed md:static inset-y-0 left-0 z-50 md:z-auto
        w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
                {/* Header */}
                <div className="p-6 border-b border-neutral-800">
                    <div className="flex items-center space-x-3">
                        <div>
                            <h1 className="text-lg font-semibold text-white">RVN</h1>
                            <p className="text-xs text-neutral-400">NextJS 16.0.7 / React 19.1.0</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setActiveTab(tab.id);
                                // Закрываем мобильное меню при выборе вкладки
                                if (window.innerWidth < 768) {
                                    setMobileMenuOpen(false);
                                }
                            }}
                            className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-all duration-200 touch-manipulation ${activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-neutral-300 hover:bg-neutral-800 hover:text-white active:bg-neutral-700'
                                }`}
                        >
                            <span className="text-lg">{tab.icon}</span>
                            <span className="font-medium text-sm sm:text-base">{tab.name}</span>
                        </button>
                    ))}
                </nav>

                {/* Bottom Navigation */}
                <div className="p-4 border-t border-neutral-800">
                    <button
                        onClick={() => {
                            router.push('/ui/panel');
                            if (window.innerWidth < 768) {
                                setMobileMenuOpen(false);
                            }
                        }}
                        className="w-full flex items-center space-x-3 px-3 py-3 rounded-lg text-left transition-all duration-200 touch-manipulation text-neutral-300 hover:bg-neutral-800 hover:text-white active:bg-neutral-700"
                    >
                        <span className="text-lg">🗂</span>
                        <span className="font-medium text-sm sm:text-base">Сменить панель</span>
                    </button>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800">
                    <div className="text-xs text-neutral-500">
                        <p>Версия: {APP_VERSION}</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col lg:ml-0">
                {/* Top Bar */}
                <header className="bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            {/* Mobile Menu Button */}
                            <button
                                onClick={() => setMobileMenuOpen(true)}
                                className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors touch-manipulation"
                                aria-label="Открыть меню"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>

                            <h2 className="text-lg sm:text-xl font-semibold text-white capitalize">
                                {tabs.find(tab => tab.id === activeTab)?.name}
                            </h2>
                        </div>

                        <div className="flex items-center space-x-2 sm:space-x-4">
                            <div className="hidden sm:block text-sm text-neutral-400">
                                {authState.username}
                            </div>
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                {authState.username?.charAt(0).toUpperCase() || 'A'}
                            </div>
                            <button
                                onClick={handleLogout}
                                className="px-3 py-2 text-sm text-neutral-400 hover:text-white border border-neutral-600 hover:border-neutral-500 rounded-lg transition-colors touch-manipulation active:bg-neutral-800"
                            >
                                <span className="hidden sm:inline">Выйти</span>
                                <span className="sm:hidden">🚪</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
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
                                        <p className="text-sm text-neutral-400 mt-1">
                                            Всего записей: {users.length}
                                        </p>
                                    </div>
                                    <div className="user-search">
                                        <div className="user-search-wrapper">
                                            <svg
                                                className="user-search-icon"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.6}
                                                    d="M11 5a6 6 0 014.472 10.07l3.679 3.679a1 1 0 01-1.414 1.414l-3.679-3.679A6 6 0 1111 5z"
                                                />
                                            </svg>
                                            <input
                                                type="text"
                                                className="user-search-input"
                                                placeholder="Поиск по логину или ID"
                                                value={userSearch}
                                                onChange={(e) => setUserSearch(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={() => fetchUsers(debouncedSearch, sortDirection)}
                                            className="user-refresh-btn"
                                            disabled={usersLoading}
                                        >
                                            <svg
                                                className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`}
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
                                            onClick={() =>
                                                setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                                            }
                                        >
                                            Создан
                                            <svg
                                                className={`sort-arrow ${sortDirection === 'desc' ? 'down' : 'up'}`}
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6-6 6 6M18 15l-6 6-6-6" />
                                            </svg>
                                        </button>
                                        <span>Действия</span>
                                    </div>

                                    <div className="user-table-body">
                                        {usersLoading && (() => {
                                            // Получаем сохраненное количество пользователей из localStorage
                                            const savedCount = typeof window !== 'undefined'
                                                ? parseInt(localStorage.getItem('admin_panel_users_count') || '3', 10)
                                                : 3;
                                            // Если сохранено 0, не показываем skeleton loader
                                            if (savedCount === 0) return null;
                                            const skeletonCount = savedCount > 0 ? savedCount : 3;

                                            return Array.from({ length: skeletonCount }).map((_, index) => (
                                                <div key={index} className="user-row user-row-loading">
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
                                                <span>Попробуйте изменить запрос или обновить список</span>
                                            </div>
                                        )}

                                        {!usersLoading &&
                                            users.map((user) => {
                                                // Определяем самую старшую роль (admin > support > user)
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

                                                // Определяем цвет логина в зависимости от роли
                                                const getUsernameColor = () => {
                                                    if (highestRole === 'admin') {
                                                        return '!text-purple-400';
                                                    } else if (highestRole === 'support') {
                                                        return '!text-green-400';
                                                    }
                                                    return ''; // Обычный цвет для клиентов (из CSS)
                                                };

                                                return (
                                                    <div key={user.id} className="user-row">
                                                        <div>
                                                            <p className={`user-primary ${getUsernameColor()}`}>{user.username}</p>
                                                            <span className="user-muted">
                                                                {user.is_active ? 'Активен' : 'Отключен'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <p className={`user-primary tracking-wide ${getUsernameColor()}`}>{user.user_id}</p>
                                                            <span className="user-muted">Идентификатор</span>
                                                        </div>
                                                        <div>
                                                            {(() => {

                                                                if (highestRole) {
                                                                    const roleText = highestRole === 'support' ? 'Поддержка' : highestRole === 'admin' ? 'Админ' : 'Клиент';
                                                                    const isSupport = highestRole === 'support';
                                                                    const isClient = highestRole === 'user';
                                                                    const isAdmin = highestRole === 'admin';
                                                                    return (
                                                                        <span className={`px-2.5 py-1.5 rounded-md text-sm inline-flex items-center gap-2 ${isSupport
                                                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                                            : isClient
                                                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                                                : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                                                            }`}>
                                                                            {isClient && (
                                                                                <Image
                                                                                    src="/static/panel/roles/clients.svg"
                                                                                    alt="Клиент"
                                                                                    width={16}
                                                                                    height={16}
                                                                                    className="w-4 h-4"
                                                                                />
                                                                            )}
                                                                            {isSupport && (
                                                                                <Image
                                                                                    src="/static/panel/roles/supports.svg"
                                                                                    alt="Поддержка"
                                                                                    width={16}
                                                                                    height={16}
                                                                                    className="w-4 h-4"
                                                                                />
                                                                            )}
                                                                            {isAdmin && (
                                                                                <Image
                                                                                    src="/static/panel/roles/admins.svg"
                                                                                    alt="Админ"
                                                                                    width={16}
                                                                                    height={16}
                                                                                    className="w-4 h-4"
                                                                                />
                                                                            )}
                                                                            {roleText}
                                                                        </span>
                                                                    );
                                                                }
                                                                return (
                                                                    <span className="px-2.5 py-1.5 bg-neutral-800 rounded-md text-sm text-neutral-400">
                                                                        Нет роли
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div>
                                                            <span className="user-date" title={user.created_at}>
                                                                {formatDateShort(user.created_at)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <button
                                                                onClick={() => handleManageRoles(user)}
                                                                className="p-2 text-purple-400 hover:bg-neutral-800 rounded-lg transition-colors relative group"
                                                                title="Управление ролями"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleSubscriptionManage(user)}
                                                                className="p-2 text-blue-400 hover:bg-neutral-800 rounded-lg transition-colors relative group"
                                                                title="Управление подпиской"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleBanUser(user)}
                                                                className="p-2 text-red-400 hover:bg-neutral-800 rounded-lg transition-colors relative group"
                                                                title="Заблокировать"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                </svg>
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
                        <div className="flex items-center justify-center h-64 text-neutral-500">
                            Раздел &quot;Серверы&quot; в разработке
                        </div>
                    )}

                    {activeTab === 'analytics' && (
                        <div className="space-y-6">
                            <SupportAnalytics />
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
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => {
                    if (e.target === e.currentTarget) setSelectedUser(null);
                }}>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden role-menu-container">
                        <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">Управление ролями</h3>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="text-neutral-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-neutral-950 rounded-lg border border-neutral-800">
                                <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center text-lg font-bold text-neutral-400">
                                    {selectedUser.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-medium text-white">{selectedUser.username}</div>
                                    <div className="text-xs text-neutral-500">{selectedUser.user_id}</div>
                                </div>
                            </div>

                            <div className="space-y-2 min-h-[280px]">
                                {rolesLoading ? (
                                    <>
                                        <div className="h-4 w-32 bg-neutral-800 rounded animate-pulse mb-4" />
                                        {/* Skeleton Client Role */}
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-neutral-800 animate-pulse" />
                                                <div className="space-y-2">
                                                    <div className="h-4 w-20 bg-neutral-800 rounded animate-pulse" />
                                                    <div className="h-3 w-24 bg-neutral-800 rounded animate-pulse" />
                                                </div>
                                            </div>
                                            <div className="h-6 w-16 bg-neutral-800 rounded animate-pulse" />
                                        </div>
                                        {/* Skeleton Support Role */}
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-neutral-800 animate-pulse" />
                                                <div className="space-y-2">
                                                    <div className="h-4 w-24 bg-neutral-800 rounded animate-pulse" />
                                                    <div className="h-3 w-28 bg-neutral-800 rounded animate-pulse" />
                                                </div>
                                            </div>
                                            <div className="h-6 w-20 bg-neutral-800 rounded animate-pulse" />
                                        </div>
                                        {/* Skeleton Admin Role */}
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-neutral-800 animate-pulse" />
                                                <div className="space-y-2">
                                                    <div className="h-4 w-28 bg-neutral-800 rounded animate-pulse" />
                                                    <div className="h-3 w-24 bg-neutral-800 rounded animate-pulse" />
                                                </div>
                                            </div>
                                            <div className="h-6 w-20 bg-neutral-800 rounded animate-pulse" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h4 className="text-sm text-neutral-400 uppercase tracking-wider font-semibold mb-2">Назначенные роли</h4>

                                        {/* Default User Role - Always Active */}
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                                                    <Image
                                                        src="/static/panel/roles/clients.svg"
                                                        alt="Клиент"
                                                        width={16}
                                                        height={16}
                                                        className="w-4 h-4"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-white">Клиент</div>
                                                    <div className="text-xs text-neutral-500">Базовая роль</div>
                                                </div>
                                            </div>
                                            <div className="px-2 py-1 bg-green-500/10 text-green-500 text-xs rounded border border-green-500/20">
                                                Активна
                                            </div>
                                        </div>

                                        {/* Support Role */}
                                        <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${userRoles.includes('support')
                                            ? 'bg-green-950/20 border border-green-500/20'
                                            : 'bg-neutral-950/50 border border-neutral-800/50'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${userRoles.includes('support') ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-500'
                                                    }`}>
                                                    <Image
                                                        src="/static/panel/roles/supports.svg"
                                                        alt="Поддержка"
                                                        width={16}
                                                        height={16}
                                                        className={`w-4 h-4 ${!userRoles.includes('support') && 'grayscale opacity-50'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-white">Поддержка</div>
                                                    <div className="text-xs text-neutral-500">Доступ к тикетам</div>
                                                </div>
                                            </div>
                                            <button
                                                disabled={!!roleActionLoading}
                                                onClick={() => userRoles.includes('support') ? handleRevokeRole('support') : handleGrantRole('support')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${roleActionLoading === 'grant-support' || roleActionLoading === 'revoke-support'
                                                    ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                                                    : userRoles.includes('support')
                                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                                        : 'bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-900/20'
                                                    }`}
                                            >
                                                {roleActionLoading === 'grant-support' || roleActionLoading === 'revoke-support' ? (
                                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                                                ) : userRoles.includes('support') ? 'Отозвать' : 'Выдать'}
                                            </button>
                                        </div>

                                        {/* Admin Role */}
                                        <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${userRoles.includes('admin')
                                            ? 'bg-purple-950/20 border border-purple-500/20'
                                            : 'bg-neutral-950/50 border border-neutral-800/50'
                                            }`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${userRoles.includes('admin') ? 'bg-purple-500/20 text-purple-400' : 'bg-neutral-800 text-neutral-500'
                                                    }`}>
                                                    <Image
                                                        src="/static/panel/roles/admins.svg"
                                                        alt="Админ"
                                                        width={16}
                                                        height={16}
                                                        className={`w-4 h-4 ${!userRoles.includes('admin') && 'grayscale opacity-50'}`}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-white">Администратор</div>
                                                    <div className="text-xs text-neutral-500">Полный доступ</div>
                                                </div>
                                            </div>
                                            <button
                                                disabled={!!roleActionLoading}
                                                onClick={() => userRoles.includes('admin') ? handleRevokeRole('admin') : handleGrantRole('admin')}
                                                className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${roleActionLoading === 'grant-admin' || roleActionLoading === 'revoke-admin'
                                                    ? 'bg-neutral-800 text-neutral-500 cursor-wait'
                                                    : userRoles.includes('admin')
                                                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                                                        : 'bg-green-600 text-white hover:bg-green-500 shadow-lg shadow-green-900/20'
                                                    }`}
                                            >
                                                {roleActionLoading === 'grant-admin' || roleActionLoading === 'revoke-admin' ? (
                                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                                                ) : userRoles.includes('admin') ? 'Отозвать' : 'Выдать'}
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
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => {
                    if (e.target === e.currentTarget) setBanUser(null);
                }}>
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-sm overflow-hidden">
                        <div className="p-4 border-b border-neutral-800">
                            <h3 className="text-lg font-semibold text-white">Блокировка пользователя</h3>
                        </div>

                        <div className="p-4 space-y-4">
                            <div className="text-sm text-neutral-400">
                                Вы собираетесь заблокировать <span className="text-white font-medium">{banUser.username}</span>.
                                Выберите длительность и укажите причину.
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-neutral-500 uppercase font-semibold">Длительность</label>
                                <div className="grid grid-cols-4 gap-2">
                                    <button
                                        onClick={() => setBanDuration(1)}
                                        className={`px-2 py-1.5 text-sm rounded border ${banDuration === 1 ? 'bg-white text-black border-white' : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600'}`}
                                    >
                                        1 день
                                    </button>
                                    <button
                                        onClick={() => setBanDuration(7)}
                                        className={`px-2 py-1.5 text-sm rounded border ${banDuration === 7 ? 'bg-white text-black border-white' : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600'}`}
                                    >
                                        7 дней
                                    </button>
                                    <button
                                        onClick={() => setBanDuration(30)}
                                        className={`px-2 py-1.5 text-sm rounded border ${banDuration === 30 ? 'bg-white text-black border-white' : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600'}`}
                                    >
                                        30 дней
                                    </button>
                                    <button
                                        onClick={() => setBanDuration('forever')}
                                        className={`px-2 py-1.5 text-sm rounded border ${banDuration === 'forever' ? 'bg-red-500 text-white border-red-500' : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:border-neutral-600'}`}
                                    >
                                        Навсегда
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs text-neutral-500 uppercase font-semibold">Причина</label>
                                <textarea
                                    value={banReason}
                                    onChange={(e) => setBanReason(e.target.value)}
                                    placeholder="BRUH.."
                                    className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-neutral-600 resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setBanUser(null)}
                                    className="flex-1 px-4 py-2 bg-neutral-800 text-white text-sm font-medium rounded-lg hover:bg-neutral-700 transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={handleBanSubmit}
                                    disabled={banLoading || !banReason.trim()}
                                    className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

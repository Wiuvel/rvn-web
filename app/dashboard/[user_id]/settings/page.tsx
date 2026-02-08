'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Monitor, Smartphone, Trash2, Clock, Globe, ShieldCheck, Lock, Key } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordChangeSchema, PasswordChangeFormData } from '@/lib/validation/schemas';

interface Device {
  id: string;
  device_name: string;
  ip_address: string;
  location: string | null;
  last_active: string;
  created_at: string;
  is_current: boolean;
}

// Skeleton component for the settings page (Header removed)
function SettingsSkeleton() {
  return (
    <main className="pt-6 lg:pt-32 pb-16 relative overflow-hidden">
        {/* Background effects from dashboard */}
        <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
        <defs>
        <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
        </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#dash-grad)" />
        <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
        <line x1="0" y1="25%" x2="100%" y2="25%"/>
        <line x1="0" y1="50%" x2="100%" y2="50%"/>
        <line x1="0" y1="75%" x2="100%" y2="75%"/>
        </g>
    </svg>
    <div className="pointer-events-none absolute -top-32 -right-20 w-80 h-80 bg-primary-500/10 blur-3xl rounded-full -z-10"></div>
    <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 blur-[100px] rounded-full -z-10"></div>

    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
        <div className="h-4 w-96 bg-neutral-800/50 rounded-lg animate-pulse"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Password Change Skeleton */}
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 h-fit">
            <div className="flex items-center gap-3 mb-6">
            <div>
                <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse mb-2"></div>
                <div className="h-3 w-48 bg-neutral-800/50 rounded animate-pulse"></div>
            </div>
            </div>
            <div className="space-y-4">
            {[1, 2, 3].map((i) => (
                <div key={i}>
                <div className="h-4 w-24 bg-neutral-800 rounded animate-pulse mb-2"></div>
                <div className="h-10 w-full bg-neutral-800 rounded-xl animate-pulse"></div>
                </div>
            ))}
            <div className="h-10 w-full bg-neutral-800 rounded-xl animate-pulse mt-2"></div>
            </div>
        </div>

        {/* Active Sessions Skeleton */}
        <div className="lg:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
            <div>
                <div className="h-5 w-32 bg-neutral-800 rounded animate-pulse mb-2"></div>
                <div className="h-3 w-48 bg-neutral-800/50 rounded animate-pulse"></div>
            </div>
            </div>
            <div className="space-y-4">
            {[1].map((i) => (
                <div key={i} className="flex flex-col sm:flex-row justify-between p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl gap-4">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-neutral-800 rounded-lg animate-pulse"></div>
                    <div>
                    <div className="h-5 w-40 bg-neutral-800 rounded animate-pulse mb-2"></div>
                    <div className="h-3 w-32 bg-neutral-800/50 rounded animate-pulse"></div>
                    </div>
                </div>
                </div>
            ))}
            </div>
        </div>
        </div>
    </div>
    </main>
  );
}


// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Только что';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} дн. назад`;
  
  return date.toLocaleDateString('ru-RU');
}

// Helper to format device name "Browser on OS" -> "Browser (OS)"
function formatDeviceName(deviceName: string): string {
  if (deviceName.includes(' on ')) {
    return deviceName.replace(' on ', ' (').trim() + ')';
  }
  return deviceName;
}

export default function SettingsPage() {
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth'
  });

  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema)
  });

  useEffect(() => {
    if (userData) {
        fetchDevices();
    }
  }, [userData]);

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/auth/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices);
      } else {
        setError('Failed to fetch devices');
      }
    } catch (error) {
      console.error('Failed to fetch devices', error);
      setError('Failed to load devices');
    } finally {
      setLoadingDevices(false);
    }
  };

  const revokeDevice = async (deviceId: string) => {
    if (!confirm('Вы уверены, что хотите завершить сеанс на этом устройстве?')) return;
    
    try {
      const res = await fetch(`/api/auth/devices/${deviceId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDevices(devices.filter(d => d.id !== deviceId));
      } else {
        alert('Не удалось завершить сеанс');
      }
    } catch (error) {
      console.error('Error revoking device', error);
      alert('Ошибка при завершении сеанса');
    }
  };

  const onChangePassword = async (data: PasswordChangeFormData) => {
    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const res = await fetch('/api/auth/password/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: data.oldPassword,
          newPassword: data.newPassword,
          confirmNewPassword: data.confirmNewPassword
        })
      });

      const result = await res.json();

      if (!res.ok) {
        setPasswordError(result.error || 'Ошибка при смене пароля');
      } else {
        setPasswordSuccess('Пароль успешно изменен. Другие сессии завершены.');
        reset();
        // Refresh devices list as other sessions are invalidated
        fetchDevices();
      }
    } catch (error) {
      setPasswordError('Произошла ошибка при смене пароля');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!userData) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
        <Header />
        
        {authLoading ? <SettingsSkeleton /> : (
        /* Adjusted padding: pt-6 for mobile (header relative), pt-32 for desktop (header fixed) */
        <main className="pt-6 lg:pt-32 pb-16 relative overflow-hidden">
            {/* Background effects from dashboard */}
            <svg className="absolute inset-0 w-full h-full opacity-20 -z-10" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
                  <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18"/>
                  <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#dash-grad)" />
              <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
                <line x1="0" y1="25%" x2="100%" y2="25%"/>
                <line x1="0" y1="50%" x2="100%" y2="50%"/>
                <line x1="0" y1="75%" x2="100%" y2="75%"/>
              </g>
            </svg>
            <div className="pointer-events-none absolute -top-32 -right-20 w-80 h-80 bg-primary-500/10 blur-3xl rounded-full -z-10"></div>
            <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 bg-white/5 blur-[100px] rounded-full -z-10"></div>

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <p className="text-neutral-400">Управление безопасностью и активными сессиями</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Password Change Section */}
                    <section className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm h-fit">
                        <div className="flex items-center gap-3 mb-6">
                            <div>
                                <h2 className="text-xl font-semibold">Безопасность</h2>
                                <p className="text-sm text-neutral-400">Смена пароля и защита</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4 w-full">
                            <div>
                                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                                    Текущий пароль
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                                        <Lock className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="password"
                                        {...register('oldPassword')}
                                        className="w-full pl-10 pr-4 py-2.5 bg-neutral-950/50 border border-neutral-800 rounded-xl focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                                {errors.oldPassword && (
                                    <p className="mt-1 text-sm text-red-400">{errors.oldPassword.message}</p>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                                        Новый пароль
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                                            <Key className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="password"
                                            {...register('newPassword')}
                                            className="w-full pl-10 pr-4 py-2.5 bg-neutral-950/50 border border-neutral-800 rounded-xl focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    {errors.newPassword && (
                                        <p className="mt-1 text-sm text-red-400">{errors.newPassword.message}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                                        Повторите пароль
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                                            <Key className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="password"
                                            {...register('confirmNewPassword')}
                                            className="w-full pl-10 pr-4 py-2.5 bg-neutral-950/50 border border-neutral-800 rounded-xl focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    {errors.confirmNewPassword && (
                                        <p className="mt-1 text-sm text-red-400">{errors.confirmNewPassword.message}</p>
                                    )}
                                </div>
                            </div>

                            {passwordError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                                    {passwordError}
                                </div>
                            )}

                            {passwordSuccess && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm text-emerald-400">
                                    {passwordSuccess}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isChangingPassword}
                                className="w-full px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                            >
                                {isChangingPassword ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Сохранение...
                                    </>
                                ) : (
                                    'Обновить пароль'
                                )}
                            </button>
                        </form>
                    </section>

                    {/* Active Sessions Section */}
                    <section className="lg:col-span-2 bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div>
                                <h2 className="text-xl font-semibold">Активные сессии</h2>
                                <p className="text-sm text-neutral-400">Устройства, имеющие доступ к аккаунту</p>
                            </div>
                        </div>

                        {loadingDevices ? (
                            <div className="space-y-4">
                                {[1].map((i) => (
                                <div key={i} className="flex flex-col sm:flex-row justify-between p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl gap-4">
                                    <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 bg-neutral-800 rounded-lg animate-pulse"></div>
                                    <div>
                                        <div className="h-5 w-40 bg-neutral-800 rounded animate-pulse mb-2"></div>
                                        <div className="h-3 w-32 bg-neutral-800/50 rounded animate-pulse"></div>
                                    </div>
                                    </div>
                                </div>
                                ))}
                            </div>
                        ) : error ? (
                            <div className="text-red-400 text-center py-4">{error}</div>
                        ) : (
                            <div className="space-y-4">
                                {devices.map((device) => (
                                    <div key={device.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-neutral-950/50 border border-neutral-800 rounded-xl gap-4 hover:border-neutral-700 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-neutral-800/50 rounded-lg text-neutral-400">
                                                {device.device_name.toLowerCase().includes('mobile') || device.device_name.toLowerCase().includes('android') || device.device_name.toLowerCase().includes('iphone') ? (
                                                    <Smartphone className="w-6 h-6" />
                                                ) : (
                                                    <Monitor className="w-6 h-6" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-medium text-white">{formatDeviceName(device.device_name)}</h3>
                                                    {device.is_current && (
                                                        <span className="px-2 py-0.5 text-xs font-medium bg-primary-500/20 text-primary-400 rounded-full border border-primary-500/20">
                                                            Это устройство
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col sm:flex-row sm:items-center gap-y-1 gap-x-4 mt-1 text-sm text-neutral-500">
                                                    <div className="flex items-center gap-1.5">
                                                        <Globe className="w-3.5 h-3.5" />
                                                        {device.ip_address}
                                                        {device.location ? ` • ${device.location}` : ''}
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        Активность: {formatRelativeTime(device.last_active)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {!device.is_current && (
                                            <button 
                                                onClick={() => revokeDevice(device.id)}
                                                className="px-3 py-2 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Завершить
                                            </button>
                                        )}
                                    </div>
                                ))}

                                {devices.length === 0 && (
                                    <div className="text-center py-8 text-neutral-500">
                                        Нет активных сессий.
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </main>
        )}
    </div>
  );
}

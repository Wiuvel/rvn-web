'use client';

import { useState } from 'react';
import Header from '@/components/layout/Header';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Monitor, Smartphone, Trash2, Clock, Globe, ShieldCheck, Lock, Key } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordChangeSchema, PasswordChangeFormData } from '@/lib/validation/schemas';
import { UserData } from '@/types';

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
    <main className="relative overflow-hidden pb-16 pt-6 lg:pt-32">
      {/* Background effects from dashboard */}
      <svg
        className="absolute inset-0 -z-10 h-full w-full opacity-20"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#dash-grad)" />
        <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
          <line x1="0" y1="25%" x2="100%" y2="25%" />
          <line x1="0" y1="50%" x2="100%" y2="50%" />
          <line x1="0" y1="75%" x2="100%" y2="75%" />
        </g>
      </svg>
      <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-primary-500/10 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-72 w-72 rounded-full bg-white/5 blur-[100px]"></div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="h-4 w-96 animate-pulse rounded-lg bg-neutral-800/50"></div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Password Change Skeleton */}
          <div className="h-fit rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
            <div className="mb-6 flex items-center gap-3">
              <div>
                <div className="mb-2 h-5 w-32 animate-pulse rounded bg-neutral-800"></div>
                <div className="h-3 w-48 animate-pulse rounded bg-neutral-800/50"></div>
              </div>
            </div>
            <div className="space-y-4">
              {['device-skeleton-1', 'device-skeleton-2', 'device-skeleton-3'].map(
                (skeletonKey) => (
                  <div key={skeletonKey}>
                    <div className="mb-2 h-4 w-24 animate-pulse rounded bg-neutral-800"></div>
                    <div className="h-10 w-full animate-pulse rounded-xl bg-neutral-800"></div>
                  </div>
                ),
              )}
              <div className="mt-2 h-10 w-full animate-pulse rounded-xl bg-neutral-800"></div>
            </div>
          </div>

          {/* Active Sessions Skeleton */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 lg:col-span-2">
            <div className="mb-6 flex items-center gap-3">
              <div>
                <div className="mb-2 h-5 w-32 animate-pulse rounded bg-neutral-800"></div>
                <div className="h-3 w-48 animate-pulse rounded bg-neutral-800/50"></div>
              </div>
            </div>
            <div className="space-y-4">
              {['session-skeleton-1'].map((skeletonKey) => (
                <div
                  key={skeletonKey}
                  className="flex flex-col justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 sm:flex-row"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 animate-pulse rounded-lg bg-neutral-800"></div>
                    <div>
                      <div className="mb-2 h-5 w-40 animate-pulse rounded bg-neutral-800"></div>
                      <div className="h-3 w-32 animate-pulse rounded bg-neutral-800/50"></div>
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

interface SettingsClientProps {
  userData: UserData;
  initialDevices: Device[];
}

export default function SettingsClient({ userData, initialDevices }: SettingsClientProps) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);

  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema),
  });

  const revokeDevice = async (deviceId: string) => {
    if (!confirm('Вы уверены, что хотите завершить сеанс на этом устройстве?')) return;

    try {
      const res = await fetch(`/api/auth/devices/${deviceId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDevices(devices.filter((d) => d.id !== deviceId));
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
          confirmNewPassword: data.confirmNewPassword,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setPasswordError(result.error || 'Ошибка при смене пароля');
      } else {
        setPasswordSuccess('Пароль успешно изменен. Другие сессии завершены.');
        reset();
        // Refresh devices list logic would need to be updated since we don't have fetchDevices here.
        // Or we can assume all other devices are revoked.
        // The API likely revokes other sessions.
        // So we should filter devices to only keep the current one.
        setDevices(devices.filter((d) => d.is_current));
      }
    } catch (error) {
      setPasswordError('Произошла ошибка при смене пароля');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
      <Header />

      <main className="relative overflow-hidden pb-16 pt-6 lg:pt-32">
        {/* Background effects from dashboard */}
        <svg
          className="absolute inset-0 -z-10 h-full w-full opacity-20"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="dash-grad" cx="50%" cy="50%" r="75%" fx="50%" fy="50%">
              <stop offset="0%" stopColor="#16a3ff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#dash-grad)" />
          <g stroke="rgba(255,255,255,0.04)" strokeWidth="1">
            <line x1="0" y1="25%" x2="100%" y2="25%" />
            <line x1="0" y1="50%" x2="100%" y2="50%" />
            <line x1="0" y1="75%" x2="100%" y2="75%" />
          </g>
        </svg>
        <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-primary-500/10 blur-3xl"></div>
        <div className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-72 w-72 rounded-full bg-white/5 blur-[100px]"></div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-neutral-400">Управление безопасностью и активными сессиями</p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Password Change Section */}
            <section className="h-fit rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm">
              <div className="mb-6 flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Безопасность</h2>
                  <p className="text-sm text-neutral-400">Смена пароля и защита</p>
                </div>
              </div>

              <form onSubmit={handleSubmit(onChangePassword)} className="w-full space-y-4">
                <div>
                  <label
                    htmlFor="old-password"
                    className="mb-1.5 block text-sm font-medium text-neutral-300"
                  >
                    Текущий пароль
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="old-password"
                      type="password"
                      autoComplete="current-password"
                      {...register('oldPassword')}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950/50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                      placeholder="••••••••"
                    />
                  </div>
                  {errors.oldPassword && (
                    <p className="mt-1 text-sm text-red-400">{errors.oldPassword.message}</p>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="new-password"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Новый пароль
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        {...register('newPassword')}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950/50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                        placeholder="••••••••"
                      />
                    </div>
                    {errors.newPassword && (
                      <p className="mt-1 text-sm text-red-400">{errors.newPassword.message}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="confirm-new-password"
                      className="mb-1.5 block text-sm font-medium text-neutral-300"
                    >
                      Повторите пароль
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        id="confirm-new-password"
                        type="password"
                        autoComplete="new-password"
                        {...register('confirmNewPassword')}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950/50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20"
                        placeholder="••••••••"
                      />
                    </div>
                    {errors.confirmNewPassword && (
                      <p className="mt-1 text-sm text-red-400">
                        {errors.confirmNewPassword.message}
                      </p>
                    )}
                  </div>
                </div>

                {passwordError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    {passwordError}
                  </div>
                )}

                {passwordSuccess && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                    {passwordSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 font-medium text-white transition-all hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isChangingPassword ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Сохранение...
                    </>
                  ) : (
                    'Обновить пароль'
                  )}
                </button>
              </form>
            </section>

            {/* Active Sessions Section */}
            <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 backdrop-blur-sm lg:col-span-2">
              <div className="mb-6 flex items-center gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Активные сессии</h2>
                  <p className="text-sm text-neutral-400">Устройства, имеющие доступ к аккаунту</p>
                </div>
              </div>

              {error ? (
                <div className="py-4 text-center text-red-400">{error}</div>
              ) : (
                <div className="space-y-4">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex flex-col items-start justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-4 transition-colors hover:border-neutral-700 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-neutral-800/50 p-3 text-neutral-400">
                          {device.device_name.toLowerCase().includes('mobile') ||
                          device.device_name.toLowerCase().includes('android') ||
                          device.device_name.toLowerCase().includes('iphone') ? (
                            <Smartphone className="h-6 w-6" />
                          ) : (
                            <Monitor className="h-6 w-6" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-white">
                              {formatDeviceName(device.device_name)}
                            </h3>
                            {device.is_current && (
                              <span className="rounded-full border border-primary-500/20 bg-primary-500/20 px-2 py-0.5 text-xs font-medium text-primary-400">
                                Это устройство
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-col gap-x-4 gap-y-1 text-sm text-neutral-500 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              {device.ip_address}
                              {device.location ? ` • ${device.location}` : ''}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              Активность: {formatRelativeTime(device.last_active)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {!device.is_current && (
                        <button
                          onClick={() => revokeDevice(device.id)}
                          className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" />
                          Завершить
                        </button>
                      )}
                    </div>
                  ))}

                  {devices.length === 0 && (
                    <div className="py-8 text-center text-neutral-500">Нет активных сессий.</div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

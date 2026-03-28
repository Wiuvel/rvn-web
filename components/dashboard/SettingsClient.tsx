'use client';

import { trpc } from '@/lib/trpc/client';
import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import {
  Monitor,
  Smartphone,
  Clock,
  Globe,
  Lock,
  Key,
  ShieldCheck,
  Shield,
  Cpu,
  Activity,
  ShieldAlert,
  LogOut,
  Radio,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { passwordChangeSchema, PasswordChangeFormData } from '@/lib/validation/schemas';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useStaggeredFadeIn } from '@/hooks/useGSAP';
import clsx from 'clsx';

interface Device {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  location: string | null;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
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

export default function SettingsClient() {
  const containerRef = useStaggeredFadeIn(0.1, 0.08);
  const utils = trpc.useUtils();
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });

  const { data: devicesData, isLoading: devicesLoading } = trpc.auth.devices.useQuery(undefined, {
    enabled: !!userData,
  });

  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (devicesData?.devices) {
      const mappedDevices = devicesData.devices.map((d) => ({
        id: d.id,
        deviceName: d.device_name,
        ipAddress: d.ip_address,
        location: d.location,
        lastActive: d.last_active,
        createdAt: d.created_at,
        isCurrent: d.is_current,
      }));
      setDevices(mappedDevices);
    }
  }, [devicesData]);

  const revokeDeviceMutation = trpc.auth.revokeDevice.useMutation();
  const changePasswordMutation = trpc.auth.changePassword.useMutation();

  const [error] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isDirty },
  } = useForm<PasswordChangeFormData>({
    resolver: zodResolver(passwordChangeSchema),
    mode: 'onChange',
  });

  const revokeDevice = async (deviceId: string) => {
    if (!confirm('Вы уверены, что хотите завершить сеанс на этом устройстве?')) return;

    try {
      await revokeDeviceMutation.mutateAsync({ deviceId });
      setDevices(devices.filter((d) => d.id !== deviceId));
      void utils.auth.devices.invalidate();
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
      await changePasswordMutation.mutateAsync({
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
        confirmNewPassword: data.confirmNewPassword,
      });
      setPasswordSuccess('Пароль успешно изменен. Другие сессии завершены.');
      reset();
      setDevices(devices.filter((d) => d.isCurrent));
      void utils.auth.devices.invalidate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Произошла ошибка при смене пароля';
      setPasswordError(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (authLoading || !userData || devicesLoading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
      <Header />

      <main className="relative pb-24 pt-24 lg:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header section */}
          <div className="mb-12 flex flex-col items-center text-center lg:items-start lg:text-left">
            <h1 className="bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
              Настройки аккаунта
            </h1>
            <p className="mt-4 text-lg text-neutral-400">
              Управление безопасностью, активными сессиями и личными данными
            </p>
          </div>

          <div ref={containerRef} className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            {/* LEFT COLUMN: Profile & Password */}
            <div className="flex flex-col gap-6 lg:col-span-4">
              {/* Profile Card */}
              <section className="group relative overflow-hidden rounded-3xl border border-neutral-800/60 bg-neutral-900/40 p-[1px] shadow-2xl transition-all duration-500 hover:shadow-primary-500/10">
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 via-transparent to-purple-500/20 opacity-30 transition-opacity duration-500 group-hover:opacity-60"></div>
                <div className="relative h-full w-full rounded-[23px] bg-neutral-950/80 p-6 backdrop-blur-xl">
                  <div className="mb-6 flex flex-col items-center text-center">
                    <h2 className="text-xl font-bold text-white">{userData.username}</h2>
                    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary-500/20 bg-primary-500/10 px-3 py-1.5 text-xs font-medium text-primary-400 backdrop-blur-md">
                      <ShieldCheck className="h-4 w-4" />
                      Защита активна
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-neutral-800/60 pt-6">
                    <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 px-4 py-3">
                      <span className="text-sm text-neutral-400">Роль</span>
                      <span className="font-medium capitalize text-white">
                        {userData.isAdmin
                          ? 'Администратор'
                          : userData.isSupport
                            ? 'Поддержка'
                            : 'Пользователь'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 px-4 py-3">
                      <span className="text-sm text-neutral-400">ID</span>
                      <span className="font-mono text-xs text-neutral-500">
                        {userData.user_id.split('-')[0]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-neutral-900/50 px-4 py-3">
                      <span className="text-sm text-neutral-400">Активных сессий</span>
                      <span className="flex items-center gap-1.5 font-medium text-white">
                        <Activity className="h-4 w-4 text-primary-400" />
                        {devices.length}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Password Change Card */}
              <section className="group relative overflow-hidden rounded-3xl border border-neutral-800/60 bg-neutral-900/40 p-[1px] shadow-2xl transition-all duration-500 hover:shadow-primary-500/10">
                <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900 opacity-50"></div>
                <div className="relative h-full w-full rounded-[23px] bg-neutral-950/80 p-6 backdrop-blur-xl">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-400">
                      <Lock className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Смена пароля</h2>
                      <p className="text-xs text-neutral-400">Обновите ключ доступа</p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit(onChangePassword)} className="w-full space-y-5">
                    <input
                      type="text"
                      name="username"
                      defaultValue={userData.username}
                      autoComplete="username"
                      tabIndex={-1}
                      className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
                      aria-hidden="true"
                    />

                    <div className="space-y-4">
                      <div>
                        <label
                          htmlFor="old-password"
                          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400"
                        >
                          Текущий пароль
                        </label>
                        <div className="group/input relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors group-focus-within/input:text-primary-400">
                            <Key className="h-4 w-4" />
                          </div>
                          <input
                            id="old-password"
                            type="password"
                            autoComplete="current-password"
                            {...register('oldPassword')}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary-500/50 focus:bg-neutral-900 focus:ring-4 focus:ring-primary-500/10"
                            placeholder="••••••••"
                          />
                        </div>
                        {errors.oldPassword && (
                          <p className="mt-1.5 text-xs text-red-400">
                            {errors.oldPassword.message}
                          </p>
                        )}
                      </div>

                      <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-neutral-800 to-transparent"></div>

                      <div>
                        <label
                          htmlFor="new-password"
                          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400"
                        >
                          Новый пароль
                        </label>
                        <div className="group/input relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors group-focus-within/input:text-primary-400">
                            <Shield className="h-4 w-4" />
                          </div>
                          <input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            {...register('newPassword')}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary-500/50 focus:bg-neutral-900 focus:ring-4 focus:ring-primary-500/10"
                            placeholder="••••••••"
                          />
                        </div>
                        {errors.newPassword && (
                          <p className="mt-1.5 text-xs text-red-400">
                            {errors.newPassword.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="confirm-new-password"
                          className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-neutral-400"
                        >
                          Повторите пароль
                        </label>
                        <div className="group/input relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 transition-colors group-focus-within/input:text-primary-400">
                            <ShieldCheck className="h-4 w-4" />
                          </div>
                          <input
                            id="confirm-new-password"
                            type="password"
                            autoComplete="new-password"
                            {...register('confirmNewPassword')}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-primary-500/50 focus:bg-neutral-900 focus:ring-4 focus:ring-primary-500/10"
                            placeholder="••••••••"
                          />
                        </div>
                        {errors.confirmNewPassword && (
                          <p className="mt-1.5 text-xs text-red-400">
                            {errors.confirmNewPassword.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {passwordError && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p>{passwordError}</p>
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p>{passwordSuccess}</p>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isChangingPassword || !isValid || !isDirty}
                      className="group/btn relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-6 py-3 text-sm font-semibold text-neutral-950 transition-all hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {isChangingPassword ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950/30 border-t-neutral-950" />
                          Сохранение...
                        </>
                      ) : (
                        <>
                          Обновить пароль
                          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 group-hover/btn:translate-x-full"></div>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Active Sessions */}
            <div className="flex flex-col lg:col-span-8">
              <section className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-neutral-800/60 bg-neutral-900/40 p-[1px] shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-b from-neutral-800/50 to-neutral-950/50 opacity-50"></div>
                <div className="relative flex h-full w-full flex-col rounded-[23px] bg-neutral-950/80 p-6 backdrop-blur-xl sm:p-8">
                  <div className="mb-8 flex flex-col gap-4 border-b border-neutral-800/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                        <Radio className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">Активные сессии</h2>
                        <p className="mt-1 text-sm text-neutral-400">
                          Устройства, имеющие доступ к вашему аккаунту на сайте
                        </p>
                      </div>
                    </div>
                    <div className="flex h-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/80 px-4 text-sm font-medium text-neutral-300">
                      Всего: {devices.length}
                    </div>
                  </div>

                  {error ? (
                    <div className="flex items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/5 py-12 text-red-400">
                      <ShieldAlert className="mr-2 h-5 w-5" />
                      {error}
                    </div>
                  ) : (
                    <div className="flex-1 space-y-3 overflow-y-auto pr-2">
                      {devices.map((device) => {
                        const isMobile =
                          device.deviceName.toLowerCase().includes('mobile') ||
                          device.deviceName.toLowerCase().includes('android') ||
                          device.deviceName.toLowerCase().includes('iphone');

                        return (
                          <div
                            key={device.id}
                            className={clsx(
                              'group relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl border p-5 transition-all duration-300 sm:flex-row sm:items-center',
                              device.isCurrent
                                ? 'border-primary-500/30 bg-primary-500/5 shadow-[0_0_30px_-10px_rgba(22,163,255,0.15)]'
                                : 'border-neutral-800/60 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-800/50',
                            )}
                          >
                            {/* Hover Gradient */}
                            {!device.isCurrent && (
                              <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                            )}

                            <div className="relative z-10 flex items-center gap-4">
                              <div
                                className={clsx(
                                  'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
                                  device.isCurrent
                                    ? 'bg-primary-500/20 text-primary-400'
                                    : 'bg-neutral-800/80 text-neutral-400 group-hover:text-neutral-300',
                                )}
                              >
                                {isMobile ? (
                                  <Smartphone className="h-6 w-6" />
                                ) : (
                                  <Monitor className="h-6 w-6" />
                                )}
                              </div>

                              <div>
                                <div className="flex items-center gap-2.5">
                                  <h3
                                    className={clsx(
                                      'font-semibold',
                                      device.isCurrent ? 'text-primary-100' : 'text-neutral-200',
                                    )}
                                  >
                                    {formatDeviceName(device.deviceName)}
                                  </h3>
                                  {device.isCurrent && (
                                    <span className="relative flex items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-400">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75"></span>
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500"></span>
                                      </span>
                                      Текущий
                                    </span>
                                  )}
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-500">
                                  <div className="flex items-center gap-1.5">
                                    <Globe className="h-3.5 w-3.5 opacity-70" />
                                    <span>{device.ipAddress}</span>
                                    {device.location && (
                                      <>
                                        <span className="h-1 w-1 rounded-full bg-neutral-700"></span>
                                        <span>{device.location}</span>
                                      </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 opacity-70" />
                                    <span>{formatRelativeTime(device.lastActive)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {!device.isCurrent && (
                              <button
                                onClick={() => revokeDevice(device.id)}
                                className="relative z-10 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500 hover:text-white sm:w-auto sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <LogOut className="h-4 w-4" />
                                Выйти
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {devices.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-neutral-500">
                          <Cpu className="mb-4 h-12 w-12 opacity-20" />
                          <p>Нет активных сессий.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useStaggeredFadeIn } from '@/hooks/useGSAP';
import Header from '@/components/layout/Header';
import { Smartphone, Monitor, Wifi, MapPin, Clock, ArrowLeft, HardDrive } from 'lucide-react';

interface MockDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop';
  os: string;
  location: string;
  connectedAgo: string;
  traffic: string;
  active: boolean;
}

const MOCK_DEVICES: MockDevice[] = [
  {
    id: '1',
    name: 'iPhone 15 Pro',
    type: 'mobile',
    os: 'iOS 17.4',
    location: 'Москва',
    connectedAgo: '2 часа назад',
    traffic: '1.2 ГБ',
    active: true,
  },
  {
    id: '2',
    name: 'Windows PC',
    type: 'desktop',
    os: 'Windows 11',
    location: 'Санкт-Петербург',
    connectedAgo: '5 мин назад',
    traffic: '3.8 ГБ',
    active: true,
  },
];

const DEVICE_LIMIT = 5;

function DeviceCard({ device }: { device: MockDevice }) {
  const Icon = device.type === 'mobile' ? Smartphone : Monitor;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/50 p-5 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/80 hover:shadow-lg hover:shadow-primary-500/5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-800/80 text-neutral-400 transition-colors group-hover:text-neutral-300">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="font-semibold text-white">{device.name}</h3>
              {device.active && (
                <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Активно
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
              <span>{device.os}</span>
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 opacity-70" />
                <span>{device.location}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-neutral-800/50 pt-4 text-xs text-neutral-500">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 opacity-70" />
          <span>Подключено: {device.connectedAgo}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5 opacity-70" />
          <span>Трафик: {device.traffic}</span>
        </div>
      </div>
    </div>
  );
}

export default function DevicesClient() {
  const { loading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });

  const containerRef = useStaggeredFadeIn(0.1, 0.08);

  const devices = MOCK_DEVICES;
  const deviceCount = devices.length;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
      <Header />

      <main className="relative pb-24 pt-24 lg:pt-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Back button */}
          <Link
            href="/dashboard"
            prefetch={false}
            className="mb-8 inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад в панель
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <h1 className="bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
                Мои устройства (скоро)
              </h1>
              <span className="rounded-full border border-neutral-800 bg-neutral-900/80 px-4 py-1.5 text-sm font-medium text-neutral-300">
                {deviceCount} из {DEVICE_LIMIT}
              </span>
            </div>
            <p className="mt-3 text-sm text-neutral-400">Устройства, подключённые к VPN</p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
              <span>Использовано устройств</span>
              <span>
                {deviceCount}/{DEVICE_LIMIT}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500"
                style={{ width: `${(deviceCount / DEVICE_LIMIT) * 100}%` }}
              />
            </div>
          </div>

          {/* Devices list */}
          <div ref={containerRef} className="space-y-4">
            {devices.length > 0 ? (
              devices.map((device) => <DeviceCard key={device.id} device={device} />)
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-700/50 bg-neutral-950/30 p-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800/50">
                  <HardDrive className="h-7 w-7 text-neutral-500" />
                </div>
                <p className="text-base font-medium text-neutral-400">Нет подключённых устройств</p>
                <p className="mt-2 text-sm text-neutral-500">
                  Устройства появятся после подключения к VPN
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

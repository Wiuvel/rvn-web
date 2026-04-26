'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Check,
  Globe,
  Loader2,
  Clock,
  Shield,
  Zap,
  LogIn,
} from 'lucide-react';

const SubscriptionPurchaseModal = dynamic(
  () => import('@/components/modals/SubscriptionPurchaseModal'),
  { ssr: false },
);

const COUNTRY_NAMES: Record<string, string> = {
  NL: 'Нидерланды',
  DE: 'Германия',
  US: 'США',
  FI: 'Финляндия',
  SE: 'Швеция',
  GB: 'Великобритания',
  FR: 'Франция',
  PL: 'Польша',
  CA: 'Канада',
  JP: 'Япония',
  SG: 'Сингапур',
  AU: 'Австралия',
  TR: 'Турция',
  KZ: 'Казахстан',
  RU: 'Россия',
  UA: 'Украина',
  LV: 'Латвия',
  LT: 'Литва',
  EE: 'Эстония',
  AT: 'Австрия',
  CH: 'Швейцария',
  IT: 'Италия',
  ES: 'Испания',
  CZ: 'Чехия',
  RO: 'Румыния',
  BG: 'Болгария',
  HK: 'Гонконг',
  KR: 'Южная Корея',
  IN: 'Индия',
  BR: 'Бразилия',
};

function countryFlag(cc: string): string {
  return cc
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

export default function SubscriptionPage() {
  const { userData } = useAuth({ silent: true, lightweight: true });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading } = trpc.subscription.publicPlans.useQuery();
  const { data: servers, isLoading: serversLoading } = trpc.subscription.publicServers.useQuery();

  const realPlans = plans?.filter((p) => !p.isStub) ?? [];
  const stubPlans = plans?.filter((p) => p.isStub) ?? [];

  const uniqueCountries = servers
    ? Array.from(
        new Map(
          servers.map((s) => [s.countryCode, { countryCode: s.countryCode, isOnline: s.isOnline }]),
        ).values(),
      )
    : [];

  const handlePurchase = (planId: string) => {
    setSelectedPlanId(planId);
    setModalOpen(true);
  };

  return (
    <div className="relative bg-neutral-950 text-neutral-100">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary-500/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pb-32 lg:pt-32">
        {/* Hero */}
        <div className="mb-20 text-center">
          <h1 className="mb-6 bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-5xl font-bold text-transparent sm:text-6xl md:text-7xl">
            Тарифные планы
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-neutral-400 sm:text-xl">
            Выберите подходящий план для приватного и безопасного доступа в сеть
          </p>
        </div>

        {/* Plans */}
        {plansLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <div
            className={`mx-auto mb-20 grid gap-6 ${
              realPlans.length + stubPlans.length <= 2
                ? 'max-w-3xl grid-cols-1 sm:grid-cols-2'
                : 'max-w-5xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {realPlans.map((plan, i) => (
              <div
                key={plan.id}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border transition-all ${
                  i === 0
                    ? 'border-primary-500/30 bg-gradient-to-b from-primary-500/5 to-neutral-900/80 shadow-[0_0_40px_rgba(22,163,255,0.08)]'
                    : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
                }`}
              >
                {i === 0 && (
                  <div className="absolute -right-8 top-6 rotate-45 bg-primary-500 px-10 py-1 text-xs font-semibold text-white shadow-lg">
                    Популярный
                  </div>
                )}

                <div className="flex flex-1 flex-col p-6">
                  {/* Plan name + price */}
                  <div className="mb-4">
                    <h3 className="mb-2 text-xl font-bold text-white">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-sm leading-relaxed text-neutral-400">{plan.description}</p>
                    )}
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">
                        {(plan.priceKopecks / 100).toFixed(0)}
                      </span>
                      <span className="text-lg text-neutral-400">₽</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{plan.durationDays} дней</span>
                    </div>
                  </div>

                  {/* Features */}
                  {(plan.features ?? []).length > 0 && (
                    <ul className="mb-6 flex-1 space-y-2.5">
                      {(plan.features ?? []).map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          <span className="text-sm text-neutral-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* CTA */}
                  <div className="mt-auto">
                    {userData ? (
                      <button
                        onClick={() => handlePurchase(plan.id)}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                          i === 0
                            ? 'bg-primary-500 text-white shadow-glow hover:bg-primary-400'
                            : 'border border-neutral-700 bg-neutral-800 text-white hover:border-neutral-600 hover:bg-neutral-700'
                        }`}
                      >
                        <Zap className="h-4 w-4" />
                        Подключить
                      </button>
                    ) : (
                      <Link
                        href="/auth"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-3 text-sm font-semibold text-white transition-all hover:border-neutral-600 hover:bg-neutral-700"
                      >
                        <LogIn className="h-4 w-4" />
                        Войти для покупки
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Stub plans */}
            {stubPlans.map((plan) => (
              <div
                key={plan.id}
                className="relative flex flex-col overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-900/30"
              >
                <div className="flex flex-1 flex-col p-6 opacity-60">
                  <div className="mb-4">
                    <h3 className="mb-2 text-xl font-bold text-neutral-400">{plan.name}</h3>
                    {plan.description && (
                      <p className="text-sm leading-relaxed text-neutral-500">{plan.description}</p>
                    )}
                  </div>

                  {(plan.features ?? []).length > 0 && (
                    <ul className="mb-6 flex-1 space-y-2.5">
                      {(plan.features ?? []).map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
                          <span className="text-sm text-neutral-500">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto">
                    <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-3 text-sm font-medium text-neutral-500">
                      Скоро
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Locations */}
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 px-4 py-1.5 text-sm text-neutral-400">
              <Globe className="h-4 w-4 text-primary-400" />
              <span>Доступные локации</span>
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
              Серверы по всему миру
            </h2>
            <p className="text-neutral-400">
              Подключайтесь к ближайшему серверу для максимальной скорости
            </p>
          </div>

          {serversLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : uniqueCountries.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-3">
              {uniqueCountries.map((country) => (
                <div
                  key={country.countryCode}
                  className="flex w-[calc(50%-0.375rem)] items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-3 transition-colors hover:border-neutral-700 sm:w-[calc(33.333%-0.5rem)] md:w-[calc(25%-0.5625rem)]"
                >
                  <span className="text-xl">{countryFlag(country.countryCode)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {COUNTRY_NAMES[country.countryCode] || country.countryCode}
                    </p>
                  </div>
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      country.isOnline ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-neutral-600'
                    }`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 py-12 text-center">
              <Shield className="mx-auto mb-3 h-8 w-8 text-neutral-600" />
              <p className="text-neutral-500">Информация о серверах недоступна</p>
            </div>
          )}
        </div>
      </div>

      {/* Purchase modal */}
      {userData && (
        <SubscriptionPurchaseModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelectedPlanId(null);
          }}
          balance={userData.balance ?? 0}
          onSuccess={() => setModalOpen(false)}
          initialPlanId={selectedPlanId ?? undefined}
        />
      )}
    </div>
  );
}

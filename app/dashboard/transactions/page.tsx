'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import { Wallet, ArrowLeft, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

/**
 * Displays the user's transaction history and current balance.
 * Requires active authentication.
 *
 * @returns React component.
 */
export default function TransactionsPage() {
  const router = useRouter();
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });

  const { data: balanceData, isLoading } = trpc.subscription.balance.useQuery(undefined, {
    enabled: !!userData,
  });

  if (authLoading || isLoading) return <LoadingSpinner />;

  const balance = balanceData?.balance ?? 0;
  const transactions = balanceData?.transactions ?? [];

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-primary-500/30">
      <Header />
      <main className="relative pb-24 pt-8 lg:pb-8 lg:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => router.back()}
            className="mb-8 inline-flex items-center gap-2 text-base text-neutral-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
            Назад
          </button>

          <div className="mb-8">
            <h1 className="bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Транзакции
            </h1>
            <p className="mt-3 text-sm text-neutral-400">Баланс и история операций</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 lg:sticky lg:top-32">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-neutral-400">Текущий баланс</p>
                    <p className="mt-1 text-3xl font-bold text-white">
                      {(balance / 100).toFixed(0)}{' '}
                      <span className="text-lg text-neutral-400">₽</span>
                    </p>
                  </div>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                    <Wallet className="h-7 w-7 text-emerald-400" />
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h3 className="mb-4 text-base font-semibold text-white">История операций</h3>
                {transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.05]"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                              tx.amount >= 0
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {tx.amount >= 0 ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {tx.description || tx.type}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {new Date(tx.createdAt).toLocaleDateString('ru-RU')}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-sm font-medium ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {tx.amount >= 0 ? '+' : ''}
                          {(tx.amount / 100).toFixed(0)} ₽
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-neutral-500">Операций пока нет</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Header from '@/components/layout/Header';
import { Wallet, ArrowLeft, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

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
    <div className="min-h-screen bg-neutral-950">
      <Header />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-24">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="rounded-xl p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-400">Текущий баланс</p>
              <p className="mt-1 text-3xl font-bold text-white">
                {(balance / 100).toFixed(0)} <span className="text-lg text-neutral-400">₽</span>
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Wallet className="h-7 w-7 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h3 className="mb-4 text-base font-semibold text-white">История операций</h3>
          {transactions.length > 0 ? (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl bg-neutral-800/30 px-4 py-3"
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
                      <p className="text-sm font-medium text-white">{tx.description || tx.type}</p>
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
      </main>
    </div>
  );
}

'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Loader2, AlertCircle, XCircle, ArrowLeft } from 'lucide-react';

export default function PaymentRedirectPage() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get('paymentId');
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });

  const { data: payments, isLoading } = trpc.subscription.payments.useQuery(undefined, {
    enabled: !!userData,
  });

  const payment = payments?.find((p) => p.id === paymentId);

  if (authLoading || isLoading) return <LoadingSpinner />;

  if (!paymentId || !payment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="mb-2 text-xl font-semibold text-white">Платёж не найден</h1>
          <p className="mb-4 text-sm text-neutral-400">Не удалось найти информацию о платеже.</p>
          <Link
            href={`/dashboard/${userData?.user_id}`}
            className="text-sm text-primary-400 hover:underline"
          >
            Вернуться в личный кабинет
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/10">
            <AlertCircle className="h-8 w-8 text-yellow-400" />
          </div>
          <h1 className="mb-2 text-xl font-semibold text-white">
            Платёжная система временно недоступна
          </h1>
          <p className="mb-6 text-sm text-neutral-400">
            Интеграция с платёжными системами находится в разработке. Пожалуйста, воспользуйтесь
            оплатой с баланса или промокодом.
          </p>

          <div className="mb-6 space-y-2 rounded-lg bg-neutral-800/50 p-4 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Сумма</span>
              <span className="text-white">{(payment.amount / 100).toFixed(0)} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Статус</span>
              <span className="flex items-center gap-1.5 text-yellow-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Ожидает оплаты
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Дата</span>
              <span className="text-white">
                {new Date(payment.createdAt).toLocaleDateString('ru-RU')}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href={`/dashboard/${userData?.user_id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            <ArrowLeft className="h-4 w-4" />В личный кабинет
          </Link>
        </div>
      </div>
    </div>
  );
}

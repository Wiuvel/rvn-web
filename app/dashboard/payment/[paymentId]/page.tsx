'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/hooks/useAuth';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { CheckCircle2, XCircle, Clock, ArrowLeft } from 'lucide-react';

export default function PaymentStatusPage() {
  const paymentId = useParams<{ paymentId: string }>()?.paymentId;
  const { userData, loading: authLoading } = useAuth({
    requireAuth: true,
    redirectOnFail: '/auth',
  });

  const { data: payments, isLoading } = trpc.subscription.payments.useQuery(undefined, {
    enabled: !!userData,
  });

  const payment = payments?.find((p) => p.id === paymentId);

  if (authLoading || isLoading) return <LoadingSpinner />;

  if (!payment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="text-center">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
          <h1 className="mb-2 text-xl font-semibold text-white">Платёж не найден</h1>
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

  const statusConfig = {
    completed: {
      icon: CheckCircle2,
      color: 'text-green-400',
      bg: 'bg-green-500/10 border-green-500/20',
      title: 'Оплата прошла успешно',
      description: 'Подписка активирована. Вы можете подключиться к VPN.',
    },
    pending: {
      icon: Clock,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10 border-yellow-500/20',
      title: 'Ожидание оплаты',
      description: 'Платёж обрабатывается. Пожалуйста, подождите.',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/10 border-red-500/20',
      title: 'Ошибка оплаты',
      description: 'Не удалось обработать платёж. Попробуйте снова.',
    },
  };

  const config = statusConfig[payment.status as keyof typeof statusConfig] ?? statusConfig.pending;
  const StatusIcon = config.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-md">
        <div className={`rounded-2xl border ${config.bg} p-8 text-center`}>
          <StatusIcon className={`mx-auto mb-4 h-16 w-16 ${config.color}`} />
          <h1 className="mb-2 text-xl font-semibold text-white">{config.title}</h1>
          <p className="mb-6 text-sm text-neutral-400">{config.description}</p>

          <div className="mb-6 space-y-2 rounded-lg bg-neutral-800/50 p-4 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Сумма</span>
              <span className="text-white">{(payment.amount / 100).toFixed(0)} ₽</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Способ</span>
              <span className="text-white">
                {payment.provider === 'test' ? 'Тестовый' : payment.provider}
              </span>
            </div>
            {payment.promoCode && (
              <div className="flex justify-between">
                <span className="text-neutral-500">Промокод</span>
                <span className="text-white">{payment.promoCode}</span>
              </div>
            )}
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

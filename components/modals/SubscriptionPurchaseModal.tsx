'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  X,
  CreditCard,
  Wallet,
  Tag,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  XCircle,
  Clock,
} from 'lucide-react';

interface SubscriptionPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onSuccess: () => void;
}

export default function SubscriptionPurchaseModal({
  isOpen,
  onClose,
  balance,
  onSuccess,
}: SubscriptionPurchaseModalProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [debouncedPromo, setDebouncedPromo] = useState('');
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    subscriptionUrl: string;
    expireAt: string;
  } | null>(null);

  /** Fetch dynamic plans */
  const { data: plansData, isLoading: plansLoading } = trpc.subscription.plans.useQuery(undefined, {
    enabled: isOpen,
  });

  /** Debounce promo code input (350ms) */
  useEffect(() => {
    const id = setTimeout(() => setDebouncedPromo(promoCode.trim()), 350);
    return () => clearTimeout(id);
  }, [promoCode]);

  /** Auto-validate promo code */
  const { data: promoValidation, isFetching: promoChecking } =
    trpc.subscription.validatePromo.useQuery(
      { promoCode: debouncedPromo },
      { enabled: debouncedPromo.length > 0 },
    );

  /** Auto-select first real plan when plans load */
  useEffect(() => {
    if (plansData) {
      const firstReal = plansData.find((p) => !p.isStub);
      if (firstReal) setSelectedPlanId((prev) => prev ?? firstReal.id);
    }
  }, [plansData]);

  const purchaseMutation = trpc.subscription.purchase.useMutation({
    onSuccess: (data) => {
      if (data.status === 'completed' && data.subscription) {
        setSuccessData({
          subscriptionUrl: data.subscription.subscriptionUrl,
          expireAt: data.subscription.expireAt,
        });
        setError('');
        onSuccess();
      }
    },
    onError: (err) => {
      setError(err.message || 'Ошибка при оформлении');
    },
  });

  const selectedPlan = plansData?.find((p) => p.id === selectedPlanId && !p.isStub);
  const realPlans = plansData?.filter((p) => !p.isStub) ?? [];
  const stubPlans = plansData?.filter((p) => p.isStub) ?? [];
  const isPromoValid = debouncedPromo.length > 0 && promoValidation?.valid === true;
  const isPromoInvalid =
    debouncedPromo.length > 0 && !promoChecking && promoValidation?.valid === false;

  const handleBalancePurchase = () => {
    if (!selectedPlanId) return;
    setError('');
    purchaseMutation.mutate({ planId: selectedPlanId, payFrom: 'balance' });
  };

  const handlePromoPurchase = () => {
    if (!selectedPlanId || !promoCode.trim()) return;
    setError('');
    purchaseMutation.mutate({
      planId: selectedPlanId,
      payFrom: 'promo',
      promoCode: promoCode.trim(),
    });
  };

  const handleClose = () => {
    setPromoCode('');
    setDebouncedPromo('');
    setError('');
    setSuccessData(null);
    setSelectedPlanId(null);
    onClose();
  };

  if (!isOpen) return null;

  const canPayFromBalance = selectedPlan ? balance >= selectedPlan.priceKopecks : false;
  const isPending = purchaseMutation.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Приобрести подписку"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      <div
        role="document"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-5">
          <h2 className="text-lg font-bold text-white">Приобрести подписку</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {successData ? (
            /* Success view */
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">Подписка оформлена</h3>
              <p className="mb-1 text-sm text-neutral-400">
                Действует до {new Date(successData.expireAt).toLocaleDateString('ru-RU')}
              </p>
              <a
                href={successData.subscriptionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
              >
                <ExternalLink className="h-4 w-4" />
                Подключить VPN
              </a>
              <button
                onClick={handleClose}
                className="mt-3 block w-full text-center text-sm text-neutral-400 transition-colors hover:text-white"
              >
                Закрыть
              </button>
            </div>
          ) : plansLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : (
            <>
              {/* Plan cards */}
              <div className="mb-5 space-y-2">
                {realPlans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  const showSelector = realPlans.length > 1;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`w-full rounded-xl border p-4 text-left transition-colors ${
                        isSelected
                          ? 'border-primary-500/30 bg-primary-500/5'
                          : 'border-neutral-700/50 bg-neutral-800/30 hover:border-neutral-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {showSelector && (
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                                isSelected
                                  ? 'border-primary-500 bg-primary-500'
                                  : 'border-neutral-600'
                              }`}
                            >
                              {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                          )}
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10">
                            <CreditCard className="h-5 w-5 text-primary-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{plan.name}</p>
                            <p className="flex items-center gap-1 text-xs text-neutral-400">
                              <Clock className="h-3 w-3" />
                              {plan.durationDays} дней
                            </p>
                          </div>
                        </div>
                        <p className="text-lg font-bold text-white">
                          {(plan.priceKopecks / 100).toFixed(0)}{' '}
                          <span className="text-sm text-neutral-400">₽</span>
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Stub plans */}
                {stubPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="w-full rounded-xl border border-neutral-700/30 bg-neutral-800/20 p-4 opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {realPlans.length > 1 && (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-neutral-700" />
                        )}
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-700/30">
                          <CreditCard className="h-5 w-5 text-neutral-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-neutral-400">{plan.name}</p>
                          <p className="text-xs text-neutral-600">Скоро</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payment methods */}
              {isPromoValid ? (
                /* Promo valid → free purchase button */
                <button
                  onClick={handlePromoPurchase}
                  disabled={isPending || !selectedPlanId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending && purchaseMutation.variables?.payFrom === 'promo' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Оформить бесплатно
                    </>
                  )}
                </button>
              ) : (
                <>
                  <h4 className="mb-3 text-sm font-medium text-neutral-300">Способ оплаты</h4>
                  <div className="space-y-2">
                    {/* Balance payment */}
                    <button
                      onClick={handleBalancePurchase}
                      disabled={!canPayFromBalance || isPending}
                      className="flex w-full items-center justify-between rounded-xl border border-neutral-700 bg-neutral-800/50 px-4 py-3 text-left transition-colors hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <Wallet className="h-5 w-5 text-emerald-400" />
                        <div>
                          <p className="text-sm font-medium text-white">Оплатить с баланса</p>
                          <p className="text-xs text-neutral-500">
                            {(balance / 100).toFixed(0)} ₽ на счёте
                            {!canPayFromBalance && ' (недостаточно)'}
                          </p>
                        </div>
                      </div>
                      {isPending && purchaseMutation.variables?.payFrom === 'balance' && (
                        <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                      )}
                    </button>

                    {/* External payment placeholder */}
                    <div className="flex w-full items-center justify-between rounded-xl border border-neutral-700/50 bg-neutral-800/30 px-4 py-3 opacity-50">
                      <div className="flex items-center gap-3">
                        <CreditCard className="h-5 w-5 text-neutral-500" />
                        <div>
                          <p className="text-sm font-medium text-neutral-400">Платёжные системы</p>
                          <p className="text-xs text-neutral-600">Скоро</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Promo code section with auto-validation */}
              <div className="mt-4 rounded-xl border border-neutral-700/50 bg-neutral-800/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-neutral-500" />
                  <span className="text-sm font-medium text-neutral-300">Промокод</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Введите промокод"
                    className={`w-full rounded-lg border bg-neutral-800 px-3 py-2 pr-9 text-sm text-white placeholder-neutral-500 focus:outline-none ${
                      isPromoValid
                        ? 'border-green-500/50 focus:border-green-500'
                        : isPromoInvalid
                          ? 'border-red-500/50 focus:border-red-500'
                          : 'border-neutral-700 focus:border-primary-500'
                    }`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {promoChecking && debouncedPromo.length > 0 && (
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                    )}
                    {isPromoValid && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                    {isPromoInvalid && <XCircle className="h-4 w-4 text-red-400" />}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

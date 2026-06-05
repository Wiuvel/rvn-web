'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  X,
  CreditCard,
  Tag,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wallet,
  XCircle,
} from 'lucide-react';

/** Minimum top-up amount in rubles */
const MIN_AMOUNT_RUB = 100;
/** Preset amounts in rubles */
const PRESET_AMOUNTS = [200, 300, 500];

interface BalanceTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BalanceTopUpModal({ isOpen, onClose, onSuccess }: BalanceTopUpModalProps) {
  const [amount, setAmount] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [debouncedPromo, setDebouncedPromo] = useState('');
  const [error, setError] = useState('');
  const [newBalance, setNewBalance] = useState<number | null>(null);

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

  const topUpMutation = trpc.subscription.topUp.useMutation({
    onSuccess: (data) => {
      setNewBalance(data.balance);
      setError('');
      onSuccess();
    },
    onError: (err) => {
      setError(err.message || 'Ошибка при пополнении');
    },
  });

  const handleTopUp = () => {
    const amountKopecks = Number(amount) * 100;
    if (amountKopecks < MIN_AMOUNT_RUB * 100) {
      setError(`Минимальная сумма — ${MIN_AMOUNT_RUB} ₽`);
      return;
    }
    if (!promoCode.trim()) {
      setError('Введите промокод');
      return;
    }
    setError('');
    topUpMutation.mutate({ promoCode: promoCode.trim(), amount: amountKopecks });
  };

  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setAmount(cleaned);
    setError('');
  };

  const handleClose = () => {
    setAmount('');
    setPromoCode('');
    setDebouncedPromo('');
    setError('');
    setNewBalance(null);
    onClose();
  };

  if (!isOpen) return null;

  const isPending = topUpMutation.isPending;
  const amountNum = Number(amount);
  const isAmountValid = amountNum >= MIN_AMOUNT_RUB;
  const isPromoValid = debouncedPromo.length > 0 && promoValidation?.valid === true;
  const isPromoInvalid =
    debouncedPromo.length > 0 && !promoChecking && promoValidation?.valid === false;
  const canSubmit = isAmountValid && isPromoValid && !isPending;

  return (
    /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- модальная обёртка: обработчики закрытия по клику/Escape */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Пополнить баланс"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- модальная обёртка: обработчики закрытия по клику/Escape */}
      <div
        role="document"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-5">
          <h2 className="text-lg font-bold text-white">Пополнить баланс</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {newBalance !== null ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">Баланс пополнен</h3>
              <p className="text-sm text-neutral-400">
                Текущий баланс:{' '}
                <span className="font-semibold text-emerald-400">
                  {(newBalance / 100).toFixed(0)} ₽
                </span>
              </p>
              <button
                onClick={handleClose}
                className="mt-5 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
              >
                Закрыть
              </button>
            </div>
          ) : (
            <>
              {/* Amount input */}
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-neutral-500" />
                  <span className="text-sm font-medium text-neutral-300">Сумма пополнения</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder={`от ${MIN_AMOUNT_RUB} ₽`}
                    aria-label="Сумма пополнения"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 pr-10 text-lg font-medium text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                    ₽
                  </span>
                </div>
                {amount && !isAmountValid && (
                  <p className="mt-1.5 text-xs text-amber-400">
                    Минимальная сумма — {MIN_AMOUNT_RUB} ₽
                  </p>
                )}
              </div>

              {/* Preset buttons */}
              <div className="mb-5 flex gap-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setAmount(String(preset));
                      setError('');
                    }}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      amountNum === preset
                        ? 'border-primary-500 bg-primary-500/15 text-primary-400'
                        : 'border-neutral-700 bg-neutral-800/50 text-neutral-300 hover:border-neutral-600 hover:text-white'
                    }`}
                  >
                    {preset} ₽
                  </button>
                ))}
              </div>

              {/* Payment methods placeholder */}
              <div className="mb-4 flex w-full items-center justify-between rounded-xl border border-neutral-700/50 bg-neutral-800/30 px-4 py-3 opacity-50">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-neutral-500" />
                  <div>
                    <p className="text-sm font-medium text-neutral-400">Платёжные системы</p>
                    <p className="text-xs text-neutral-600">Скоро</p>
                  </div>
                </div>
              </div>

              {/* Promo code section with auto-validation */}
              <div className="rounded-xl border border-neutral-700/50 bg-neutral-800/30 p-4">
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
                    aria-label="Промокод"
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

              {/* Top-up button */}
              <button
                onClick={handleTopUp}
                disabled={!canSubmit}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Пополнить на ${isAmountValid ? amountNum : '...'} ₽`
                )}
              </button>

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

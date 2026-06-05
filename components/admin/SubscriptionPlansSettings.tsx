'use client';

import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react';

/** Plan shape matching the backend schema */
interface PlanConfig {
  id: string;
  name: string;
  description: string;
  features: string[];
  priceKopecks: number;
  durationDays: number;
  squadUuid: string | null;
  active: boolean;
  isStub: boolean;
}

/** Generate a short random plan ID */
function generatePlanId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Max real (non-stub) plans allowed */
const MAX_REAL_PLANS = 3;

export default function SubscriptionPlansSettings() {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const successTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const utils = trpc.useUtils();

  const { data: plansData, isLoading: plansLoading } = trpc.admin.subscriptionPlans.list.useQuery();
  const { data: squadsRaw, isLoading: squadsLoading } = trpc.admin.remnawave.squads.useQuery(
    undefined,
    { retry: false },
  );
  const squadsData = Array.isArray(squadsRaw) ? squadsRaw : [];

  const saveMutation = trpc.admin.subscriptionPlans.save.useMutation({
    onSuccess: () => {
      setSuccess('Тарифные планы сохранены');
      setError('');
      utils.admin.subscriptionPlans.list.invalidate();
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(err.message || 'Ошибка при сохранении');
      setSuccess('');
    },
  });

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  useEffect(() => {
    if (plansData) {
      setPlans(plansData);
    }
  }, [plansData]);

  const realPlans = plans.filter((p) => !p.isStub);
  const canAddRealPlan = realPlans.length < MAX_REAL_PLANS;

  const updatePlan = (index: number, updates: Partial<PlanConfig>) => {
    setPlans((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  };

  const addRealPlan = () => {
    if (!canAddRealPlan) return;
    const insertAt = realPlans.length;
    setPlans((prev) => [
      ...prev.slice(0, insertAt),
      {
        id: generatePlanId(),
        name: '',
        description: '',
        features: [],
        priceKopecks: 20000,
        durationDays: 30,
        squadUuid: null,
        active: true,
        isStub: false,
      },
      ...prev.slice(insertAt),
    ]);
  };

  const addStubPlan = () => {
    setPlans((prev) => [
      ...prev,
      {
        id: generatePlanId(),
        name: '',
        description: '',
        features: [],
        priceKopecks: 0,
        durationDays: 0,
        squadUuid: null,
        active: true,
        isStub: true,
      },
    ]);
  };

  const removePlan = (index: number) => {
    if (index === 0 && !plans[0]?.isStub) return;
    setPlans((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    setError('');
    const hasEmpty = plans.some((p) => !p.name.trim());
    if (hasEmpty) {
      setError('Укажите название для всех планов');
      return;
    }
    const invalidReal = plans.find(
      (p) => !p.isStub && (p.priceKopecks <= 0 || p.durationDays <= 0),
    );
    if (invalidReal) {
      setError('Цена и длительность должны быть больше 0');
      return;
    }
    saveMutation.mutate({ plans });
  };

  /** Check if any existing plan's squad changed */
  const hasSquadChanges = plansData
    ? plans.some((p) => {
        const original = plansData.find((o) => o.id === p.id);
        return original && original.squadUuid !== p.squadUuid && p.squadUuid !== null;
      })
    : false;

  const isLoading = plansLoading || squadsLoading;
  const saving = saveMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Тарифные планы</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Управление подписками и назначение доступа
            </p>
          </div>
          <div className="flex items-center gap-2">
            {plans.length > 0 && plans[0]?.squadUuid ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Настроено
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                <XCircle className="h-3 w-3" />
                Сквад не назначен
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {plans.map((plan, index) => {
            const isDefault = index === 0 && !plan.isStub;
            return (
              <div
                key={plan.id}
                className={`rounded-lg border p-4 ${
                  plan.isStub
                    ? 'border-neutral-700/30 bg-neutral-800/20'
                    : 'border-neutral-700/50 bg-neutral-800/30'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-neutral-500" />
                    <span className="text-sm font-medium text-neutral-300">
                      {isDefault ? 'Базовый план' : plan.isStub ? 'Заглушка' : `План ${index + 1}`}
                    </span>
                    {plan.isStub && (
                      <span className="rounded bg-neutral-700/50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                        Скоро
                      </span>
                    )}
                    {isDefault && (
                      <span className="rounded bg-primary-500/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-400">
                        По умолчанию
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!plan.isStub && (
                      <button
                        type="button"
                        aria-label="Включить/выключить план"
                        aria-pressed={plan.active}
                        onClick={() => updatePlan(index, { active: !plan.active })}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                          plan.active ? 'bg-primary-600' : 'bg-neutral-700'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                            plan.active ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => removePlan(index)}
                        className="rounded p-1 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className={`grid gap-3 ${plan.isStub ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-500">Название</span>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) => updatePlan(index, { name: e.target.value })}
                      placeholder={isDefault ? 'Базовая' : 'Название плана'}
                      aria-label="Название плана"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                    />
                  </label>

                  {!plan.isStub && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">Цена (₽)</span>
                        <input
                          type="number"
                          min={0}
                          aria-label="Цена в рублях"
                          value={plan.priceKopecks / 100}
                          onChange={(e) =>
                            updatePlan(index, {
                              priceKopecks: Math.round(Number(e.target.value) * 100),
                            })
                          }
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 flex items-center gap-1 text-xs text-neutral-500">
                          <Clock className="h-3 w-3" />
                          Длительность (дней)
                        </span>
                        <input
                          type="number"
                          min={1}
                          aria-label="Длительность в днях"
                          value={plan.durationDays}
                          onChange={(e) =>
                            updatePlan(index, { durationDays: Number(e.target.value) })
                          }
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-500">
                          Внутренний сквад
                        </span>
                        <select
                          value={plan.squadUuid ?? ''}
                          onChange={(e) =>
                            updatePlan(index, {
                              squadUuid: e.target.value || null,
                            })
                          }
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
                        >
                          <option value="">Не назначен</option>
                          {squadsData?.map((squad) => (
                            <option key={squad.uuid} value={squad.uuid}>
                              {squad.squadName} ({squad.inboundsCount} инбаундов)
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </div>

                {/* Описание */}
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-neutral-500">Описание</span>
                  <textarea
                    value={plan.description}
                    onChange={(e) => updatePlan(index, { description: e.target.value })}
                    placeholder="Краткое описание тарифа"
                    aria-label="Описание тарифа"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                  />
                </label>

                {/* Что входит (features) */}
                <div className="mt-3">
                  <span className="mb-1 block text-xs text-neutral-500">Что входит</span>
                  {plan.features.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {plan.features.map((feature, fi) => (
                        <span
                          key={fi}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300"
                        >
                          {feature}
                          <button
                            type="button"
                            onClick={() => {
                              const next = plan.features.filter((_, i) => i !== fi);
                              updatePlan(index, { features: next });
                            }}
                            className="ml-0.5 text-neutral-500 transition-colors hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Новая фича"
                      aria-label="Новая фича"
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) {
                            updatePlan(index, { features: [...plan.features, val] });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        const val = input.value.trim();
                        if (val) {
                          updatePlan(index, { features: [...plan.features, val] });
                          input.value = '';
                        }
                      }}
                      className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add plan buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          {canAddRealPlan && (
            <button
              type="button"
              onClick={addRealPlan}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить план ({realPlans.length}/{MAX_REAL_PLANS})
            </button>
          )}
          <button
            type="button"
            onClick={addStubPlan}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-400 transition-colors hover:border-neutral-500 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить заглушку
          </button>
        </div>

        {/* Squad change warning */}
        {hasSquadChanges && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Сквад будет обновлён для всех пользователей с этой подпиской
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
            {success}
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

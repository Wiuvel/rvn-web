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
  WifiOff,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/admin/ui/Toggle';
import { Field, inputClass } from '@/components/admin/ui/Field';
import { PlanPreviewCard } from '@/components/admin/PlanPreviewCard';
import { cn } from '@/lib/utils/index';

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

/** Quick-pick durations (days) */
const DURATION_PRESETS = [30, 90, 180, 365];

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

  // The squads endpoint returns [] both when the panel is unreachable and when
  // there genuinely are no squads. Disambiguate via the saved settings: if the
  // panel isn't configured, an empty list means "no connection", not "empty".
  const { data: settings } = trpc.admin.remnawave.get.useQuery();
  const panelConfigured = Boolean(settings?.endpoint && settings?.apiKey);
  const squadsUnavailable = !squadsLoading && squadsData.length === 0 && !panelConfigured;

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

  const addFeature = (index: number, value: string) => {
    const val = value.trim();
    if (val) updatePlan(index, { features: [...plans[index].features, val] });
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
      <Card className="border-neutral-800 bg-neutral-900/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Тарифные планы</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Управление подписками и назначение доступа
            </p>
          </div>
          {plans[0]?.squadUuid ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Настроено
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-600/40 bg-neutral-700/20 px-3 py-1 text-xs font-medium text-neutral-400">
              <XCircle className="h-3 w-3" />
              Сквад не назначен
            </span>
          )}
        </div>

        <div className="space-y-4">
          {plans.map((plan, index) => {
            const isDefault = index === 0 && !plan.isStub;
            return (
              <div
                key={plan.id}
                className={cn(
                  'rounded-lg border p-4',
                  plan.isStub
                    ? 'border-neutral-700/30 bg-neutral-800/20'
                    : 'border-neutral-700/50 bg-neutral-800/30',
                )}
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
                      <Toggle
                        size="sm"
                        checked={plan.active}
                        onChange={(next) => updatePlan(index, { active: next })}
                        label="Активировать план"
                      />
                    )}
                    {!isDefault && (
                      <button
                        type="button"
                        aria-label="Удалить план"
                        onClick={() => removePlan(index)}
                        className="rounded p-1 text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className={cn('grid gap-3', plan.isStub ? 'grid-cols-1' : 'grid-cols-2')}>
                  <Field label="Название">
                    <input
                      type="text"
                      value={plan.name}
                      onChange={(e) => updatePlan(index, { name: e.target.value })}
                      placeholder={isDefault ? 'Базовая' : 'Название плана'}
                      aria-label="Название плана"
                      className={inputClass}
                    />
                  </Field>

                  {!plan.isStub && (
                    <>
                      <Field label="Цена (₽)">
                        <input
                          type="number"
                          min={0}
                          value={plan.priceKopecks / 100}
                          onChange={(e) =>
                            updatePlan(index, {
                              priceKopecks: Math.round(Number(e.target.value) * 100),
                            })
                          }
                          aria-label="Цена в рублях"
                          className={inputClass}
                        />
                      </Field>

                      <Field
                        label="Длительность (дней)"
                        icon={<Clock className="h-3.5 w-3.5 text-neutral-500" />}
                        className="col-span-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={plan.durationDays}
                            onChange={(e) =>
                              updatePlan(index, { durationDays: Number(e.target.value) })
                            }
                            aria-label="Длительность в днях"
                            className={cn(inputClass, 'w-28')}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {DURATION_PRESETS.map((days) => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => updatePlan(index, { durationDays: days })}
                                className={cn(
                                  'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                  plan.durationDays === days
                                    ? 'border-primary-500/40 bg-primary-500/10 text-primary-300'
                                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white',
                                )}
                              >
                                {days} дн
                              </button>
                            ))}
                          </div>
                        </div>
                      </Field>

                      <Field label="Внутренний сквад" className="col-span-2">
                        {squadsUnavailable ? (
                          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                            <WifiOff className="h-3.5 w-3.5 shrink-0" />
                            Нет связи с панелью — настройте подключение во вкладке «Remnawave»
                          </div>
                        ) : squadsData.length === 0 ? (
                          <div className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-500">
                            В панели нет внутренних сквадов
                          </div>
                        ) : (
                          <select
                            value={plan.squadUuid ?? ''}
                            onChange={(e) =>
                              updatePlan(index, { squadUuid: e.target.value || null })
                            }
                            aria-label="Внутренний сквад"
                            className={inputClass}
                          >
                            <option value="">Не назначен</option>
                            {squadsData.map((squad) => (
                              <option key={squad.uuid} value={squad.uuid}>
                                {squad.squadName} · {squad.inboundsCount} инб. ·{' '}
                                {squad.membersCount} польз.
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                    </>
                  )}
                </div>

                <Field label="Описание" className="mt-3">
                  <textarea
                    value={plan.description}
                    onChange={(e) => updatePlan(index, { description: e.target.value })}
                    placeholder="Краткое описание тарифа"
                    aria-label="Описание тарифа"
                    rows={2}
                    className={cn(inputClass, 'resize-none')}
                  />
                </Field>

                {/* Features */}
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
                            aria-label="Удалить фичу"
                            onClick={() =>
                              updatePlan(index, {
                                features: plan.features.filter((_, i) => i !== fi),
                              })
                            }
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
                      className={cn(inputClass, 'flex-1 px-3 py-1.5 text-xs')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addFeature(index, (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Добавить фичу"
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                        addFeature(index, input.value);
                        input.value = '';
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
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Сохранить
          </Button>
        </div>
      </Card>

      {/* Live preview — how the plans will look on /subscription */}
      <Card className="border-neutral-800 bg-neutral-900/50 p-6">
        <h3 className="mb-1 text-lg font-semibold text-white">Предпросмотр</h3>
        <p className="mb-5 text-sm text-neutral-400">
          Так тарифы увидят пользователи на странице подписок
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {realPlans.map((plan, i) => (
            <PlanPreviewCard key={plan.id} {...plan} highlighted={i === 0} />
          ))}
          {plans
            .filter((p) => p.isStub)
            .map((plan) => (
              <PlanPreviewCard key={plan.id} {...plan} />
            ))}
        </div>
      </Card>
    </div>
  );
}

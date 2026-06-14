'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
import { Globe, Key, CheckCircle2, XCircle, Loader2, RefreshCw, Tag, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Toggle } from '@/components/admin/ui/Toggle';
import { TextField } from '@/components/admin/ui/Field';

const formSchema = z.object({
  endpoint: z.string().url('Укажите корректный URL панели'),
  apiKey: z.string().min(1, 'Укажите API-ключ'),
  testPromoEnabled: z.boolean(),
  testPromoCode: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

export default function RemnawaveSettings() {
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.remnawave.get.useQuery();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { endpoint: '', apiKey: '', testPromoEnabled: false, testPromoCode: '' },
  });

  const testPromoEnabled = watch('testPromoEnabled');

  // Populate the form once settings load.
  useEffect(() => {
    if (data) {
      reset({
        endpoint: data.endpoint,
        apiKey: data.apiKey,
        testPromoEnabled: data.testPromoEnabled,
        testPromoCode: data.testPromoCode,
      });
    }
  }, [data, reset]);

  const {
    data: healthData,
    isFetching: healthLoading,
    refetch: refetchHealth,
    error: healthError,
  } = trpc.admin.remnawave.healthCheck.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  const updateMutation = trpc.admin.remnawave.update.useMutation({
    onSuccess: () => {
      // Saved endpoint/key change what the panel returns, so refetch everything
      // derived from it — not just the settings form itself.
      utils.admin.remnawave.get.invalidate();
      utils.admin.remnawave.squads.invalidate();
      utils.admin.subscriptionPlans.list.invalidate();
      utils.subscription.servers.invalidate();
      utils.subscription.publicServers.invalidate();
      // Auto-verify connectivity right after saving.
      refetchHealth();
    },
  });

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate({
      endpoint: values.endpoint.trim(),
      apiKey: values.apiKey.trim(),
      testPromoEnabled: values.testPromoEnabled,
      testPromoCode: values.testPromoCode.trim(),
    });
  };

  const isConfigured = Boolean(data?.endpoint && data?.apiKey);
  const saving = updateMutation.isPending;
  const saveError = updateMutation.error?.message;
  const saved = updateMutation.isSuccess && !isDirty;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const metrics = healthData?.metrics?.[0];

  return (
    <div className="space-y-6">
      <Card className="border-neutral-800 bg-neutral-900/50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Subscription API</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Подключение к панели Remnawave для управления подписками
            </p>
          </div>
          <StatusBadge isConfigured={isConfigured} />
        </div>

        {!isConfigured && (
          <div className="mb-5 rounded-lg border border-neutral-700/50 bg-neutral-800/30 px-4 py-3 text-sm text-neutral-400">
            Укажите адрес панели и API-ключ, чтобы активировать подписки. До настройки сервис
            подписок неактивен — серверы и тарифы недоступны пользователям.
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-4">
          <TextField
            label="Endpoint"
            icon={<Globe className="h-4 w-4 text-neutral-500" />}
            type="url"
            placeholder="https://panel.example.com"
            error={errors.endpoint?.message}
            {...register('endpoint')}
          />

          <TextField
            label="API Key (Bearer Token)"
            icon={<Key className="h-4 w-4 text-neutral-500" />}
            type="password"
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            error={errors.apiKey?.message}
            {...register('apiKey')}
          />

          {/* Test promo code */}
          <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-300">
                <Tag className="h-4 w-4 text-neutral-500" />
                Тестовый промокод
              </span>
              <Toggle
                checked={testPromoEnabled}
                onChange={(next) => setValue('testPromoEnabled', next, { shouldDirty: true })}
                label="Включить тестовый промокод"
              />
            </div>
            {testPromoEnabled && (
              <input
                type="text"
                placeholder="Введите промокод"
                aria-label="Тестовый промокод"
                className="mt-3 w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none"
                {...register('testPromoCode')}
              />
            )}
          </div>

          {saveError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {saveError}
            </div>
          )}
          {saved && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
              Настройки сохранены
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Сохранить
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => refetchHealth()}
              disabled={healthLoading || !isConfigured}
            >
              {healthLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Проверить подключение
            </Button>
          </div>
        </form>
      </Card>

      {(healthData || healthError) && (
        <Card className="border-neutral-800 bg-neutral-900/50 p-6">
          {healthError ? (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <XCircle className="h-4 w-4" />
              Панель недоступна: {healthError.message}
            </div>
          ) : healthData ? (
            <div>
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Панель доступна
              </div>
              {metrics && (
                <Accordion type="single" collapsible className="mt-2">
                  <AccordionItem value="metrics" className="border-neutral-800">
                    <AccordionTrigger className="text-sm text-neutral-300 hover:no-underline">
                      <span className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-neutral-500" />
                        Метрики панели
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric
                          label="Uptime"
                          value={`${Math.floor(metrics.uptime / 3600)}ч ${Math.floor((metrics.uptime % 3600) / 60)}м`}
                        />
                        <Metric
                          label="Heap"
                          value={`${(metrics.heapUsed / 1024 / 1024).toFixed(1)} MB`}
                        />
                        <Metric
                          label="RSS"
                          value={`${(metrics.rss / 1024 / 1024).toFixed(1)} MB`}
                        />
                        <Metric label="PID" value={String(metrics.pid)} />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ isConfigured }: { isConfigured: boolean }) {
  return isConfigured ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
      <CheckCircle2 className="h-3 w-3" />
      Настроено
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-600/40 bg-neutral-700/20 px-3 py-1 text-xs font-medium text-neutral-400">
      Не настроено
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

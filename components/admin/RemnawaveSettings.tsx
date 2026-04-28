'use client';

import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Globe, Key, CheckCircle2, XCircle, Loader2, RefreshCw, Tag } from 'lucide-react';

export default function RemnawaveSettings() {
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testPromoEnabled, setTestPromoEnabled] = useState(false);
  const [testPromoCode, setTestPromoCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showKey, setShowKey] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.remnawave.get.useQuery();

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const updateMutation = trpc.admin.remnawave.update.useMutation({
    onSuccess: () => {
      setSuccess('Настройки сохранены');
      setError('');
      utils.admin.remnawave.get.invalidate();
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSuccess(''), 3000);
    },
    onError: (err) => {
      setError(err.message || 'Ошибка при сохранении');
      setSuccess('');
    },
  });

  const {
    data: healthData,
    isLoading: healthLoading,
    refetch: refetchHealth,
    error: healthError,
  } = trpc.admin.remnawave.healthCheck.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setEndpoint(data.endpoint);
      setApiKey(data.apiKey);
      setTestPromoEnabled(data.testPromoEnabled);
      setTestPromoCode(data.testPromoCode);
    }
  }, [data]);

  const handleSave = () => {
    setError('');
    if (!endpoint.trim()) {
      setError('Укажите Endpoint панели');
      return;
    }
    if (!apiKey.trim()) {
      setError('Укажите API Key');
      return;
    }
    updateMutation.mutate({
      endpoint: endpoint.trim(),
      apiKey: apiKey.trim(),
      testPromoEnabled,
      testPromoCode: testPromoCode.trim(),
    });
  };

  const handleTestConnection = () => {
    setError('');
    refetchHealth();
  };

  const isConfigured = Boolean(data?.endpoint && data?.apiKey);
  const saving = updateMutation.isPending;

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
            <h3 className="text-lg font-semibold text-white">Subscription API</h3>
            <p className="mt-1 text-sm text-neutral-400">
              Подключение к панели для управления подписками
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isConfigured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Настроено
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
                <XCircle className="h-3 w-3" />
                Не настроено
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="rw-endpoint"
              className="mb-1.5 block text-sm font-medium text-neutral-300"
            >
              <Globe className="mr-1.5 inline h-4 w-4 text-neutral-500" />
              Endpoint
            </label>
            <input
              id="rw-endpoint"
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://panel.example.com"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="rw-api-key"
              className="mb-1.5 block text-sm font-medium text-neutral-300"
            >
              <Key className="mr-1.5 inline h-4 w-4 text-neutral-500" />
              API Key (Bearer Token)
            </label>
            <div className="relative">
              <input
                id="rw-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIs..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 pr-20 text-sm text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:text-white"
              >
                {showKey ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          {/* Test promo code settings */}
          <div className="mt-6 rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-neutral-500" />
                <span className="text-sm font-medium text-neutral-300">Тестовый промокод</span>
              </div>
              <button
                type="button"
                onClick={() => setTestPromoEnabled(!testPromoEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  testPromoEnabled ? 'bg-primary-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                    testPromoEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {testPromoEnabled && (
              <div className="mt-3">
                <input
                  id="rw-test-promo"
                  type="text"
                  value={testPromoCode}
                  onChange={(e) => setTestPromoCode(e.target.value)}
                  placeholder="Введите промокод"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-white placeholder-neutral-500 transition-colors focus:border-primary-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

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

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Сохранить
          </button>

          <button
            onClick={handleTestConnection}
            disabled={healthLoading || !isConfigured}
            className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {healthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Проверить подключение
          </button>
        </div>
      </div>

      {(healthData || healthError) && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
          <h4 className="mb-3 text-sm font-semibold text-white">Статус подключения</h4>
          {healthError ? (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <XCircle className="h-4 w-4" />
              Ошибка: {healthError.message}
            </div>
          ) : healthData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Панель доступна
              </div>
              {healthData.metrics?.[0] && (
                <div className="xs:grid-cols-2 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                    <div className="text-xs text-neutral-500">Uptime</div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {Math.floor(healthData.metrics[0].uptime / 3600)}ч{' '}
                      {Math.floor((healthData.metrics[0].uptime % 3600) / 60)}м
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                    <div className="text-xs text-neutral-500">Heap</div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {(healthData.metrics[0].heapUsed / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                    <div className="text-xs text-neutral-500">RSS</div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {(healthData.metrics[0].rss / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-800 bg-neutral-800/50 p-3">
                    <div className="text-xs text-neutral-500">PID</div>
                    <div className="mt-1 text-sm font-medium text-white">
                      {healthData.metrics[0].pid}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

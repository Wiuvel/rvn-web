'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Check as Save, AlertTriangle, X, Calendar } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface MaintenanceConfig {
  isActive: boolean;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  message: string;
}

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig?: MaintenanceConfig;
}

export default function MaintenanceModal({
  isOpen,
  onClose,
  initialConfig,
}: MaintenanceModalProps) {
  const [config, setConfig] = useState<MaintenanceConfig>(
    initialConfig || {
      isActive: false,
      scheduledStart: null,
      scheduledEnd: null,
      message: '',
    },
  );
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [mounted, setMounted] = useState(false);

  const { data: fetchedConfig, isLoading: loading } = trpc.admin.maintenance.get.useQuery(
    undefined,
    {
      enabled: !initialConfig,
    },
  );

  useEffect(() => {
    if (fetchedConfig) {
      setConfig(fetchedConfig as MaintenanceConfig);
    }
  }, [fetchedConfig]);

  const updateMutation = trpc.admin.maintenance.update.useMutation({
    onSuccess: () => {
      setMessage({ text: 'Настройки сохранены', type: 'success' });
      setTimeout(() => {
        onClose();
        setMessage(null);
      }, 1500);
    },
    onError: () => {
      setMessage({ text: 'Ошибка сохранения', type: 'error' });
    },
  });

  const saving = updateMutation.isPending;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const handleSave = () => {
    setMessage(null);
    updateMutation.mutate(config);
  };

  const toInputFormat = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const offset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - offset);
      return localDate.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  const fromInputFormat = (value: string) => {
    if (!value) return null;
    return new Date(value).toISOString();
  };

  const handleToggle = () => {
    const newIsActive = !config.isActive;
    const updates: Partial<MaintenanceConfig> = {
      isActive: newIsActive,
    };

    if (!newIsActive) {
      updates.scheduledStart = null;
      updates.scheduledEnd = null;
    }

    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    const updates: Partial<MaintenanceConfig> = {
      scheduledStart: fromInputFormat(newStartDate),
    };

    // Если дата окончания не установлена или меньше даты начала,
    // автоматически устанавливаем дату окончания = дата начала + 1 час
    if (newStartDate) {
      updates.isActive = true; // Автоматически включаем чекбокс
      const start = new Date(newStartDate);
      const currentEnd = config.scheduledEnd ? new Date(config.scheduledEnd) : null;

      if (!currentEnd || currentEnd <= start) {
        const autoEnd = new Date(start.getTime() + 60 * 60 * 1000); // +1 час
        updates.scheduledEnd = autoEnd.toISOString();
      }
    }

    setConfig((prev) => ({ ...prev, ...updates }));
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          onClose();
        }
      }}
      aria-label="Close modal"
    >
      <div
        className="animate-scaleIn flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <Settings className="h-5 w-5 text-orange-500" />
            </div>
            <h2 id="maintenance-modal-title" className="text-lg font-semibold text-white">
              Технические работы
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="custom-scrollbar space-y-6 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {message && (
                <div
                  className={`rounded-lg p-3 text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} animate-fadeIn`}
                >
                  {message.text}
                </div>
              )}

              {/* Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-4">
                <div>
                  <h3 className="font-medium text-white">Режим обслуживания</h3>
                  <p className="text-sm text-neutral-400">Включить заглушку</p>
                </div>
                <button
                  onClick={handleToggle}
                  className={`relative h-6 w-12 rounded-full transition-colors duration-200 focus:outline-none ${
                    config.isActive ? 'bg-blue-600' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-200 ${
                      config.isActive ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="start-date"
                    className="flex items-center gap-2 text-sm font-medium text-neutral-300"
                  >
                    <Calendar className="h-4 w-4 text-blue-400" />
                    Начало работ
                  </label>
                  <input
                    id="start-date"
                    type="datetime-local"
                    value={toInputFormat(config.scheduledStart)}
                    onChange={handleStartDateChange}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="end-date"
                    className="flex items-center gap-2 text-sm font-medium text-neutral-300"
                  >
                    <Calendar className="h-4 w-4 text-purple-400" />
                    Окончание работ
                  </label>
                  <input
                    id="end-date"
                    type="datetime-local"
                    value={toInputFormat(config.scheduledEnd)}
                    onChange={(e) =>
                      setConfig({ ...config, scheduledEnd: fromInputFormat(e.target.value) })
                    }
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-white transition-colors focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-neutral-300">
                  Сообщение
                </label>
                <textarea
                  id="message"
                  value={config.message}
                  onChange={(e) => setConfig({ ...config, message: e.target.value })}
                  placeholder="Мы проводим плановое обновление..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>Администраторы по-прежнему смогут заходить на сайт.</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-neutral-800 bg-neutral-900/50 p-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-600/50"
          >
            {saving ? <LoadingSpinner size="sm" /> : <Save className="h-4 w-4" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

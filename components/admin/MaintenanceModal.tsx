'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Save, AlertTriangle, X, Calendar } from 'lucide-react';
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

export default function MaintenanceModal({ isOpen, onClose, initialConfig }: MaintenanceModalProps) {
  const [config, setConfig] = useState<MaintenanceConfig>({
    isActive: false,
    scheduledStart: null,
    scheduledEnd: null,
    message: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  
  useEffect(() => {
    if (isOpen) {
      if (initialConfig) {
        setConfig(initialConfig);
        setLoading(false);
      } else {
        fetchConfig();
      }
    }
  }, [isOpen, initialConfig]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/maintenance');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch maintenance config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage({ text: 'Настройки сохранены', type: 'success' });
        setTimeout(() => {
          onClose();
          setMessage(null);
        }, 1500);
      } else {
        setMessage({ text: 'Ошибка сохранения', type: 'error' });
      }
    } catch (error) {
      console.error('Failed to save maintenance config:', error);
      setMessage({ text: 'Ошибка сохранения', type: 'error' });
    } finally {
      setSaving(false);
    }
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
      isActive: newIsActive
    };

    if (!newIsActive) {
      updates.scheduledStart = null;
      updates.scheduledEnd = null;
    }

    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    const updates: Partial<MaintenanceConfig> = {
      scheduledStart: fromInputFormat(newStartDate)
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

    setConfig(prev => ({ ...prev, ...updates }));
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-lg shadow-2xl animate-scaleIn overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Settings className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">Технические работы</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} animate-fadeIn`}>
                  {message.text}
                </div>
              )}

              {/* Toggle */}
              <div className="flex items-center justify-between p-4 bg-neutral-800/50 rounded-xl border border-neutral-700/50">
                <div>
                  <h3 className="font-medium text-white">Режим обслуживания</h3>
                  <p className="text-sm text-neutral-400">Включить заглушку</p>
                </div>
                <button
                  onClick={handleToggle}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                    config.isActive ? 'bg-blue-600' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${
                      config.isActive ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    Начало работ
                  </label>
                  <input
                    type="datetime-local"
                    value={toInputFormat(config.scheduledStart)}
                    onChange={handleStartDateChange}
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" />
                    Окончание работ
                  </label>
                  <input
                    type="datetime-local"
                    value={toInputFormat(config.scheduledEnd)}
                    onChange={(e) => setConfig({ ...config, scheduledEnd: fromInputFormat(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">Сообщение</label>
                <textarea
                  value={config.message}
                  onChange={(e) => setConfig({ ...config, message: e.target.value })}
                  placeholder="Мы проводим плановое обновление..."
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-200">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Администраторы по-прежнему смогут заходить на сайт.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors font-medium text-sm"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors font-medium text-sm"
          >
            {saving ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

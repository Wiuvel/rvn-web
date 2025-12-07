'use client';

import { useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { GSAP_DEFAULT_DURATION, GSAP_DEFAULT_EASE } from '@/lib/utils/constants';

interface TrustedDeveloper {
  id: string;
  email: string | null;
  github_username: string;
  created_at: string;
  updated_at: string;
}

export default function TrustedDevelopersSettings() {
  const [developers, setDevelopers] = useState<TrustedDeveloper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({ email: '', github_username: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDevelopers();
  }, []);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchDevelopers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/trusted-developers', {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Не удалось загрузить список разработчиков');
        return;
      }
      setDevelopers(data.developers || []);
    } catch (err) {
      console.error('Error fetching developers:', err);
      setError('Ошибка загрузки списка разработчиков');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/admin/trusted-developers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: formData.email.trim() || undefined,
          github_username: formData.github_username.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Не удалось добавить разработчика');
        return;
      }

      setSuccessMessage('Разработчик успешно добавлен');
      setFormData({ email: '', github_username: '' });
      setShowAddForm(false);
      fetchDevelopers();
    } catch (err) {
      console.error('Error adding developer:', err);
      setError('Ошибка при добавлении разработчика');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого разработчика?')) {
      return;
    }

    setDeletingId(id);
    setError('');

    try {
      const response = await fetch(`/api/admin/trusted-developers?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Не удалось удалить разработчика');
        return;
      }

      setSuccessMessage('Разработчик успешно удален');
      fetchDevelopers();
    } catch (err) {
      console.error('Error deleting developer:', err);
      setError('Ошибка при удалении разработчика');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} - ${hours}:${minutes}`;
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Доверенные GitHub разработчики
            </h3>
            <p className="text-sm text-neutral-400">
              Управление списком разработчиков, которым разрешен доступ к админ-панели через GitHub OAuth
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium text-sm"
          >
            {showAddForm ? 'Отмена' : '+ Добавить'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
            {successMessage}
          </div>
        )}

        {showAddForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Email (опционально)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="developer@example.com"
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Email используется для проверки при авторизации (приоритет над username)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                GitHub Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.github_username}
                onChange={(e) => setFormData({ ...formData, github_username: e.target.value })}
                placeholder="Wiuvel"
                required
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Логин GitHub аккаунта разработчика
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !formData.github_username.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Добавление...' : 'Добавить разработчика'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ email: '', github_username: '' });
                  setError('');
                }}
                className="px-4 py-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors font-medium text-sm"
              >
                Отмена
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 bg-neutral-950 border border-neutral-800 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : developers.length === 0 ? (
          <div className="text-center py-12 text-neutral-500">
            <p className="text-lg mb-2">Нет доверенных разработчиков</p>
            <p className="text-sm">Добавьте первого разработчика, чтобы разрешить доступ через GitHub OAuth</p>
          </div>
        ) : (
          <div className="space-y-3">
            {developers.map((developer) => (
              <div
                key={developer.id}
                className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 font-semibold">
                        {developer.github_username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {developer.github_username}
                        </div>
                        {developer.email && (
                          <div className="text-sm text-neutral-400">
                            {developer.email}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-500 ml-13">
                      Добавлен: {formatDate(developer.created_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(developer.id)}
                    disabled={deletingId === developer.id}
                    className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingId === developer.id ? 'Удаление...' : 'Удалить'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', github_username: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isRootAdmin, setIsRootAdmin] = useState(false);
  const [checkingRoot, setCheckingRoot] = useState(true);

  useEffect(() => {
    checkRootAccess();
    fetchDevelopers();
  }, []);

  const checkRootAccess = async () => {
    setCheckingRoot(true);
    try {
      const response = await fetch('/api/admin/check-root', {
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data.isRoot) {
        setIsRootAdmin(true);
      }
    } catch (err) {
      console.error('Error checking root access:', err);
    } finally {
      setCheckingRoot(false);
    }
  };

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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate form before showing confirmation
    if (!formData.github_username.trim()) {
      setError('GitHub username обязателен для заполнения');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmAdd = async () => {
    setSubmitting(true);
    setError('');
    setShowConfirmModal(false);

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
              Способы авторизации
            </h3>
            <p className="text-sm text-neutral-400">
              Управление списком разработчиков, которым разрешен доступ к панели управления
            </p>
            {!checkingRoot && !isRootAdmin && (
              <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-xs text-yellow-400">
                  Только Root администратор может управлять доверенными разработчиками
                </p>
              </div>
            )}
          </div>
          {isRootAdmin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium text-sm"
            >
              {showAddForm ? 'Отмена' : '+ Добавить'}
            </button>
          )}
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

        {isRootAdmin && showAddForm && (
          <div className="mb-6 p-6 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 border border-neutral-800 rounded-xl shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Добавить разработчика</h4>
                <p className="text-xs text-neutral-400">Заполните данные для доступа через GitHub OAuth</p>
              </div>
            </div>
            
            <form onSubmit={handleFormSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-300">
                  GitHub Username <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-neutral-500" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={formData.github_username}
                    onChange={(e) => setFormData({ ...formData, github_username: e.target.value })}
                    placeholder="Wiuvel"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                </div>
                <p className="text-xs text-neutral-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Логин GitHub аккаунта разработчика (обязательно)
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-300">
                  Email <span className="text-xs text-neutral-500 font-normal">(опционально)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="developer@example.com"
                    className="w-full pl-10 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  />
                </div>
                <p className="text-xs text-neutral-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Email используется для проверки при авторизации (приоритет над username)
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !formData.github_username.trim()}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Добавление...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Добавить разработчика
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ email: '', github_username: '' });
                    setError('');
                  }}
                  className="px-4 py-3 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors font-medium text-sm"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {developers.map((developer) => (
              <div
                key={developer.id}
                className="group p-5 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 border border-neutral-800 rounded-xl hover:border-neutral-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl flex items-center justify-center text-blue-400 font-bold text-lg shadow-lg shadow-blue-500/10">
                      {developer.github_username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                        <div className="font-semibold text-white truncate">
                          {developer.github_username}
                        </div>
                      </div>
                      {developer.email ? (
                        <div className="flex items-center gap-2 text-sm text-neutral-400">
                          <svg className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{developer.email}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-500 italic">Email не указан</div>
                      )}
                    </div>
                  </div>
                  {isRootAdmin && (
                    <button
                      onClick={() => handleDelete(developer.id)}
                      disabled={deletingId === developer.id}
                      className="ml-2 p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Удалить разработчика"
                    >
                    {deletingId === developer.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 pt-3 border-t border-neutral-800">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Добавлен: {formatDate(developer.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfirmModal(false);
            }
          }}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Подтверждение добавления</h3>
                  <p className="text-sm text-neutral-400">Проверьте данные перед добавлением</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">GitHub Username</div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-neutral-500" fill="currentColor" viewBox="0 0 24 24">
                      <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    <span className="text-white font-medium">{formData.github_username}</span>
                  </div>
                </div>
                {formData.email && (
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Email</div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="text-white">{formData.email}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-sm text-blue-300">
                  После добавления разработчик сможет авторизироваться в панели управления через GitHub OAuth. Будьте осторожны с этим действием.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-neutral-800 flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-4 py-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors font-medium text-sm"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Добавление...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Подтвердить
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


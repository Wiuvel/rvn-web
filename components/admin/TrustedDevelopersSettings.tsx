'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

interface TrustedDeveloper {
  id: string;
  email: string | null;
  githubUsername: string;
  createdAt: string;
  updatedAt: string;
}

export default function TrustedDevelopersSettings() {
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', github_username: '' });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: rootData, isLoading: checkingRoot } = trpc.admin.checkRoot.useQuery();
  const isRootAdmin = rootData?.isRoot ?? false;

  const { data: devsData, isLoading: loading } = trpc.admin.trustedDevs.list.useQuery();
  const developers: TrustedDeveloper[] = (devsData?.developers as TrustedDeveloper[]) ?? [];

  const addMutation = trpc.admin.trustedDevs.add.useMutation({
    onSuccess: () => {
      showSuccess('Разработчик успешно добавлен');
      setFormData({ email: '', github_username: '' });
      setShowAddForm(false);
      utils.admin.trustedDevs.list.invalidate();
    },
    onError: (err) => setError(err.message || 'Ошибка при добавлении разработчика'),
  });

  const removeMutation = trpc.admin.trustedDevs.remove.useMutation({
    onSuccess: () => {
      showSuccess('Разработчик успешно удален');
      utils.admin.trustedDevs.list.invalidate();
    },
    onError: (err) => setError(err.message || 'Ошибка при удалении разработчика'),
    onSettled: () => setDeletingId(null),
  });

  const submitting = addMutation.isPending;

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.github_username.trim()) {
      setError('GitHub username обязателен для заполнения');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleConfirmAdd = async () => {
    setError('');
    setShowConfirmModal(false);
    addMutation.mutate({
      github_username: formData.github_username,
      email: formData.email || '',
    });
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError('');
    removeMutation.mutate({ id });
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
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="mb-2 text-xl font-semibold text-white">Способы авторизации</h3>
            <p className="text-sm text-neutral-400">
              Управление списком разработчиков, которым разрешен доступ к панели управления
            </p>
            {!checkingRoot && !isRootAdmin && (
              <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-2">
                <p className="text-xs text-yellow-400">
                  Нет прав для редактирования данного списка. Только для администраторов системы
                  сервиса.
                </p>
              </div>
            )}
          </div>
          {isRootAdmin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              {showAddForm ? 'Отмена' : '+ Добавить'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
            {successMessage}
          </div>
        )}

        {isRootAdmin && showAddForm && (
          <div className="mb-6 rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <svg
                  className="h-5 w-5 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Добавить разработчика</h4>
                <p className="text-xs text-neutral-400">
                  Заполните данные для доступа через GitHub OAuth
                </p>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="github-username"
                  className="block text-sm font-medium text-neutral-300"
                >
                  GitHub Username <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg
                      className="h-5 w-5 text-neutral-500"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <input
                    id="github-username"
                    type="text"
                    value={formData.github_username}
                    onChange={(e) => setFormData({ ...formData, github_username: e.target.value })}
                    placeholder="Wiuvel"
                    required
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-white placeholder-neutral-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <p className="flex items-center gap-1 text-xs text-neutral-500">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Логин GitHub аккаунта разработчика (обязательно)
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="developer-email"
                  className="block text-sm font-medium text-neutral-300"
                >
                  Email <span className="text-xs font-normal text-neutral-500">(опционально)</span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg
                      className="h-5 w-5 text-neutral-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <input
                    id="developer-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="developer@example.com"
                    className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-white placeholder-neutral-500 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <p className="flex items-center gap-1 text-xs text-neutral-500">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Почта используется для проверки при авторизации (приоритет над логином)
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !formData.github_username.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                      Добавление...
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 4v16m8-8H4"
                        />
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
                  className="rounded-lg bg-neutral-800 px-4 py-3 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {['skeleton-dev-1', 'skeleton-dev-2', 'skeleton-dev-3'].map((skeletonKey) => (
              <div
                key={skeletonKey}
                className="h-20 animate-pulse rounded-lg border border-neutral-800 bg-neutral-950"
              />
            ))}
          </div>
        ) : developers.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <p className="mb-2 text-lg">Нет доверенных разработчиков</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {developers.map((developer) => (
              <div
                key={developer.id}
                className="group rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-950 via-neutral-950 to-neutral-900 p-5 shadow-lg transition-all duration-200 hover:border-neutral-700 hover:shadow-xl"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 text-lg font-bold text-blue-400 shadow-lg shadow-blue-500/10">
                      {developer.githubUsername.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <svg
                          className="h-4 w-4 flex-shrink-0 text-neutral-500"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <div className="truncate font-semibold text-white">
                          {developer.githubUsername}
                        </div>
                      </div>
                      {developer.email ? (
                        <div className="flex items-center gap-2 text-sm text-neutral-400">
                          <svg
                            className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="truncate">{developer.email}</span>
                        </div>
                      ) : (
                        <div className="text-xs italic text-neutral-500">Email не указан</div>
                      )}
                    </div>
                  </div>
                  {isRootAdmin && (
                    <button
                      onClick={() => handleDelete(developer.id)}
                      disabled={deletingId === developer.id}
                      className="ml-2 flex items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Удалить разработчика"
                    >
                      {deletingId === developer.id ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-red-400"></div>
                      ) : (
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Добавлен: {formatDate(developer.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowConfirmModal(false);
            }
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (
              e.key === 'Escape' ||
              (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' '))
            ) {
              setShowConfirmModal(false);
            }
          }}
          aria-label="Close modal"
        >
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="border-b border-neutral-800 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/20">
                  <svg
                    className="h-6 w-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Подтверждение добавления</h3>
                  <p className="text-sm text-neutral-400">Проверьте данные перед добавлением</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-6">
              <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
                    GitHub Username
                  </div>
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-neutral-500"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.532 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-medium text-white">{formData.github_username}</span>
                  </div>
                </div>
                {formData.email && (
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
                      Email
                    </div>
                    <div className="flex items-center gap-2">
                      <svg
                        className="h-4 w-4 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-white">{formData.email}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-sm text-blue-300">
                  После добавления разработчик сможет авторизироваться в панели управления через
                  GitHub OAuth. Будьте осторожны с этим действием.
                </p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-neutral-800 p-6">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
                    Добавление...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
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

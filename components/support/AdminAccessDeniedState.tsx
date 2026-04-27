import Link from 'next/link';

interface AdminAccessDeniedStateProps {
  onRetry: () => void;
}

/**
 * Placeholder shown when the current user does not have support access in the admin panel.
 * Provides a retry action (re-fetches `support.check`) and a link back to the panel selector.
 */
export function AdminAccessDeniedState({ onRetry }: AdminAccessDeniedStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20">
            <svg
              className="h-10 w-10 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">Доступ ограничен</h1>
          <p className="mb-6 text-neutral-400">
            У вас нет доступа к данной странице. Возможно произошла ошибка или вы не авторизованы
            в системе.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={onRetry}
              className="inline-flex items-center rounded-lg bg-neutral-700 px-4 py-2 text-white transition-colors hover:bg-neutral-600"
            >
              Повторить
            </button>
            <Link
              href="/ui/panel"
              prefetch={false}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Вернуться к выбору панели
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

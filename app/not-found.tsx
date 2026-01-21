import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-lg mx-auto relative z-10">
          {/* 404 */}
          <div className="relative mb-8">
            <h1 className="text-[10rem] sm:text-[12rem] font-black leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-primary-400 via-primary-500 to-purple-600 select-none">
              404
            </h1>
            {/* Decorative elements */}
            <div className="absolute -top-4 -left-4 w-8 h-8 border-l-2 border-t-2 border-primary-500/50" />
            <div className="absolute -bottom-4 -right-4 w-8 h-8 border-r-2 border-b-2 border-purple-500/50" />
          </div>

          {/* Message */}
          <div className="space-y-4 mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Страница не найдена
            </h2>
            <p className="text-neutral-400 text-base sm:text-lg max-w-md mx-auto">
              К сожалению, запрашиваемая страница не существует или была перемещена.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white font-medium rounded-full transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-primary-500/25"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              На главную
            </Link>
          </div>

          {/* Error code */}
          <p className="mt-10 text-sm text-neutral-500">
            Код ошибки: <span className="font-mono text-neutral-400">404 NOT_FOUND</span>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-neutral-600">
        <p>© {new Date().getFullYear()} RVNPrivate</p>
      </footer>
    </div>
  );
}

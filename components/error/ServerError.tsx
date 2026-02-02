/**
 * Reusable server error page component
 * Used in both error.tsx (Error Boundary) and /error/500 route
 */
export default function ServerError() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-6">
        {/* 500 */}
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">
            500
          </h1>
        </div>

        {/* Message */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Ошибка сервера</h2>
          <p className="text-neutral-400 mb-6">
            Произошла ошибка при обработке запроса. Повторите попытку позже.
          </p>
        </div>
      </div>
    </div>
  );
}
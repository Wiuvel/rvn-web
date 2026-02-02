export default function NotFoundSimple() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-6">
        {/* 404 */}
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600">
            404
          </h1>
        </div>

        {/* Message */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Страница не найдена</h2>
          <p className="text-neutral-400 mb-6">
            К сожалению, запрашиваемая страница не существует или была перемещена.
          </p>
        </div>
      </div>
    </div>
  );
}
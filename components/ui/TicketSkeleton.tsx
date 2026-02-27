'use client';

interface TicketSkeletonProps {
  count?: number;
  variant?: 'panel' | 'user';
}

export default function TicketSkeleton({ count = 1, variant = 'user' }: TicketSkeletonProps) {
  const shimmerClass =
    'bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-shimmer';

  // Generate stable IDs for skeletons to avoid array index keys
  const skeletonIds = Array.from({ length: count }, (_, i) => `skeleton-${i}`);

  if (variant === 'panel') {
    // Вариант для панели поддержки (admin)
    return (
      <>
        {skeletonIds.map((id) => (
          <div
            key={`panel-${id}`}
            className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-4"
          >
            <div className="mb-2 flex items-start justify-between">
              <div className={`h-4 ${shimmerClass} flex-1 rounded`}></div>
              <div className={`h-5 w-16 ${shimmerClass} ml-2 rounded`}></div>
            </div>
            <div className={`h-3 ${shimmerClass} mb-1 w-24 rounded`}></div>
            <div className="flex items-center justify-between">
              <div className={`h-3 ${shimmerClass} w-32 rounded`}></div>
              <div className={`h-3 ${shimmerClass} w-40 rounded`}></div>
            </div>
            <div className={`h-3 ${shimmerClass} mt-1.5 w-48 rounded`}></div>
          </div>
        ))}
      </>
    );
  }

  // Вариант для пользовательской страницы поддержки
  return (
    <>
      {skeletonIds.map((id) => (
        <div
          key={`user-${id}`}
          className="w-full rounded-xl border border-transparent bg-neutral-800/50 p-3 text-left"
        >
          <div className="mb-1 flex items-start justify-between">
            <div className={`h-4 ${shimmerClass} flex-1 rounded`}></div>
            <div className={`h-5 w-16 ${shimmerClass} ml-2 rounded`}></div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <div className={`h-3 ${shimmerClass} w-32 rounded`}></div>
          </div>
          <div className={`h-3 ${shimmerClass} mt-1.5 w-48 rounded`}></div>
        </div>
      ))}
    </>
  );
}

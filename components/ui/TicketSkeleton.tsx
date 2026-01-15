'use client';

interface TicketSkeletonProps {
  count?: number;
  variant?: 'panel' | 'user';
}

export default function TicketSkeleton({ count = 1, variant = 'user' }: TicketSkeletonProps) {
  const shimmerClass = "bg-gradient-to-r from-neutral-700 via-neutral-600 to-neutral-700 bg-[length:200%_100%] animate-shimmer";
  
  if (variant === 'panel') {
    // Вариант для панели поддержки (admin)
    return (
      <>
        {[...Array(count)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border bg-neutral-800/50 border-neutral-700"
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`h-4 ${shimmerClass} rounded flex-1`}></div>
              <div className={`h-5 w-16 ${shimmerClass} rounded ml-2`}></div>
            </div>
            <div className={`h-3 ${shimmerClass} rounded w-24 mb-1`}></div>
            <div className="flex items-center justify-between">
              <div className={`h-3 ${shimmerClass} rounded w-32`}></div>
              <div className={`h-3 ${shimmerClass} rounded w-40`}></div>
            </div>
            <div className={`h-3 ${shimmerClass} rounded w-48 mt-1.5`}></div>
          </div>
        ))}
      </>
    );
  }

  // Вариант для пользовательской страницы поддержки
  return (
    <>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="w-full text-left p-3 rounded-xl bg-neutral-800/50 border border-transparent"
        >
          <div className="flex items-start justify-between mb-1">
            <div className={`h-4 ${shimmerClass} rounded flex-1`}></div>
            <div className={`h-5 w-16 ${shimmerClass} rounded ml-2`}></div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className={`h-3 ${shimmerClass} rounded w-32`}></div>
          </div>
          <div className={`h-3 ${shimmerClass} rounded w-48 mt-1.5`}></div>
        </div>
      ))}
    </>
  );
}


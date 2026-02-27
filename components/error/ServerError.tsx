'use client';

import ErrorState from '@/components/ui/ErrorState';

/**
 * Reusable server error page component
 * Used in both error.tsx (Error Boundary) and /error/500 route
 */
export default function ServerError() {
  return (
    <ErrorState
      code="500"
      title="Технические неполадки"
      description="Произошла внутренняя ошибка сервера. Мы уже работаем над устранением данной проблемы. Скоро вернемся к вам."
      showButton={true}
      showImage={true}
      imageSrc="/static/ErrorState_ServerIssue.webp"
      imageAlt="Server Issue"
      glowColor="bg-red-900/20"
    />
  );
}

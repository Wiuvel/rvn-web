'use client';

import ErrorState from '@/components/ui/ErrorState';

export default function NotFound() {
  return (
    <ErrorState
      code="404"
      title="Контент не найден"
      description={
        <>
          Запрашиваемая страница не существует или была перемещена.{' '}
          <span className="hidden md:inline">Держите собаку, не расстраивайтесь.</span>
        </>
      }
      showButton={true}
      showImage={true}
      imageSrc="/static/ErrorState_NotFound.webp"
      imageAlt="Lost Poodle"
    />
  );
}

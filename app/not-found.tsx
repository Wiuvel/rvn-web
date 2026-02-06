'use client';

import ErrorState from '@/components/ui/ErrorState';

export default function NotFound() {
  return (
    <ErrorState 
      code="404"
      title="Контент не найден"
      description="Запрашиваемая страница не существует или была перемещена. Держите собаку, не расстраивайтесь."
      showButton={true}
      showImage={true}
      imageSrc="/static/ErrorState_NotFound.png"
      imageAlt="Lost Poodle"
    />
  );
}

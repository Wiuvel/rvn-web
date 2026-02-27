'use client';

import React from 'react';
import ErrorState from '@/components/ui/ErrorState';

interface MaintenancePageProps {
  message?: string;
}

export default function MaintenancePage({ message }: MaintenancePageProps) {
  return (
    <ErrorState
      code="503"
      title="Технические работы"
      description={
        message || (
          <>
            Мы проводим плановое обновление системы, чтобы сделать её лучше для вас.{' '}
            <span className="hidden md:inline">Пожалуйста, зайдите позже.</span>
          </>
        )
      }
      showButton={false}
      showImage={true}
      imageSrc="/static/ErrorState_Maintenance.webp"
      imageAlt="Maintenance"
      glowColor="bg-blue-900/20"
    />
  );
}

'use client';

import { useEffect } from 'react';
import { initCdnCheck } from '@/lib/utils/cdn-check';

/**
 * Компонент для инициализации проверки CDN при загрузке приложения
 * Добавляется в root layout
 */
export default function CdnInit() {
  useEffect(() => {
    initCdnCheck();
  }, []);

  return null;
}

'use client';

import { useState, useEffect } from 'react';
import { getCdnAvailability } from '@/lib/utils/cdn-check';
import { domains } from '@/lib/utils/config';

/**
 * React hook для использования CDN с автоматическим fallback
 * @param path - Путь к статическому файлу
 * @returns URL с CDN или fallback на основной домен
 */
export function useCdnFallback(path: string): string {
  const [useFallback, setUseFallback] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // В dev режиме не проверяем
    if (process.env.NODE_ENV !== 'production') {
      setIsChecking(false);
      return;
    }

    // Проверяем доступность CDN
    getCdnAvailability()
      .then((available) => {
        setUseFallback(!available);
        setIsChecking(false);
      })
      .catch(() => {
        // В случае ошибки используем fallback
        setUseFallback(true);
        setIsChecking(false);
      });
  }, []);

  // Пока проверяем, используем CDN (оптимистичный подход)
  if (isChecking) {
    const cleanCdnUrl = domains.cdnUrl.endsWith('/') ? domains.cdnUrl.slice(0, -1) : domains.cdnUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanCdnUrl}${cleanPath}`;
  }

  // После проверки используем CDN или fallback
  const baseUrl = useFallback 
    ? (domains.mainUrl.endsWith('/') ? domains.mainUrl.slice(0, -1) : domains.mainUrl)
    : (domains.cdnUrl.endsWith('/') ? domains.cdnUrl.slice(0, -1) : domains.cdnUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

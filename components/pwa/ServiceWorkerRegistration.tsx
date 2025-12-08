'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      // Регистрация Service Worker
      navigator.serviceWorker
        .register('/sw.js', {
          scope: '/',
        })
        .then((registration) => {
          console.log('[SW] Service Worker registered:', registration);

          // Проверка обновлений каждые 60 секунд
          setInterval(() => {
            registration.update();
          }, 60000);

          // Обработка обновления Service Worker
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Новый SW установлен, можно предложить обновление
                  console.log('[SW] New Service Worker available');
                  // Можно показать уведомление пользователю о доступном обновлении
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('[SW] Service Worker registration failed:', error);
        });

      // Обработка контроллера (когда SW берет контроль)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Service Worker controller changed');
        // Можно перезагрузить страницу для применения нового SW
        // window.location.reload();
      });
    }
  }, []);

  return null; // Компонент не рендерит ничего
}



import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Raven Private - безопасный доступ в сеть',
    short_name: 'Raven Private',
    description: 'RVN.MARKET - современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность.',
    start_url: '/',
    display: 'standalone',
    scope: '/',
    background_color: '#0a0a0a',
    theme_color: '#0f7fdb',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['utilities', 'productivity'],
    lang: 'ru',
    dir: 'ltr',
  };
}


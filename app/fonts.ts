import localFont from 'next/font/local';

// Exo2; next/font.
export const exo2 = localFont({
  src: [
    {
      path: '../public/fonts/7cHmv4okm5zmbtYoK-4.woff2',
      weight: '100 900',
      style: 'normal',
    },
    {
      path: '../public/fonts/7cHmv4okm5zmbtYsK-4E4Q.woff2',
      weight: '100 900',
      style: 'normal',
    },
  ],
  variable: '--font-exo2',
  display: 'swap',
  preload: true,
  fallback: [
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
  adjustFontFallback: false,
});

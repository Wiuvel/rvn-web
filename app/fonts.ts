import localFont from 'next/font/local';

/**
 * Exo2 font configuration.
 */
export const exo2 = localFont({
  src: '../public/fonts/7cHmv4okm5zmbtYsK-4E4Q.woff2',
  variable: '--font-exo2',
  weight: '100 900',
  style: 'normal',
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

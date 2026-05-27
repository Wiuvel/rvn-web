import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // Tests import from `next/*` but the `next` package is no longer installed —
      // vinext ships shims for the public surface under `vinext/shims/*` (an
      // officially exported subpath). The vinext Vite plugin handles this in the
      // app itself; in tests we use only @vitejs/plugin-react, so we need to wire
      // the redirect explicitly.
      'next/server': 'vinext/shims/server',
      'next/headers': 'vinext/shims/headers',
      'next/cache': 'vinext/shims/cache',
      'next/navigation': 'vinext/shims/navigation',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
  },
});

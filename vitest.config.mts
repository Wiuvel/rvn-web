import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    // Запуск по типу: npx vitest run __tests__/unit | __tests__/integration | __tests__/e2e
  },
});

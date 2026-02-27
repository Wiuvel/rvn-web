import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import withCodSpeed from '@codspeed/vitest-plugin';
import path from 'path';

export default defineConfig({
  plugins: [react(), withCodSpeed()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});

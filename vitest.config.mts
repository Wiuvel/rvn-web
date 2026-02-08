import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import withCodSpeed from '@codspeed/vitest-plugin';

export default defineConfig({
  plugins: [
    react(),
    withCodSpeed(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});

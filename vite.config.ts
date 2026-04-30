import { defineConfig } from 'vite';
import vinext from 'vinext';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [vinext(), wasm()],
  ssr: {
    external: ['maxmind', 'ioredis', '@node-rs/argon2'],
  },
});

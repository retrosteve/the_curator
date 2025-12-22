import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // Keep Phaser in its own chunk so the app entry bundle stays smaller.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// frontendDist 切换前仅作并存开发，不接入 tauri build
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1421,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'safari15',
  },
});

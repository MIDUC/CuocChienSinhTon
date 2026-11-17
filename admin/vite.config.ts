import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Trang admin chạy ở /admin/. Khi dev, mọi request /api và /assets chuyển sang server NestJS (cổng 3000).
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/assets': 'http://localhost:3000',
    },
  },
});

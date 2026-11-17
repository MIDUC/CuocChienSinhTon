import { defineConfig } from 'vite';
import { resolve } from 'path';

// Game chạy ở /game/. Khi dev, /api và /assets chuyển sang server NestJS (cổng 3000) để lấy dữ liệu + ảnh từ admin.
// Không bật server thì game tự dùng file JSON trong data/ (đóng gói sẵn).
export default defineConfig({
  base: './',
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
      '/assets': 'http://localhost:3000',
    },
    fs: { allow: [resolve(__dirname, '..')] },
  },
});

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Прокси: браузер обращается только к Vite (localhost:5174), а Vite пересылает эти пути на Django.
// Адрес Django задаёт VITE_BACKEND_URL из .env. Для браузера это один адрес, поэтому не нужны настройки CORS.
// changeOrigin: false сохраняет заголовок Host, и Django строит ссылки на GLB с адресом Vite:
// файлы моделей тоже идут через прокси.
function backendProxy(backendUrl: string) {
  const target = backendUrl.replace(/\/+$/, '');
  return {
    '/api': { target, changeOrigin: false },
    '/admin': { target, changeOrigin: false },
    '/media': { target, changeOrigin: false },
    '/static': { target, changeOrigin: false },
    '/ws': { target: target.replace(/^http/, 'ws'), ws: true, changeOrigin: false },
  };
}

// `npm run build` — обычная сборка в dist/ (несколько файлов).
// `npm run build:single` — один самодостаточный HTML в dist-single/ (для публикации/отправки).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const proxy = backendProxy(env.VITE_BACKEND_URL || 'http://127.0.0.1:8000');
  return {
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  server: { host: true, port: 5174, strictPort: true, proxy },
  preview: { host: true, port: 4174, strictPort: true, proxy },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// `npm run dev` в браузере: запросы идут на тот же адрес и проксируются на Django,
// поэтому CORS не нужен. В APK адрес сервера задаётся на экране «Настройки»,
// в PWA по умолчанию берётся VITE_API_URL из сборки.


// Файлы из public/, нужные для запуска без сети (манифест и иконки установки).
const PUBLIC_SHELL = ['/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];

// Собирает dist/sw.js из src/pwa/sw.js: список файлов приложения и версия, зависящая от их содержимого.
// Новая сборка → новая версия → телефон получает обновление при следующем открытии со связью.
function serviceWorker() {
  return {
    name: 'obhod-service-worker',
    apply: 'build',
    enforce: 'post', // после плагина HTML: index.html уже в списке файлов сборки
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const name of files) {
        const item = bundle[name];
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
      }
      const precache = [...files.map((name) => `/${name}`), ...PUBLIC_SHELL];
      const source = readFileSync(new URL('./src/pwa/sw.js', import.meta.url), 'utf8')
        .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))};`)
        .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(precache)};`);
      if (source.includes('__VERSION__') || source.includes('__PRECACHE__')) this.error('sw.js: шаблон не заполнен');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const backend = { target: env.VITE_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: false };
  return {
  plugins: [serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    proxy: { '/api': backend, '/health': backend, '/media': backend },
  },
  build: { target: 'es2020' },
  test: { environment: 'node' },
  };
});

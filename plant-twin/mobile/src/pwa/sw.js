/* Service worker «Обхода» (PWA): оболочка приложения открывается без сети.
   Шаблон: версию и список файлов подставляет плагин сборки (vite.config.js).
   Данные (маршрут, история станков) приложение само хранит в localStorage, осмотры — в IndexedDB,
   поэтому здесь кэшируются только файлы интерфейса. Обычный скрипт, не модуль: так SW работает и в Safari. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `obhod-shell-${VERSION}`;
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('obhod-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

// Открытие приложения: свежий index.html из сети (так приходят обновления), без сети или при слабом
// сигнале дольше NETWORK_TIMEOUT — сохранённый.
async function openShell(event) {
  const cache = await caches.open(SHELL);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok) await cache.put('/index.html', response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  const cached = await cache.match('/index.html');
  try {
    return await (cached ? withTimeout(network, NETWORK_TIMEOUT) : network);
  } catch {
    return cached || Response.error();
  }
}

async function cacheFirst(request, key) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(key, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // запросы к backend и фото из bucket — только сеть
  if (request.mode === 'navigate') event.respondWith(openShell(event));
  else if (PRECACHE.includes(url.pathname)) event.respondWith(cacheFirst(request, url.pathname));
});

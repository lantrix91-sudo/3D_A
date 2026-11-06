// Адрес backend хранится на телефоне (экран «Настройки»). Интерфейс лежит внутри APK или на отдельном
// домене (PWA), поэтому относительные /api/... не годятся: каждый запрос идёт на полный адрес сервера.
export const SERVER_KEY = 'obhod:server';
export const DEFAULT_SERVER = 'http://192.168.3.103:8000';
// Адрес, заданный при сборке (VITE_API_URL, например https://backend.up.railway.app), — подставляется по умолчанию.
export const BUILD_SERVER = normalizeServer(import.meta.env?.VITE_API_URL);

const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

// В `npm run dev` (браузер на компьютере) запросы идут через прокси Vite на тот же адрес.
const devDefault = () => (import.meta.env?.DEV ? globalThis.location?.origin : null);

// «192.168.3.103:8000» → «http://192.168.3.103:8000»; лишний «/» в конце убираем. null — адрес неверный.
export function normalizeServer(value) {
  let text = String(value || '').trim();
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  try {
    const url = new URL(text);
    if (!url.hostname || url.search || url.hash) return null;
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function defaultServer() {
  return devDefault() || BUILD_SERVER || DEFAULT_SERVER;
}

export function getServer(storage = browserStorage()) {
  try { return storage?.getItem(SERVER_KEY) || defaultServer(); } catch { return defaultServer(); }
}

export function hasSavedServer(storage = browserStorage()) {
  try { return Boolean(storage?.getItem(SERVER_KEY)); } catch { return false; }
}

export function saveServer(value, storage = browserStorage()) {
  const server = normalizeServer(value);
  if (!server) throw new Error('Неверный адрес. Пример: http://192.168.3.103:8000');
  try { storage?.setItem(SERVER_KEY, server); } catch { /* хранилище недоступно — адрес действует до перезапуска */ }
  return server;
}

// «Проверить связь»: GET /health/ c таймаутом. Возвращает понятный текст для инженера в цеху.
export async function checkServer(value, { fetcher = (...args) => fetch(...args), timeout = 5000, pageProtocol = globalThis.location?.protocol } = {}) {
  const server = normalizeServer(value);
  if (!server) return { ok: false, message: 'Неверный адрес. Пример: http://192.168.3.103:8000' };
  // Страница по https (PWA) не может обращаться к http-адресу: браузер блокирует такой запрос (mixed content).
  if (pageProtocol === 'https:' && server.startsWith('http:')) {
    return { ok: false, server, message: 'Приложение открыто по https, поэтому сервер тоже нужен по https:// (адрес в локальной сети по http не подойдёт).' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(`${server}/health/`, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.status === 'ok') return { ok: true, server, message: `Связь есть: ${server}` };
    return { ok: false, server, message: `Сервер ответил, но это не Plant Twin (код ${response.status}).` };
  } catch (error) {
    const reason = error.name === 'AbortError' ? `не ответил за ${timeout / 1000} с` : 'недоступен';
    const advice = server.startsWith('https:')
      ? 'Проверьте интернет на телефоне и адрес сервера.'
      : 'Проверьте: телефон в той же Wi‑Fi сети, Django запущен на 0.0.0.0:8000, порт открыт в брандмауэре.';
    return { ok: false, server, message: `Сервер ${reason}. ${advice}` };
  } finally {
    clearTimeout(timer);
  }
}

// Установка на «Домой» (PWA): регистрация service worker. В APK не нужен — интерфейс уже внутри приложения.
// SW работает только в защищённом контексте: HTTPS или localhost. По http://192.168… браузер его не включит.
export function pwaSupported(env = import.meta.env, scope = globalThis, native = false) {
  return Boolean(env.PROD && !native && scope.isSecureContext && scope.navigator?.serviceWorker);
}

export function registerServiceWorker(native) {
  if (!pwaSupported(import.meta.env, globalThis, native)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* без SW приложение работает как обычный сайт */ });
  });
  // Просим не стирать хранилище при нехватке места: там неотправленные осмотры и фото.
  navigator.storage?.persist?.().catch(() => {});
}

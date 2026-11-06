/**
 * Адреса бэкенда. Логика та же, что в старом frontend/src/api/config.js.
 *
 * В режиме разработки (npm run dev) адреса всегда относительные: браузер обращается к Vite,
 * а Vite пересылает /api, /media и /ws на Django (см. server.proxy в vite.config.ts).
 * При сборке (npm run build) подставляются значения из .env.
 */
export const API_URL: string = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const WS_URL: string = import.meta.env.DEV
  ? '/ws/'
  : (import.meta.env.VITE_WS_URL || API_URL.replace(/^http/, 'ws')).replace(/\/$/, '') || '/ws/';

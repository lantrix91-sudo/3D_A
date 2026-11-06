import { expect, it } from 'vitest';
import { pwaSupported } from './register.js';

const scope = (secure, sw = {}) => ({ isSecureContext: secure, navigator: sw ? { serviceWorker: sw } : {} });

it('registers the service worker only for the web build over HTTPS or localhost, not inside the APK', () => {
  expect(pwaSupported({ PROD: true }, scope(true))).toBe(true);
  expect(pwaSupported({ PROD: true }, scope(true), true)).toBe(false);  // APK (Capacitor)
  expect(pwaSupported({ PROD: false }, scope(true))).toBe(false);       // vite dev
  expect(pwaSupported({ PROD: true }, scope(false))).toBe(false);       // http://192.168…
  expect(pwaSupported({ PROD: true }, scope(true, null))).toBe(false);  // старый браузер
});

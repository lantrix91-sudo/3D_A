// Все HTTP-запросы приложения «Обход». Перенесено из frontend/src/api/client.js:
// та же логика JWT (refresh-токен на телефоне, повтор после 401, сеанс не рвётся без сети),
// но адрес backend задаётся на экране «Настройки», поэтому url — функция, а не константа.
import { getServer } from './server.js';

export const REFRESH_KEY = 'plant-twin.refresh';
const browserStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createApiClient(url = getServer, fetcher = (...args) => fetch(...args), storage = browserStorage()) {
  let access = null;
  let refreshToken = null;
  let refreshing = null;
  let session = 0;
  const base = () => (typeof url === 'function' ? url() : url);
  const accessListeners = new Set();
  const expiredListeners = new Set();
  function persist(value) {
    try { if (value) storage?.setItem(REFRESH_KEY, value); else storage?.removeItem(REFRESH_KEY); } catch { /* Storage may be disabled; the current session still works. */ }
  }
  function expire() { logout(); expiredListeners.forEach((fn) => fn()); }
  const subscribe = (listeners, fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  function logout() {
    session += 1;
    access = null;
    refreshToken = null;
    refreshing = null;
    persist(null);
  }

  async function request(path, { method = 'GET', body, token } = {}) {
    let response;
    // FormData (фото) отправляется как multipart: границу заголовка ставит браузер.
    const form = typeof FormData !== 'undefined' && body instanceof FormData;
    try {
      response = await fetcher(`${base()}${path}`, {
        method,
        headers: {
          ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError('Нет связи с сервером. Проверьте Wi‑Fi и адрес в настройках.', 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(data?.error?.message || `Ошибка сервера (${response.status})`, response.status);
    }
    return data;
  }

  async function login(username, password) {
    logout();
    const current = session;
    const data = await request('/api/v1/auth/login/', { method: 'POST', body: { username, password } });
    if (current !== session) throw new ApiError('Вход отменён.', 401);
    access = data.access;
    refreshToken = data.refresh;
    persist(refreshToken);
  }

  async function refresh() {
    if (refreshing) return refreshing;
    if (!refreshToken) { expire(); throw new ApiError('Войдите в систему.', 401); }
    const current = session;
    const pending = request('/api/v1/auth/refresh/', { method: 'POST', body: { refresh: refreshToken } })
      .then((data) => {
        if (current !== session) throw new ApiError('Сеанс завершён.', 401);
        access = data.access;
        if (data.refresh) refreshToken = data.refresh;
        persist(refreshToken);
        accessListeners.forEach((fn) => fn());
      })
      .catch((error) => {
        // Сеанс завершаем, только если сервер отклонил refresh-токен. Нет сети или 5xx —
        // токен сохраняем: инженер на обходе не должен вылетать на вход из-за слабого Wi‑Fi.
        if (current === session && (error.status === 400 || error.status === 401)) expire();
        throw error;
      })
      .finally(() => { if (refreshing === pending) refreshing = null; });
    refreshing = pending;
    return pending;
  }

  async function restoreSession() {
    try { refreshToken = storage?.getItem(REFRESH_KEY) || null; } catch { refreshToken = null; }
    if (!refreshToken) return false;
    try {
      await refresh();
      return true;
    } catch (error) {
      // Нет сети, а вход уже был: открываемся из кэша, токен обновится при появлении связи.
      return error.status === 0 && refreshToken ? 'offline' : false;
    }
  }

  async function authenticated(path, options = {}) {
    const current = session;
    const usedAccess = access;
    try {
      return await request(path, { ...options, token: usedAccess });
    } catch (error) {
      if (error.status !== 401 || current !== session) throw error;
      // Несколько одновременных 401 используют одно обновление токена.
      if (usedAccess === access) {
        try {
          await refresh();
        } catch (refreshError) {
          // Ошибка обновления — проблема сеанса, а не данных запроса: снаружи это 401 (или 0 без сети).
          throw refreshError.status === 0 ? refreshError : new ApiError(refreshError.message, 401);
        }
      }
      if (current !== session) throw new ApiError('Сеанс завершён.', 401);
      try {
        return await request(path, { ...options, token: access });
      } catch (retryError) {
        if (retryError.status === 401 && current === session) expire();
        throw retryError;
      }
    }
  }

  const equipmentPath = (code, tail) => `/api/v1/equipment/${encodeURIComponent(code)}/${tail}`;
  const getCard = (code) => authenticated(equipmentPath(code, 'card/'));
  const getConditions = (code, limit = 30) => authenticated(equipmentPath(code, `conditions/?limit=${limit}`));
  const getRoundToday = (routeId = null) => authenticated(`/api/v1/rounds/today/${routeId ? `?route=${routeId}` : ''}`);
  const getRoutes = () => authenticated('/api/v1/rounds/routes/');
  const getInspections = (code, limit = 20) => authenticated(`/api/v1/rounds/inspections/?equipment=${encodeURIComponent(code)}&limit=${limit}`);
  const postInspection = (form) => authenticated('/api/v1/rounds/inspections/', { method: 'POST', body: form });
  // Фото станка (заменяет снимок 3D-модели): multipart image + source=photo. Права — engineer и admin.
  const setImage = (code, form) => authenticated(equipmentPath(code, 'image/'), { method: 'POST', body: form });
  const token = () => access;
  return { login, refresh, restoreSession, getCard, getConditions, getRoundToday, getRoutes, getInspections, postInspection, setImage, logout, token,
    onAccessChanged: (fn) => subscribe(accessListeners, fn),
    onSessionExpired: (fn) => subscribe(expiredListeners, fn),
  };
}

export const api = createApiClient();

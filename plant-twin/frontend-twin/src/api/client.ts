import { API_URL } from './config';
import type { EquipmentWrite, PlanAsset, PlanEquipment, PlanResponse, PlanWallsResponse, Profile, ReadingsResponse, WallsData } from './types';

/**
 * Все HTTP-запросы к бэкенду. Перенесено из старого frontend/src/api/client.js.
 *
 * Как устроена авторизация:
 *  - access-токен живёт только в памяти (переменная ниже) и отправляется в заголовке Authorization;
 *  - refresh-токен лежит в localStorage: после перезагрузки страницы по нему получаем новый access;
 *  - если запрос вернул 401, клиент один раз обновляет токен и повторяет запрос сам;
 *  - в settings.py включён ROTATE_REFRESH_TOKENS, поэтому при обновлении сервер присылает и новый
 *    refresh, а старый отзывает. Новый обязательно сохраняем, иначе следующий вход не сработает.
 */

const REFRESH_KEY = 'bakery-twin.refresh';

/** Ошибка API. status = 0 — сервер вообще не ответил */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = { method?: string; body?: unknown };

let access: string | null = null;
let refreshToken: string | null = null;
let refreshing: Promise<void> | null = null;
const expiredListeners = new Set<() => void>();

function saveRefresh(value: string | null) {
  try {
    if (value) localStorage.setItem(REFRESH_KEY, value);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* localStorage запрещён: сеанс работает до перезагрузки страницы */
  }
}

async function request<T>(path: string, { method = 'GET', body }: RequestOptions, token: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Не удалось связаться с сервером. Проверьте, что бэкенд запущен.', 0);
  }
  // У DELETE ответ 204 без тела, а при падении прокси тело не JSON — в обоих случаях data = null
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Единый формат ошибок API: {"error": {"code": "...", "message": "..."}}
    const message = data?.error?.message
      ?? (response.status >= 500 ? `Сервер недоступен или вернул ошибку (${response.status}). Проверьте, что бэкенд запущен.` : `Ошибка сервера (${response.status})`);
    throw new ApiError(message, response.status);
  }
  return data as T;
}

async function refresh(): Promise<void> {
  if (refreshing) return refreshing; // несколько одновременных 401 используют одно обновление
  if (!refreshToken) throw new ApiError('Войдите в систему.', 401);
  const pending = request<{ access: string; refresh?: string }>('/api/v1/auth/refresh/', { method: 'POST', body: { refresh: refreshToken } }, null)
    .then((data) => {
      access = data.access;
      if (data.refresh) {
        refreshToken = data.refresh;
        saveRefresh(refreshToken);
      }
    })
    .catch((error: ApiError) => {
      // Сеанс завершаем, только если сервер отклонил токен. Нет сети или 5xx — токен ещё пригодится.
      if (error.status === 400 || error.status === 401) {
        logout();
        expiredListeners.forEach((fn) => fn());
      }
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  refreshing = pending;
  return pending;
}

/** Запрос от имени пользователя: при 401 обновляем токен и повторяем один раз */
async function authenticated<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await request<T>(path, options, access);
  } catch (error) {
    if ((error as ApiError).status !== 401) throw error;
    await refresh();
    return request<T>(path, options, access);
  }
}

export async function login(username: string, password: string): Promise<void> {
  const data = await request<{ access: string; refresh: string }>('/api/v1/auth/login/', { method: 'POST', body: { username, password } }, null);
  access = data.access;
  refreshToken = data.refresh;
  saveRefresh(refreshToken);
}

export function logout() {
  access = null;
  refreshToken = null;
  saveRefresh(null);
}

/**
 * Восстановить вход после перезагрузки страницы.
 * active — вход действует, none — нужен экран входа, offline — токен есть, но сервер сейчас недоступен.
 */
export async function restoreSession(): Promise<'active' | 'none' | 'offline'> {
  try {
    refreshToken = localStorage.getItem(REFRESH_KEY);
  } catch {
    refreshToken = null;
  }
  if (!refreshToken) return 'none';
  try {
    await refresh();
    return 'active';
  } catch (error) {
    // 400 и 401 — сервер отклонил токен; всё остальное — он просто не ответил, токен ещё пригодится
    const { status } = error as ApiError;
    return status === 400 || status === 401 ? 'none' : 'offline';
  }
}

/** Подписка на «сеанс истёк»: refresh-токен больше не принимается */
export function onSessionExpired(fn: () => void) {
  expiredListeners.add(fn);
}

const equipmentPath = (code: string) => `/api/v1/equipment/${encodeURIComponent(code)}/`;

export const api = {
  /** Текущий access-токен: WebSocket передаёт его в адресе, заголовки браузерный WebSocket не умеет */
  token: () => access,
  refresh,
  getMe: () => authenticated<Profile>('/api/v1/auth/me/'),
  getPlan: () => authenticated<PlanResponse>('/api/v1/plan/'),
  getEquipment: () => authenticated<PlanEquipment[]>('/api/v1/equipment/'),
  getAssets: () => authenticated<PlanAsset[]>('/api/v1/assets/'),
  getReadings: (code: string, hours: number) => authenticated<ReadingsResponse>(`${equipmentPath(code)}readings/?hours=${hours}`),
  // Запись: сервер разрешает её только роли admin и суперпользователю, иначе вернёт 403
  createEquipment: (body: EquipmentWrite) => authenticated<PlanEquipment>('/api/v1/equipment/', { method: 'POST', body }),
  patchEquipment: (code: string, body: EquipmentWrite) => authenticated<PlanEquipment>(equipmentPath(code), { method: 'PATCH', body }),
  deleteEquipment: (code: string) => authenticated<null>(equipmentPath(code), { method: 'DELETE' }),
  // Стены зоны. PUT с устаревшей base_version сервер отклонит с кодом 409
  getWalls: (zoneId: number) => authenticated<PlanWallsResponse>(`/api/v1/plan-walls/?zone=${zoneId}`),
  putWalls: (zoneId: number, baseVersion: number, data: WallsData) =>
    authenticated<PlanWallsResponse>(`/api/v1/plan-walls/?zone=${zoneId}`, { method: 'PUT', body: { base_version: baseVersion, data } }),
};

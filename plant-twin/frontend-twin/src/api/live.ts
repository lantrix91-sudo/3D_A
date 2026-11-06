import { WS_URL } from './config';
import type { LiveEntry } from './types';

/**
 * Живой статус: WebSocket /ws/v1/live/?token=<JWT> с автопереподключением.
 * Перенесено из старого frontend/src/api/live.js.
 *
 * Сервер шлёт {type: 'snapshot', equipment: [...]} сразу после подключения (всё текущее состояние),
 * а затем {type: 'update', equipment: 'код', status, values, ...} на каждое изменение.
 *
 * Коды закрытия соединения (см. backend/equipment/consumers.py):
 *   4401 — токен неверен или истёк: обновляем токен и подключаемся снова;
 *   4403 — у пользователя нет роли: повторять бесполезно.
 */

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const MAX_DELAY_MS = 30000;
const PING_MS = 25000;

export type LiveConnection = 'connecting' | 'online' | 'offline' | 'forbidden';

export function liveSocketUrl(base: string = WS_URL): string {
  let root = base || '/ws/';
  if (root.startsWith('/')) root = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${root}`;
  root = root.replace(/\/+$/, '');
  // VITE_WS_URL может быть задан как origin бэкенда без /ws
  if (!root.endsWith('/ws')) root += '/ws';
  return `${root}/v1/live/`;
}

export interface LiveHandlers {
  getToken: () => string | null;
  refreshToken: () => Promise<void>;
  onSnapshot: (items: LiveEntry[]) => void;
  onUpdate: (item: LiveEntry) => void;
  onConnection: (state: LiveConnection) => void;
}

export function connectLive({ getToken, refreshToken, onSnapshot, onUpdate, onConnection }: LiveHandlers) {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: number | null = null;
  let pinger: number | null = null;
  let lastMessage = 0;
  let stopped = false;

  // Переподключение с растущей задержкой: 1, 2, 4 … 30 секунд
  function schedule() {
    if (stopped) return;
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt);
    attempt += 1;
    onConnection('offline');
    timer = window.setTimeout(open, delay);
  }

  async function renew() {
    try {
      await refreshToken();
      attempt = 0;
    } catch (error) {
      // Отказ в обновлении обрабатывает client.ts (сеанс завершается), здесь повторять нечего
      if ((error as { status?: number }).status === 400 || (error as { status?: number }).status === 401) return;
    }
    schedule();
  }

  function open() {
    timer = null;
    if (stopped) return;
    const token = getToken();
    if (!token) {
      void renew();
      return;
    }
    onConnection(attempt > 0 ? 'offline' : 'connecting');
    const current = new WebSocket(`${liveSocketUrl()}?token=${encodeURIComponent(token)}`);
    socket = current;
    current.onopen = () => {
      if (stopped) return;
      attempt = 0;
      lastMessage = Date.now();
      onConnection('online');
      // Пинг держит соединение через прокси и замечает «тихий» обрыв сети
      pinger = window.setInterval(() => {
        if (Date.now() - lastMessage > PING_MS * 2.5) current.close();
        else if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: 'ping' }));
      }, PING_MS);
    };
    current.onmessage = (event) => {
      if (stopped) return;
      lastMessage = Date.now();
      let data: { type?: string; equipment?: unknown };
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (data.type === 'snapshot') onSnapshot(data.equipment as LiveEntry[]);
      else if (data.type === 'update') onUpdate(data as unknown as LiveEntry);
      // pong и остальные типы событий (осмотры и т. п.) двойнику пока не нужны
    };
    current.onclose = (event) => {
      if (pinger !== null) window.clearInterval(pinger);
      pinger = null;
      if (socket === current) socket = null;
      if (stopped) return;
      if (event.code === CLOSE_FORBIDDEN) {
        onConnection('forbidden');
        return;
      }
      if (event.code === CLOSE_UNAUTHORIZED) {
        void renew();
        return;
      }
      schedule();
    };
  }

  open();
  return {
    close() {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      if (pinger !== null) window.clearInterval(pinger);
      socket?.close(1000);
      socket = null;
    },
  };
}

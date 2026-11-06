import type { PlanWallsResponse, WallsData } from '../api/types';

/**
 * Синхронизация стен с сервером. Здесь только логика очереди и версий, без React и настоящей сети:
 * запросы, кэш и применение на экран передаются снаружи (см. serverWalls.ts), поэтому логика проверяется тестами.
 *
 * Главное правило: источник истины — сервер, а браузер хранит только копию и черновик.
 *
 *   правка → сразу пишем черновик в IndexedDB → через ~1 с PUT с base_version → новая версия, черновик удалён
 *
 * Что бывает с запросом:
 *   409 — стены изменил кто-то другой. Ничего не перезаписываем сами, решает пользователь: keepMine или useServer;
 *   нет связи или 5xx — черновик остаётся, повторяем каждые retryMs;
 *   400 или 403 — повторять бессмысленно, показываем ошибку, черновик остаётся до следующей правки.
 */

export type WallsSyncStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';

export interface WallsSyncState {
  status: WallsSyncStatus;
  /** false — версия на сервере неизвестна (нет связи и кэша): редактировать нельзя */
  loaded: boolean;
  version: number | null;
  updatedBy: string | null;
  updatedAt: number | null;
  message: string | null;
}

export interface WallsDraft {
  baseVersion: number;
  data: WallsData;
  user: string;
}

export interface WallsCacheRecord {
  server: { version: number; data: WallsData | null } | null;
  draft: WallsDraft | null;
}

export interface WallsSyncDeps {
  get(zoneId: number): Promise<PlanWallsResponse>;
  put(zoneId: number, baseVersion: number, data: WallsData): Promise<PlanWallsResponse>;
  cache: {
    load(zoneId: number): Promise<WallsCacheRecord | null>;
    saveServer(zoneId: number, version: number, data: WallsData | null): Promise<void>;
    saveDraft(zoneId: number, draft: WallsDraft): Promise<void>;
    clearDraft(zoneId: number): Promise<void>;
  };
  /** Показать данные на сцене. null — стены проекта. Вызов не считается правкой */
  apply(data: WallsData | null): void;
  publish(state: WallsSyncState): void;
  debounceMs?: number;
  retryMs?: number;
}

/** Статус 0 — сервер не ответил; 5xx — сервер временно недоступен */
const isTemporary = (e: unknown) => {
  const status = (e as { status?: number }).status ?? 0;
  return status === 0 || status >= 500;
};
const messageOf = (e: unknown) => (e as Error).message ?? String(e);

export function createWallsSync(deps: WallsSyncDeps) {
  const debounceMs = deps.debounceMs ?? 1000;
  const retryMs = deps.retryMs ?? 5000;
  let zoneId = 0;
  let user = '';
  let canWrite = false;
  /** Версия сервера, от которой отталкивается текущая правка */
  let version: number | null = null;
  /** Несохранённые данные. null — всё сохранено */
  let current: WallsData | null = null;
  let saving = false;
  let conflict = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: WallsSyncState = { status: 'idle', loaded: false, version: null, updatedBy: null, updatedAt: null, message: null };

  const set = (patch: Partial<WallsSyncState>) => {
    state = { ...state, version, ...patch };
    deps.publish(state);
  };
  const schedule = (fn: () => void, ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  const remember = (r: PlanWallsResponse) => {
    version = r.version;
    void deps.cache.saveServer(zoneId, r.version, r.data).catch(() => undefined);
    return { updatedBy: r.updated_by, updatedAt: r.updated_at };
  };
  const writeDraft = () => {
    if (current && version !== null) void deps.cache.saveDraft(zoneId, { baseVersion: version, data: current, user }).catch(() => undefined);
  };

  function enterConflict(message: string) {
    conflict = true;
    if (timer) clearTimeout(timer);
    timer = null;
    set({ status: 'conflict', loaded: true, message });
  }

  async function load() {
    let server: PlanWallsResponse;
    try {
      server = await deps.get(zoneId);
    } catch (e) {
      // Нет связи: работаем с кэшем, если он есть, и продолжаем пытаться
      if (isTemporary(e)) {
        set({ status: 'offline', loaded: version !== null, message: messageOf(e) });
        schedule(() => void load(), retryMs);
      } else {
        set({ status: 'error', loaded: version !== null, message: messageOf(e) });
      }
      return;
    }
    const base = version;
    const who = { updatedBy: server.updated_by, updatedAt: server.updated_at };
    if (current) {
      // Есть черновик: отправляем его, только если на сервере никто не менял стены с момента правки
      if (base === server.version) {
        set({ status: 'pending', loaded: true, message: 'Несохранённые правки восстановлены', ...who });
        schedule(() => void flush(), debounceMs);
      } else {
        // Версию не меняем: keepMine заново запросит актуальную, а useServer заменит данные
        void deps.cache.saveServer(zoneId, server.version, server.data).catch(() => undefined);
        enterConflict(`Пока вас не было, стены изменил ${server.updated_by ?? 'другой пользователь'}. Ваши правки не сохранены.`);
      }
      return;
    }
    remember(server);
    deps.apply(server.data);
    set({ status: 'idle', loaded: true, message: null, ...who });
  }

  async function flush() {
    if (saving || conflict || !current || version === null) return;
    saving = true;
    const sent = current;
    set({ status: 'saving', message: null });
    try {
      const saved = await deps.put(zoneId, version, sent);
      const who = remember(saved);
      if (current === sent) {
        current = null;
        void deps.cache.clearDraft(zoneId).catch(() => undefined);
        set({ status: 'saved', message: null, ...who });
      } else {
        // Пока шёл запрос, появились новые правки: они основаны уже на новой версии
        writeDraft();
        set({ status: 'pending', message: null, ...who });
        schedule(() => void flush(), debounceMs);
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 409) enterConflict(messageOf(e));
      else if (isTemporary(e)) {
        set({ status: 'offline', message: messageOf(e) });
        schedule(() => void flush(), retryMs);
      } else set({ status: 'error', message: messageOf(e) });
    } finally {
      saving = false;
    }
  }

  return {
    getState: () => state,

    /** Загрузка при входе: сначала кэш, чтобы экран не ждал сеть, затем сервер */
    async init(zone: number, username: string, writable: boolean) {
      zoneId = zone;
      user = username;
      canWrite = writable;
      const cached = await deps.cache.load(zone).catch(() => null);
      if (cached?.server) {
        version = cached.server.version;
        deps.apply(cached.server.data);
      }
      if (cached?.draft) {
        if (cached.draft.user === username && writable) {
          current = cached.draft.data;
          version = cached.draft.baseVersion;
          deps.apply(current);
        } else {
          // Чужой черновик на общем компьютере нельзя отправлять от имени текущего пользователя
          void deps.cache.clearDraft(zone).catch(() => undefined);
        }
      }
      await load();
    },

    /** Вызывается после каждой правки в редакторе */
    edited(data: WallsData) {
      if (!canWrite) return;
      current = data;
      writeDraft();
      if (conflict) return; // ждём решения пользователя
      set({ status: 'pending', message: null });
      schedule(() => void flush(), debounceMs);
    },

    /** Конфликт: оставить мой вариант и записать его поверх версии с сервера */
    async keepMine() {
      if (!current) return;
      try {
        const server = await deps.get(zoneId);
        version = server.version;
        conflict = false;
        writeDraft();
        await flush();
      } catch (e) {
        set({ message: messageOf(e) });
      }
    },

    /** Конфликт: отказаться от моих правок и показать версию с сервера */
    async useServer() {
      try {
        const server = await deps.get(zoneId);
        conflict = false;
        current = null;
        void deps.cache.clearDraft(zoneId).catch(() => undefined);
        const who = remember(server);
        deps.apply(server.data);
        set({ status: 'idle', loaded: true, message: null, ...who });
      } catch (e) {
        set({ message: messageOf(e) });
      }
    },
  };
}

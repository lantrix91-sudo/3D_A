import { openDB, type IDBPDatabase } from 'idb';
import type { WallsData } from '../api/types';
import type { WallsCacheRecord, WallsDraft } from '../services/wallsSync';

/**
 * Копия стен с сервера в браузере: кэш последней версии и несохранённый черновик.
 * Это НЕ основное хранилище: источник истины — сервер (GET/PUT /api/v1/plan-walls/).
 *
 * Отдельная база браузера только для кэша стен и черновика,
 * поэтому правки не теряются при обрыве связи.
 *
 * Если браузер запрещает IndexedDB, все операции просто ничего не делают: режим работает без кэша и черновика.
 */
const DB_NAME = 'bakery-twin-server';
const STORE = 'walls';

interface Row extends WallsCacheRecord {
  zoneId: number;
}

let opening: Promise<IDBPDatabase> | null = null;
function db() {
  opening ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'zoneId' });
    },
  });
  return opening;
}

async function update(zoneId: number, patch: Partial<WallsCacheRecord>) {
  const base = await db();
  const tx = base.transaction(STORE, 'readwrite');
  const row: Row = (await tx.store.get(zoneId)) ?? { zoneId, server: null, draft: null };
  await tx.store.put({ ...row, ...patch });
  await tx.done;
}

export const wallsCache = {
  async load(zoneId: number): Promise<WallsCacheRecord | null> {
    const row = (await (await db()).get(STORE, zoneId)) as Row | undefined;
    return row ? { server: row.server, draft: row.draft } : null;
  },
  saveServer: (zoneId: number, version: number, data: WallsData | null) => update(zoneId, { server: { version, data } }),
  saveDraft: (zoneId: number, draft: WallsDraft) => update(zoneId, { draft }),
  clearDraft: (zoneId: number) => update(zoneId, { draft: null }),
};

import { create } from 'zustand';
import { api } from '../api/client';
import { wallsCache } from '../storage/wallsCache';
import { toast } from '../store/appStore';
import { applyWallsData, setWallsPersistHook } from './walls';
import { createWallsSync, type WallsSyncState } from './wallsSync';

/**
 * Стены на сервере: соединяет логику синхронизации (wallsSync.ts) с настоящими запросами,
 * кэшем в браузере (storage/wallsCache.ts), редактором (walls.ts) и интерфейсом (useWallsSync).
 *
 * Путь правки: WallEditPanel или WallEditor → walls.ts (commit → persist) → sync.edited → PUT /api/v1/plan-walls/.
 */
export const useWallsSync = create<WallsSyncState>(() => ({
  status: 'idle',
  loaded: false,
  version: null,
  updatedBy: null,
  updatedAt: null,
  message: null,
}));

const sync = createWallsSync({
  get: (zoneId) => api.getWalls(zoneId),
  put: (zoneId, baseVersion, data) => api.putWalls(zoneId, baseVersion, data),
  cache: wallsCache,
  apply: applyWallsData,
  publish: (state) => {
    if (state.status === 'conflict' && useWallsSync.getState().status !== 'conflict') {
      toast('Стены изменил другой пользователь. Откройте редактор стен, чтобы выбрать вариант', 'error', 10000);
    }
    useWallsSync.setState(state);
  },
});

/** Вызывается один раз после загрузки плана */
export async function initServerWalls(zoneId: number, username: string, canWrite: boolean) {
  setWallsPersistHook((data) => sync.edited(data));
  await sync.init(zoneId, username, canWrite);
}

export const keepMineWalls = () => sync.keepMine();
export const takeServerWalls = () => sync.useServer();

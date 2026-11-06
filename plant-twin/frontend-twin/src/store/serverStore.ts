import { create } from 'zustand';
import type { PlanAsset, PlanZone } from '../api/types';
import type { LiveConnection } from '../api/live';

/**
 * Состояние подключения к серверу, которое читает интерфейс. Zustand — это глобальное хранилище:
 * компонент подписывается на нужное поле и перерисовывается, только когда это поле меняется.
 * Заполняет хранилище services/serverHub.ts.
 */
export interface ServerState {
  /** Состояние WebSocket: online — статусы актуальны, offline — могут быть устаревшими */
  connection: LiveConnection;
  username: string;
  roles: string[];
  /** Можно ли двигать, добавлять и удалять оборудование (поле can_edit_layout из /plan/) */
  canEdit: boolean;
  /** Можно ли менять стены и колонны (поле can_edit_walls из /plan/) */
  canEditWalls: boolean;
  /** Зоны без вложенного оборудования: геометрия здания и границы для расстановки */
  zones: Omit<PlanZone, 'equipment'>[];
  /** Коды типов оборудования, известные из плана. Отдельного списка типов в API нет */
  types: string[];
  /** Каталог GLB-моделей из /api/v1/assets/ — для выбора в форме */
  assets: PlanAsset[];
}

export const useServer = create<ServerState>(() => ({
  connection: 'connecting',
  username: '',
  roles: [],
  canEdit: false,
  canEditWalls: false,
  zones: [],
  types: [],
  assets: [],
}));

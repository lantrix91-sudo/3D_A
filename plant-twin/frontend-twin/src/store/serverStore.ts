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
  /** С какого момента нет связи (мс); null — связь есть. Индикатор показывает обрыв только после паузы */
  offlineSince: number | null;
  /** Была ли связь хоть раз за сеанс */
  everOnline: boolean;
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
  offlineSince: Date.now(),
  everOnline: false,
  username: '',
  roles: [],
  canEdit: false,
  canEditWalls: false,
  zones: [],
  types: [],
  assets: [],
}));

/** Сменить состояние сокета. Время обрыва запоминается при первом уходе из online и не сдвигается переподключениями */
export function setConnection(connection: LiveConnection) {
  useServer.setState((s) => connection === 'online'
    ? { connection, offlineSince: null, everOnline: true }
    : { connection, offlineSince: s.offlineSince ?? Date.now() });
}

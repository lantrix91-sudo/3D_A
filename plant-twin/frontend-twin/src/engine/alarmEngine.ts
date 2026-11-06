import { EQUIPMENT_BY_ID } from '../domain/config';
import type { AlarmLevel, CommState, DisplayState, EquipmentId, RunState } from '../domain/types';

/**
 * Живое состояние оборудования: эти структуры заполняет planMapper.computeLive по данным сервера,
 * а читают список, карточка и сцена.
 */

export type Direction = 'high' | 'low' | null;

export interface SensorLive {
  sensorId: string;
  /** Последнее исправное значение */
  lastValue: number | null;
  /** Время последнего исправного измерения */
  lastGoodTs: number | null;
  /** Время последнего полученного пакета по датчику (в т. ч. «нет данных») */
  lastSeenTs: number | null;
  /** Текущее качество: есть ли свежие данные */
  hasData: boolean;
  level: AlarmLevel;
  direction: Direction;
  pending: { level: AlarmLevel; direction: Direction; since: number } | null;
  /** Текстовое значение для сигналов state и bool */
  text?: string | null;
  /** Устройство пометило датчик неисправным */
  fault?: boolean;
}

export interface EquipmentLive {
  equipmentId: EquipmentId;
  runState: RunState | 'unknown';
  runSince: number | null;
  comm: CommState;
  commSince: number | null;
  level: AlarmLevel;
  lastGoodTs: number | null;
  /** Состояние уже посчитано на бэкенде, в браузере его не вычисляем */
  serverState?: DisplayState;
  /** Техническое состояние Equipment.condition */
  condition?: string;
}

export interface EngineSnapshot {
  sensors: Record<string, SensorLive>;
  equipment: Record<EquipmentId, EquipmentLive>;
}

/** Итоговое состояние для экрана. Его считает сервер; остальное — запас на случай, если статуса ещё нет */
export function deriveDisplayState(eq: EquipmentLive): DisplayState {
  if (eq.serverState) return eq.serverState;
  if (EQUIPMENT_BY_ID[eq.equipmentId]?.kind === 'generic') return 'no_sensors';
  if (eq.comm === 'lost' || eq.comm === 'unknown') return 'no_comm';
  if (eq.level === 'alarm') return 'alarm';
  if (eq.level === 'warning') return 'warning';
  if (eq.runState === 'stopped') return 'stopped';
  return 'running';
}

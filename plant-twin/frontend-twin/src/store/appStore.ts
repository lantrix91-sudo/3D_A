import { create } from 'zustand';
import type { EngineSnapshot } from '../engine/alarmEngine';
import type { AppEvent, Breakdown, EquipmentId, MaintenancePlan, MaintenanceRecord } from '../domain/types';
import type { AppSettings } from '../storage/settings';

/**
 * Состояние интерфейса. Заполняется сервисами (services/*), компоненты только читают его
 * и вызывают действия сервисов. Компоненты не генерируют показания.
 */

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error' | 'info';
}

export interface AppState {
  /** login — ждём ввода логина и пароля */
  phase: 'login' | 'loading' | 'ready' | 'error';
  error: string | null;
  live: EngineSnapshot | null;
  /** Увеличивается на каждый пакет телеметрии — сигнал для обновления графиков */
  dataVersion: number;
  settings: AppSettings | null;
  selected: EquipmentId | null;
  /** Счётчик запросов «вернуть общий вид» для 3D-сцены */
  resetViewNonce: number;
  /** Счётчик запросов «приблизить к выбранному» */
  focusNonce: number;
  /** Счётчик запросов «показать Цех-1» */
  shopViewNonce: number;
  /** Режим расстановки оборудования (перетаскивание на плане) */
  placeMode: boolean;
  events: AppEvent[];
  breakdowns: Breakdown[];
  plans: MaintenancePlan[];
  records: MaintenanceRecord[];
  toasts: Toast[];
}

export const useApp = create<AppState>(() => ({
  phase: 'loading',
  error: null,
  live: null,
  dataVersion: 0,
  settings: null,
  selected: null,
  resetViewNonce: 0,
  focusNonce: 0,
  shopViewNonce: 0,
  placeMode: false,
  events: [],
  breakdowns: [],
  plans: [],
  records: [],
  toasts: [],
}));

let toastSeq = 1;
export function toast(text: string, kind: Toast['kind'] = 'ok', ms = 4200) {
  const id = toastSeq++;
  useApp.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
  setTimeout(() => useApp.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/** Текущее время, обновляемое раз в секунду (для часов и «N с назад») */
export const useClock = create<{ now: number }>(() => ({ now: Date.now() }));
setInterval(() => useClock.setState({ now: Date.now() }), 1000);

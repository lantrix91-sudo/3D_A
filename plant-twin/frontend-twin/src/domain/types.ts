/**
 * Доменная модель цифрового двойника.
 * Все отметки времени — миллисекунды Unix (UTC). Отображение — Asia/Almaty (см. utils/time.ts).
 */

/** Код оборудования (Equipment.code на бэкенде) */
export type EquipmentId = string;
/** Профиль показаний: определяет набор датчиков, диапазоны и условную 3D-модель. generic — без датчиков */
export type EquipmentKind = 'proofer' | 'mixer' | 'kneader' | 'oven' | 'cooler' | 'generic';
export type SensorKind = 'current' | 'temperature' | 'humidity';

/** Equipment — единица оборудования. */
export interface Equipment {
  id: EquipmentId;
  kind: EquipmentKind;
  name: string;
  shortName: string;
  /** Пояснение, что модель условная */
  modelNote: string;
  /** Помещение по экспликации проекта */
  room: string;
  /** Положение на плане цеха, метры (x, z), и поворот вокруг оси Y, рад */
  position: [number, number];
  rotationY: number;
  /** Габарит для камеры (радиус обзора), м */
  viewRadius: number;
  /** Модель (марка) по паспорту */
  model?: string;
  /** Встроенная в приложение 3D-модель (models/*.glb), используется, если файл не загружен */
  builtinModel?: string;
  /** Ключ загруженной 3D-модели (GLB) в хранилище; нет — встроенная или условная модель */
  modelAsset?: string | null;
  /** Данные с бэкенда */
  server?: ServerEquipmentInfo;
}

/** То, что приходит с сервера и нужно только сцене и карточке (см. services/planMapper.ts) */
export interface ServerEquipmentInfo {
  /** Код типа (EquipmentType.code) */
  type: string;
  /** Код зоны (Zone.code) */
  zone: string;
  /** Код итогового ассета: своего или заданного типом */
  assetCode: string | null;
  /** Привязано ли устройство: без него показаний не будет */
  hasTelemetry: boolean;
  /** Сигналы, важные для типа: первый показывается на подписи */
  keySignals: string[];
  /** Приходит только пользователю с is_staff */
  deviceId?: string | null;
  /** Высота установки над полом, м */
  posY: number;
  /** Размер запасной коробки, если файла модели нет, м */
  fallbackSize: { w: number; d: number; h: number };
  /** Датчики из сигналов WebSocket */
  sensors: Sensor[];
}

/** Загруженная 3D-модель */
export interface Model3D {
  id: string;
  fileName: string;
  size: number;
  /** Масштаб файла → метры (1 — метры, 0.01 — см, 0.001 — мм) */
  scale: number;
  /** Габариты в метрах после масштабирования: ширина (X), высота (Y), глубина (Z) */
  dims: [number, number, number];
  uploadedAt: number;
  blob: Blob;
}

/** Sensor — датчик, единица измерения и место установки. */
export interface Sensor {
  id: string; // `${equipmentId}.${kind}`
  equipmentId: EquipmentId;
  kind: SensorKind;
  label: string;
  unit: string;
  /** Место установки / измерения */
  location: string;
  /** Количество знаков после запятой при отображении */
  precision: number;
  /** Диапазон оси графика по умолчанию */
  axis: [number, number];
  /** Ключ сигнала в сообщениях WebSocket и в /readings/ */
  signalKey?: string;
  /** Тип значения. Графики строятся только для number */
  valueType?: 'number' | 'state' | 'bool';
  /** Короткая подпись в списке (T, P, …) */
  short?: string;
}

export type AlarmLevel = 'normal' | 'warning' | 'alarm';
export type RunState = 'running' | 'stopped';
export type CommState = 'ok' | 'lost' | 'unknown';

/** Итоговое состояние для отображения (выводится из независимых составляющих). */
export type DisplayState = 'running' | 'stopped' | 'warning' | 'alarm' | 'maintenance' | 'no_comm' | 'no_sensors' | 'decommissioned';

export type EventType =
  | 'warning_start'
  | 'warning_end'
  | 'alarm_start'
  | 'alarm_end'
  | 'comm_lost'
  | 'comm_restored'
  | 'run_started'
  | 'run_stopped'
  | 'maintenance_on'
  | 'maintenance_off'
  | 'system'
  | 'journal';

export type Severity = 'info' | 'warning' | 'alarm';

/** Event — событие или изменение состояния. */
export interface AppEvent {
  id: string;
  ts: number;
  equipmentId: EquipmentId | null;
  sensorId?: string;
  type: EventType;
  severity: Severity;
  message: string;
  value?: number | null;
  unit?: string;
}

export type BreakdownStatus = 'open' | 'in_progress' | 'resolved';

/** Breakdown — неисправность и ремонт. */
export interface Breakdown {
  id: string;
  equipmentId: EquipmentId;
  occurredAt: number;
  description: string;
  cause: string;
  status: BreakdownStatus;
  worksDone: string;
  downtimeStart: number | null;
  downtimeEnd: number | null;
  responsible: string;
  comment: string;
  createdAt: number;
  updatedAt: number;
}

export type PlanStatus = 'planned' | 'done';
export type PlanDisplayStatus = 'planned' | 'overdue' | 'done';

/** MaintenancePlan — плановая работа ППР. */
export interface MaintenancePlan {
  id: string;
  equipmentId: EquipmentId;
  title: string;
  works: string;
  /** Периодичность в днях; 0 — разовая работа */
  periodDays: number;
  plannedDate: number;
  responsible: string;
  status: PlanStatus;
  actualDate: number | null;
  comment: string;
  /** Ссылка на предыдущую запись цепочки (для периодических работ) */
  prevPlanId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** MaintenanceRecord — факт выполненного обслуживания. */
export interface MaintenanceRecord {
  id: string;
  planId: string;
  equipmentId: EquipmentId;
  title: string;
  works: string;
  completedAt: number;
  responsible: string;
  comment: string;
}

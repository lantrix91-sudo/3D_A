import type {
  AppEvent,
  Breakdown,
  EquipmentId,
  MaintenancePlan,
  MaintenanceRecord,
} from '../domain/types';

/**
 * Контракт хранилища в браузере. Реализация одна — в памяти (memoryRepository.ts): данные
 * не переживают перезагрузку. Настоящие данные лежат на бэкенде.
 */
export interface Repository {
  addEvents(list: AppEvent[]): Promise<void>;
  listEvents(limit: number, equipmentId?: EquipmentId): Promise<AppEvent[]>;

  listBreakdowns(): Promise<Breakdown[]>;
  putBreakdown(b: Breakdown): Promise<void>;

  listPlans(): Promise<MaintenancePlan[]>;
  putPlan(p: MaintenancePlan): Promise<void>;
  listRecords(): Promise<MaintenanceRecord[]>;
  putRecord(r: MaintenanceRecord): Promise<void>;

  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;

  /** Оставить только последние события */
  trimEvents(maxEvents: number): Promise<void>;
}

import { create } from 'zustand';
import type { Equipment, EquipmentId, Sensor, SensorKind } from './types';

/**
 * Реестр оборудования в памяти браузера. Сам он ничего не знает об оборудовании: после входа его
 * заполняет serverHub из GET /api/v1/plan/. Пока сервер не ответил или в плане пусто, список пуст.
 *
 * Реестр изменяется во время работы (добавление, удаление, правка). Массивы EQUIPMENT и SENSORS
 * и словари *_BY_ID обновляются на месте, а счётчик version в useRegistry сообщает интерфейсу о перерисовке.
 */
export const EQUIPMENT: Equipment[] = [];
export const EQUIPMENT_BY_ID: Record<EquipmentId, Equipment> = {};
export const SENSORS: Sensor[] = [];
export const SENSOR_BY_ID: Record<string, Sensor> = {};

export const useRegistry = create<{ version: number }>(() => ({ version: 0 }));
const bump = () => useRegistry.setState((s) => ({ version: s.version + 1 }));

export function sensorId(equipmentId: EquipmentId, kind: SensorKind): string {
  return `${equipmentId}.${kind}`;
}

export function sensorsOf(equipmentId: EquipmentId): Sensor[] {
  return SENSORS.filter((s) => s.equipmentId === equipmentId);
}

/** Датчик, показание которого выводится на подписи и экране модели */
export function keySensorOf(eq: Equipment): Sensor | undefined {
  // Устройство не привязано: показаний не будет, хотя сигналы у типа могут быть
  if (!eq.server?.hasTelemetry) return undefined;
  const numeric = eq.server.sensors.filter((s) => s.valueType === 'number');
  return eq.server.keySignals.map((k) => numeric.find((s) => s.signalKey === k)).find(Boolean) ?? numeric[0];
}

/** Лента событий живёт в памяти браузера: держим только последние записи */
export const RETENTION = {
  maxEvents: 3000,
  cleanupEveryMs: 60 * 1000,
};

/** Добавить или заменить запись оборудования */
export function upsertEquipment(e: Equipment) {
  const i = EQUIPMENT.findIndex((x) => x.id === e.id);
  if (i >= 0) {
    Object.assign(EQUIPMENT[i], e);
  } else {
    EQUIPMENT.push(e);
    EQUIPMENT_BY_ID[e.id] = e;
  }
  const cur = EQUIPMENT_BY_ID[e.id];
  // пересобрать датчики этой позиции
  for (let k = SENSORS.length - 1; k >= 0; k--) if (SENSORS[k].equipmentId === e.id) {
    delete SENSOR_BY_ID[SENSORS[k].id];
    SENSORS.splice(k, 1);
  }
  for (const s of cur.server?.sensors ?? []) {
    SENSORS.push(s);
    SENSOR_BY_ID[s.id] = s;
  }
  bump();
}

export function removeEquipment(id: EquipmentId) {
  const i = EQUIPMENT.findIndex((x) => x.id === id);
  if (i >= 0) EQUIPMENT.splice(i, 1);
  delete EQUIPMENT_BY_ID[id];
  for (let k = SENSORS.length - 1; k >= 0; k--) if (SENSORS[k].equipmentId === id) {
    delete SENSOR_BY_ID[SENSORS[k].id];
    SENSORS.splice(k, 1);
  }
  bump();
}

/** Наименование для журналов и экспорта: работает и для удалённого оборудования */
export function equipmentLabel(id: EquipmentId | null | undefined): string {
  if (!id) return '—';
  return EQUIPMENT_BY_ID[id]?.name ?? `${id} (удалено)`;
}

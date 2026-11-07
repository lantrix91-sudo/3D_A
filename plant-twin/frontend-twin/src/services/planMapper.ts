import type { LiveEntry, LiveSignalMeta, PlanEquipment, PlanZone, ServerStatus } from '../api/types';
import type { DisplayState, Equipment, Sensor, SensorKind } from '../domain/types';
import type { EquipmentLive, SensorLive } from '../engine/alarmEngine';

/**
 * Переводчик: форматы сервера → форматы двойника.
 *
 * Здесь только чистые функции: вход → выход, без запросов к сети и без состояния.
 * Поэтому они легко проверяются тестами (planMapper.test.ts). Если сервер поменяет формат,
 * править нужно в первую очередь этот файл: остальной интерфейс работает с форматами двойника.
 */

// ---------------------------------------------------------------- координаты

/** Положение в сцене: x и z в метрах, поворот rotY в радианах */
export interface WorldPose {
  x: number;
  z: number;
  rotY: number;
}

/** Параметры зоны, от которых зависит пересчёт. Привязка к чертежу необязательна: без неё она нулевая */
type ZoneFrame = Pick<PlanZone, 'offset' | 'rotation_deg'> & Partial<Pick<PlanZone, 'plan_offset' | 'plan_rotation_deg'>>;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const round = (value: number, digits: number) => Number(value.toFixed(digits));
/** Угол в диапазоне [0, 360): именно такой принимает PATCH /equipment/ */
export const normalizeDeg = (deg: number) => (((deg % 360) + 360) % 360);

/** Поворот вокруг вертикали и сдвиг. offset задан как в API: z на север, поэтому в сцене он со знаком минус */
function transform(x: number, z: number, offset: { x: number; z: number }, deg: number): [number, number] {
  const a = toRad(deg);
  return [offset.x + x * Math.cos(a) + z * Math.sin(a), -offset.z - x * Math.sin(a) + z * Math.cos(a)];
}

/** Обратное преобразование к transform */
function untransform(x: number, z: number, offset: { x: number; z: number }, deg: number): [number, number] {
  const a = toRad(deg);
  const dx = x - offset.x;
  const dz = z + offset.z;
  return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
}

const NO_OFFSET = { x: 0, z: 0 };

/**
 * План сервера → сцена двойника. Сцена двойника построена в координатах чертежа (ноль — оси 1 и А).
 * Цепочка, сверху вниз:
 *   1. pos_x, pos_z: в плане z направлена на север и положительна, в Three.js север — минус Z (docs/COORDINATES.md);
 *   2. смещение и поворот зоны: offset, rotation_deg;
 *   3. привязка зоны к чертежу: plan_offset, plan_rotation_deg.
 */
export function planToWorld(zone: ZoneFrame, posX: number, posZ: number, rotationDeg: number): WorldPose {
  const [zx, zz] = transform(posX, -posZ, zone.offset, zone.rotation_deg);
  const planDeg = zone.plan_rotation_deg ?? 0;
  const [x, z] = transform(zx, zz, zone.plan_offset ?? NO_OFFSET, planDeg);
  return { x, z, rotY: toRad(rotationDeg + zone.rotation_deg + planDeg) };
}

/** Сцена → план: обратное преобразование для сохранения на сервер (точность 0,01 м и 0,1°) */
export function worldToPlan(zone: ZoneFrame, pose: WorldPose) {
  const planDeg = zone.plan_rotation_deg ?? 0;
  const [zx, zz] = untransform(pose.x, pose.z, zone.plan_offset ?? NO_OFFSET, planDeg);
  const [lx, lz] = untransform(zx, zz, zone.offset, zone.rotation_deg);
  return {
    pos_x: round(lx, 2),
    // «+ 0» превращает −0 в 0: координата −0 не должна уходить на сервер
    pos_z: round(-lz, 2) + 0,
    // округление может дать 360.0, поэтому нормализуем ещё раз
    rotation_deg: normalizeDeg(round(normalizeDeg((pose.rotY * 180) / Math.PI - zone.rotation_deg - planDeg), 1)),
  };
}

/** Не выпускаем оборудование за границы зоны: сервер всё равно отклонил бы такой PATCH */
export function clampToZone(zone: ZoneFrame & Pick<PlanZone, 'size_x' | 'size_z'>, pose: WorldPose): WorldPose {
  if (zone.size_x == null || zone.size_z == null) return pose;
  const plan = worldToPlan(zone, pose);
  const x = Math.min(zone.size_x, Math.max(0, plan.pos_x));
  const z = Math.min(zone.size_z, Math.max(0, plan.pos_z));
  if (x === plan.pos_x && z === plan.pos_z) return pose;
  return { ...planToWorld(zone, x, z, 0), rotY: pose.rotY };
}

// ---------------------------------------------------------------- статусы

/** Статус сервера → состояние на экране. Таблица описана в README */
export function statusToDisplay(status: ServerStatus, hasTelemetry: boolean): DisplayState {
  switch (status) {
    case 'run':
      return 'running';
    case 'stop':
      return 'stopped';
    case 'alarm':
      return 'alarm';
    case 'offline':
      return 'no_comm';
    default:
      // unknown: данных не было. Если устройство не привязано, ждать нечего — это «Без датчиков»
      return hasTelemetry ? 'no_comm' : 'no_sensors';
  }
}

/** Подписи технического состояния: те же, что в Equipment.Condition на бэкенде */
export const CONDITION_LABELS: Record<string, string> = {
  working: 'Работает',
  idle: 'Простой',
  faulty: 'Неисправно',
  maintenance: 'На ТО',
  repair: 'В ремонте',
  decommissioned: 'Выведено из работы',
};

/**
 * Техническое состояние важнее телеметрии: станок в ремонте не «работает», даже если датчик шлёт run.
 * То же правило было в старом фронтенде (OVERRIDING_CONDITIONS). working и idle не перекрывают ничего.
 */
export function conditionToDisplay(condition: string | undefined): DisplayState | null {
  switch (condition) {
    case 'maintenance':
    case 'repair':
      return 'maintenance';
    case 'faulty':
      return 'alarm';
    case 'decommissioned':
      return 'decommissioned';
    default:
      return null;
  }
}

// ---------------------------------------------------------------- оборудование

/** Идентификатор модели в useModels: одним ассетом могут пользоваться несколько станков */
export const assetModelId = (assetCode: string) => `asset:${assetCode}`;

/** Запись плана → запись оборудования двойника. sensors передаём отдельно: они приходят по WebSocket */
export function equipmentFromPlan(item: PlanEquipment, zone: PlanZone, sensors: Sensor[] = []): Equipment {
  const pose = planToWorld(zone, item.pos.x, item.pos.z, item.rotation_deg);
  return {
    id: item.code,
    // kind в двойнике означает набор датчиков; generic — «датчиков нет».
    // Без привязанного устройства данных не будет, поэтому такое оборудование считаем generic.
    kind: !item.has_telemetry ? 'generic' : item.type === 'oven' ? 'oven' : 'cooler',
    name: item.name,
    shortName: item.name,
    modelNote: '',
    room: '',
    position: [pose.x, pose.z],
    rotationY: pose.rotY,
    viewRadius: Math.max(1.5, Math.max(item.size.x, item.size.z) * 1.3),
    modelAsset: item.asset?.url ? assetModelId(item.asset.code) : null,
    server: {
      type: item.type,
      zone: item.zone,
      assetCode: item.asset?.code ?? null,
      hasTelemetry: item.has_telemetry,
      keySignals: item.key_signals,
      deviceId: item.device_id,
      posY: item.pos.y,
      fallbackSize: { w: item.size.x, d: item.size.z, h: item.size.y },
      sensors,
    },
  };
}

const SHORT_LABEL: Record<string, string> = { temperature: 'T', humidity: 'RH', current: 'I', power: 'P' };

/** Сигналы из WebSocket → датчики двойника. Набор сигналов у каждого типа оборудования свой */
export function sensorsFromSignals(code: string, signals: Record<string, LiveSignalMeta>): Sensor[] {
  return Object.entries(signals).map(([key, meta]) => ({
    id: `${code}.${key}`,
    equipmentId: code,
    // Тип значения хранится в valueType, а ключ сигнала — в signalKey; kind только делит на три вида для подписи.
    kind: (key === 'temperature' || key === 'humidity' ? key : 'current') as SensorKind,
    label: meta.name,
    unit: meta.unit,
    location: '',
    precision: 1,
    // Нижняя граница оси графика — 0, верхняя растягивается под данные (см. SensorChart)
    axis: [0, 1],
    signalKey: key,
    valueType: meta.kind,
    short: SHORT_LABEL[key] ?? meta.name.slice(0, 4),
  }));
}

/** Изменился ли набор сигналов: только тогда нужно пересобирать датчики и перерисовывать карточку */
export function sameSignals(sensors: Sensor[], signals: Record<string, LiveSignalMeta>): boolean {
  const keys = Object.keys(signals);
  return sensors.length === keys.length && sensors.every((s) => {
    const m = signals[s.signalKey ?? ''];
    return !!m && m.name === s.label && m.unit === s.unit && m.kind === s.valueType;
  });
}

// ---------------------------------------------------------------- живые данные

/** Статус с точки зрения экрана. Нужен, чтобы писать событие только при реальной смене */
export interface ComputedLive {
  equipment: EquipmentLive;
  sensors: Record<string, SensorLive>;
}

function signalText(meta: LiveSignalMeta, value: unknown): string | null {
  if (value == null) return null;
  if (meta.kind === 'bool') return value ? 'да' : 'нет';
  if (meta.kind === 'state') return String(value);
  return null;
}

/**
 * Запись WebSocket → состояние, которое читает интерфейс: список, карточка и сцена.
 *
 * Устаревание: сервер сообщает об отключении устройства только из фонового check_offline, а без Redis
 * такие события из отдельного процесса не доходят. Поэтому браузер сам считает данные устаревшими,
 * если истёк переданный сервером offline_seconds от last_seen. Серверный статус при этом не переписывается.
 *
 * Связь и работа станка — разные вопросы. unknown значит, что сервер не может определить работу станка
 * (например, у типа нет правил статуса). Если при этом пакеты приходят, связь есть и значения показываются.
 */
export function computeLive(entry: LiveEntry, hasTelemetry: boolean, nowMs: number): ComputedLive {
  const tsMs = entry.last_seen != null ? entry.last_seen * 1000 : null;
  const stale = tsMs != null && nowMs - tsMs > entry.offline_seconds * 1000;
  const lost = stale || entry.status === 'offline';
  const fresh = !lost && (entry.status !== 'unknown' || tsMs != null);
  const dataOnly = fresh && entry.status === 'unknown' && hasTelemetry;
  const telemetry: DisplayState = stale ? 'no_comm' : dataOnly ? 'data_only' : statusToDisplay(entry.status, hasTelemetry);
  const display: DisplayState = conditionToDisplay(entry.condition) ?? telemetry;

  const sensors: Record<string, SensorLive> = {};
  for (const [key, meta] of Object.entries(entry.signals)) {
    const value = entry.values[key] ?? null;
    const fault = entry.faults.includes(key);
    const number = meta.kind === 'number' && typeof value === 'number' ? value : null;
    const id = `${entry.equipment}.${key}`;
    sensors[id] = {
      sensorId: id,
      lastValue: number,
      lastGoodTs: value != null && !fault ? tsMs : null,
      lastSeenTs: tsMs,
      hasData: fresh && value != null && !fault,
      level: 'normal', // пороги считает сервер, по датчикам он отдаёт только итоговый статус
      direction: null,
      pending: null,
      text: signalText(meta, value),
      fault,
    };
  }

  return {
    sensors,
    equipment: {
      equipmentId: entry.equipment,
      runState: display === 'running' ? 'running' : display === 'stopped' ? 'stopped' : 'unknown',
      runSince: null,
      // Связь не зависит от технического состояния: у станка в ремонте датчик может продолжать работать
      comm: lost ? 'lost' : fresh ? 'ok' : 'unknown',
      commSince: lost ? tsMs : null,
      level: display === 'alarm' ? 'alarm' : 'normal',
      lastGoodTs: tsMs,
      serverState: display,
      condition: entry.condition,
    },
  };
}

/** Что показать до прихода первого сообщения WebSocket: статус берём из самого плана */
export function liveEntryFromPlan(item: PlanEquipment): LiveEntry {
  return { equipment: item.code, status: item.status, condition: item.condition, ts: item.last_seen, last_seen: item.last_seen, offline_seconds: item.offline_seconds, values: {}, faults: [], signals: {} };
}

/** Текст для ленты событий при смене состояния */
export function statusChangeMessage(state: DisplayState): { message: string; severity: 'info' | 'warning' | 'alarm' } {
  switch (state) {
    case 'alarm':
      return { message: 'Сервер сообщил об аварии', severity: 'alarm' };
    case 'no_comm':
      return { message: 'Нет связи с устройством', severity: 'warning' };
    case 'data_only':
      return { message: 'Данные поступают, статус работы не определён', severity: 'info' };
    case 'running':
      return { message: 'Работает', severity: 'info' };
    case 'stopped':
      return { message: 'Остановлено', severity: 'info' };
    case 'maintenance':
      return { message: 'На обслуживании', severity: 'info' };
    case 'decommissioned':
      return { message: 'Выведено из работы', severity: 'info' };
    default:
      return { message: 'Состояние изменилось', severity: 'info' };
  }
}

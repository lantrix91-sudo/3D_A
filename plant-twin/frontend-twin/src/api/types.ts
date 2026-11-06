/**
 * Форматы ответов бэкенда — аналог сериализаторов DRF, только для TypeScript.
 * Источник: backend/plants/serializers.py, backend/equipment/live.py, docs/api-контракт.md.
 * Эти типы только проверяются при сборке и в браузер как код не попадают.
 */

/** Статус, который считает сервер (backend/equipment/status.py) */
export type ServerStatus = 'run' | 'stop' | 'alarm' | 'offline' | 'unknown';

export interface PlanAsset {
  code: string;
  /** Абсолютный адрес GLB или null, если файл не загружен */
  url: string | null;
  led_node_name: string;
  rotation_speed_deg_s: number;
  animation_node_name: string;
  size: { x: number; y: number; z: number };
}

export interface PlanEquipment {
  code: string;
  name: string;
  type: string;
  zone: string;
  key_signals: string[];
  asset: PlanAsset | null;
  /** Координаты плана: x — на восток, z — на север, y — высота над полом */
  pos: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  rotation_deg: number;
  status: ServerStatus;
  /** Unix-время последних данных, секунды */
  last_seen: number | null;
  offline_seconds: number;
  is_active: boolean;
  condition: string;
  has_telemetry: boolean;
  /** Поле приходит только пользователю с is_staff */
  device_id?: string | null;
}

export interface PlanZone {
  id: number;
  code: string;
  name: string;
  size_x: number | null;
  size_z: number | null;
  model_url: string | null;
  offset: { x: number; z: number };
  rotation_deg: number;
  /** Где на чертеже двойника находится нуль зоны: x — на восток, z — на север, метры */
  plan_offset: { x: number; z: number };
  /** Поворот осей зоны относительно чертежа, против часовой стрелки */
  plan_rotation_deg: number;
  model_rotation_deg: number;
  visible_by_default: boolean;
  equipment: PlanEquipment[];
}

export interface PlanResponse {
  /** true у роли admin и у суперпользователя: можно двигать, добавлять и удалять оборудование */
  can_edit_layout: boolean;
  /** true у engineer, admin и суперпользователя: можно менять стены и колонны */
  can_edit_walls: boolean;
  can_change_condition: boolean;
  can_change_image: boolean;
  plant: { code: string; name: string } | null;
  zones: PlanZone[];
}

export interface Profile {
  id: number;
  username: string;
  roles: string[];
}

export interface LiveSignalMeta {
  name: string;
  unit: string;
  kind: 'number' | 'state' | 'bool';
}

/** Одна запись WebSocket: элемент snapshot или сообщение update */
export interface LiveEntry {
  equipment: string;
  status: ServerStatus;
  /** Техническое состояние, которое задают люди (обход, ремонт, ТО). Статус status задают устройства */
  condition?: string;
  ts: number | null;
  last_seen: number | null;
  offline_seconds: number;
  values: Record<string, number | string | boolean | null>;
  faults: string[];
  signals: Record<string, LiveSignalMeta>;
}

/** Ответ GET /api/v1/equipment/<code>/readings/?hours=N */
export interface ReadingsResponse {
  equipment: string;
  start: number;
  end: number;
  bucket_seconds: number;
  series: { key: string; name: string; unit: string; points: { x: number; y: number | null; min: number | null; max: number | null }[] }[];
}

/** Формат walls.v1: стены и колонны в координатах чертежа двойника (см. services/walls.ts) */
export interface WallsData {
  walls: { id: string; x1: number; z1: number; x2: number; z2: number; t: number; kind: 'outer' | 'inner' | 'new' | 'partition' }[];
  columns: { id: string; x: number; z: number }[];
  seq: number;
}

/** Ответ GET и PUT /api/v1/plan-walls/. version = 0 и data = null — на сервере стен ещё нет */
export interface PlanWallsResponse {
  zone: number;
  version: number;
  data: WallsData | null;
  updated_by: string | null;
  /** Unix-время, секунды */
  updated_at: number | null;
}

/** Тело POST /api/v1/equipment/ и PATCH /api/v1/equipment/<code>/ */
export interface EquipmentWrite {
  is_active?: boolean;
  code?: string;
  name?: string;
  type?: string;
  zone?: string;
  asset?: string | null;
  pos_x?: number;
  pos_y?: number;
  pos_z?: number;
  rotation_deg?: number;
}

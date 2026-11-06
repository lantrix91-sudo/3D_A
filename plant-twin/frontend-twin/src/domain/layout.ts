import raw from './plant-layout.json';
import type { EquipmentId } from './types';

/**
 * Планировка 1-го этажа, извлечённая из рабочего проекта (tools/pdf_to_layout.py).
 * Координаты в метрах: начало — пересечение осей «1» и «А», X — на восток, север — −Z.
 */

export type WallKind = 'outer' | 'inner' | 'new' | 'partition';
export type Wall = [number, number, number, number, number, WallKind];

export interface Room {
  id: string;
  name: string;
  category: string;
  x: number;
  z: number;
}

export interface PlantLayout {
  source: { project: string; sheet: string; note: string };
  ptPerMeter: number;
  floorHeight: number;
  extents: { minX: number; maxX: number; minZ: number; maxZ: number };
  axesX: { name: string; x: number }[];
  axesZ: { name: string; z: number }[];
  axesZ1: { name: string; z: number }[];
  walls: Wall[];
  columns: [number, number][];
  rooms: Room[];
  underlay: { minX: number; maxX: number; minZ: number; maxZ: number; width: number; height: number };
}

export const LAYOUT = raw as unknown as PlantLayout;

export const ROOM_BY_ID: Record<string, Room> = Object.fromEntries(LAYOUT.rooms.map((r) => [r.id, r]));

export function roomTitle(id: string | undefined | null): string {
  if (!id) return '—';
  const r = ROOM_BY_ID[id];
  return r ? `${r.id} · ${r.name || 'без названия'}` : id;
}

/** Ближайшая метка помещения (подсказка после перемещения оборудования; не проверка вхождения в контур). */
export function nearestRoom(x: number, z: number): Room | null {
  let best: Room | null = null;
  let d = Infinity;
  for (const r of LAYOUT.rooms) {
    if (!r.name) continue; // числа без экспликации — размеры, а не помещения
    const dd = (r.x - x) ** 2 + (r.z - z) ** 2;
    if (dd < d) {
      d = dd;
      best = r;
    }
  }
  return d < 15 * 15 ? best : null;
}

/** Ближайшие оси для привязки «ось Х / ось Y ± м» */
export function axisRef(x: number, z: number): string {
  const ax = LAYOUT.axesX.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
  const az = LAYOUT.axesZ.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
  const dx = x - ax.x;
  const dz = -(z - az.z);
  const f = (v: number) => (Math.abs(v) < 0.05 ? '' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} м`);
  return `оси ${ax.name}${f(dx)} / ${az.name}${f(dz)}`;
}

export type Pose = { x: number; z: number; rotY: number };
export type PoseMap = Partial<Record<EquipmentId, Pose>>;

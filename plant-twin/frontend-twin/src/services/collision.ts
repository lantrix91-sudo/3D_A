import { create } from 'zustand';
import { EQUIPMENT, EQUIPMENT_BY_ID } from '../domain/config';
import { axisRef, type Pose } from '../domain/layout';
import type { Equipment, EquipmentId } from '../domain/types';
import { equipmentSize } from './models3d';
import { useWalls, type EditWall } from './walls';

/**
 * Столкновения на плане (вид сверху, 2D): оборудование не должно проходить сквозь стены, колонны и
 * другое оборудование. Каждый объект — повёрнутый прямоугольник (OBB), пересечение — теорема
 * о разделяющей оси. Касание допускается (зазор 5 мм не считается пересечением).
 */

export interface Obb {
  cx: number;
  cz: number;
  hx: number; // полуширина вдоль своей оси X
  hz: number; // полуглубина вдоль своей оси Z
  ang: number; // поворот вокруг вертикали (как rotation.y в сцене)
}

export interface Hit {
  kind: 'wall' | 'column' | 'equipment';
  id: string;
  label: string;
}

const EPS = 0.005;

/** Габарит корпуса в плане: по загруженной 3D-модели или по условной модели */
export function bodySize(eq: Equipment): { w: number; d: number } {
  const { w, d } = equipmentSize(eq); // тот же габарит, что и прямоугольник на полу
  return { w, d };
}

export function equipmentObb(eq: Equipment, pose: Pose): Obb {
  const { w, d } = bodySize(eq);
  return { cx: pose.x, cz: pose.z, hx: w / 2 - EPS, hz: d / 2 - EPS, ang: pose.rotY };
}

export function wallObb(w: Pick<EditWall, 'x1' | 'z1' | 'x2' | 'z2' | 't'>): Obb {
  const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
  // в сцене стена — коробка длиной len + t/2, толщиной t, повёрнутая на -atan2(dz, dx)
  return {
    cx: (w.x1 + w.x2) / 2,
    cz: (w.z1 + w.z2) / 2,
    hx: (len + w.t * 0.5) / 2 - EPS,
    hz: w.t / 2 - EPS,
    ang: -Math.atan2(w.z2 - w.z1, w.x2 - w.x1),
  };
}

const COLUMN_HALF = 0.2;

/** Оси прямоугольника в плане (x, z) с учётом поворота rotation.y */
function axes(o: Obb): [[number, number], [number, number]] {
  const c = Math.cos(o.ang);
  const s = Math.sin(o.ang);
  // поворот вокруг Y: локальная X → (cos, -sin), локальная Z → (sin, cos)
  return [[c, -s], [s, c]];
}

function radius(o: Obb) {
  return Math.hypot(o.hx, o.hz);
}

export function obbOverlap(a: Obb, b: Obb): boolean {
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  const rr = radius(a) + radius(b);
  if (dx * dx + dz * dz > rr * rr) return false; // грубая проверка
  const [ax, az] = axes(a);
  const [bx, bz] = axes(b);
  for (const [nx, nz] of [ax, az, bx, bz]) {
    const projA = a.hx * Math.abs(ax[0] * nx + ax[1] * nz) + a.hz * Math.abs(az[0] * nx + az[1] * nz);
    const projB = b.hx * Math.abs(bx[0] * nx + bx[1] * nz) + b.hz * Math.abs(bz[0] * nx + bz[1] * nz);
    if (Math.abs(dx * nx + dz * nz) > projA + projB) return false;
  }
  return true;
}

/** Первое препятствие для оборудования в заданном положении (или null) */
export function findCollision(eqId: EquipmentId, pose: Pose, getPose: (id: EquipmentId) => Pose): Hit | null {
  const eq = EQUIPMENT_BY_ID[eqId];
  if (!eq) return null;
  const me = equipmentObb(eq, pose);
  const { walls, columns } = useWalls.getState();
  for (const w of walls) {
    if (obbOverlap(me, wallObb(w))) return { kind: 'wall', id: w.id, label: `стена ${w.id}` };
  }
  for (const c of columns) {
    if (obbOverlap(me, { cx: c.x, cz: c.z, hx: COLUMN_HALF, hz: COLUMN_HALF, ang: 0 })) {
      return { kind: 'column', id: c.id, label: `колонна (${axisRef(c.x, c.z)})` };
    }
  }
  for (const other of EQUIPMENT) {
    if (other.id === eqId) continue;
    if (obbOverlap(me, equipmentObb(other, getPose(other.id)))) {
      return { kind: 'equipment', id: other.id, label: `${other.name} ${other.id}` };
    }
  }
  return null;
}

/** Оборудование, которое пересекает стена (для редактора стен) */
export function wallHitsEquipment(w: Pick<EditWall, 'x1' | 'z1' | 'x2' | 'z2' | 't'>, getPose: (id: EquipmentId) => Pose): Hit | null {
  const o = wallObb(w);
  for (const eq of EQUIPMENT) {
    if (obbOverlap(o, equipmentObb(eq, getPose(eq.id)))) return { kind: 'equipment', id: eq.id, label: `${eq.name} ${eq.id}` };
  }
  return null;
}

/** Ближайшее свободное место по спирали вокруг исходной точки (шаг 0,25 м, до 15 м) */
export function findFreeSpot(eqId: EquipmentId, pose: Pose, getPose: (id: EquipmentId) => Pose): Pose | null {
  if (!findCollision(eqId, pose, getPose)) return pose;
  const step = 0.25;
  for (let ring = 1; ring <= 60; ring++) {
    const r = ring * step;
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = { ...pose, x: Math.round((pose.x + r * Math.cos(a)) * 100) / 100, z: Math.round((pose.z + r * Math.sin(a)) * 100) / 100 };
      if (!findCollision(eqId, p, getPose)) return p;
    }
  }
  return null;
}

/** Последнее препятствие при перемещении/повороте — для подсказки в интерфейсе */
export const useCollision = create<{
  blocked: { id: EquipmentId; hit: Hit; at: number } | null;
  /** Редактор стен: стена упёрлась в оборудование */
  wallBlocked: string | null;
}>(() => ({ blocked: null, wallBlocked: null }));

export function reportWallBlocked(label: string | null) {
  if (useCollision.getState().wallBlocked !== label) useCollision.setState({ wallBlocked: label });
}

export function reportBlocked(id: EquipmentId, hit: Hit | null) {
  const cur = useCollision.getState().blocked;
  if (!hit) {
    if (cur) useCollision.setState({ blocked: null });
    return;
  }
  if (cur?.id === id && cur.hit.id === hit.id) return;
  useCollision.setState({ blocked: { id, hit, at: Date.now() } });
}

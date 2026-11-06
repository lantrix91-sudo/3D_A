import * as THREE from 'three';
import { LAYOUT } from '../domain/layout';
import { planToWorld } from '../services/planMapper';
import { useServer } from '../store/serverStore';

/**
 * Рамка сцены: границы здания и стартовые точки камеры.
 * Они берутся из чертежа и размеров зон с сервера (size_x, size_z).
 */
export interface SceneFrame {
  E: { minX: number; maxX: number; minZ: number; maxZ: number };
  CENTER: THREE.Vector3;
  OVERVIEW: { pos: THREE.Vector3; target: THREE.Vector3 };
  SHOP: { pos: THREE.Vector3; target: THREE.Vector3 };
}

function serverExtents(): SceneFrame['E'] {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const zone of useServer.getState().zones) {
    if (zone.size_x == null || zone.size_z == null) continue;
    for (const [x, z] of [[0, 0], [zone.size_x, 0], [0, zone.size_z], [zone.size_x, zone.size_z]]) {
      const p = planToWorld(zone, x, z, 0);
      xs.push(p.x);
      zs.push(p.z);
    }
  }
  // Здание нарисовано по чертежу, поэтому рамка охватывает и чертёж, и зоны сервера
  const L = LAYOUT.extents;
  return { minX: Math.min(L.minX, ...xs), maxX: Math.max(L.maxX, ...xs), minZ: Math.min(L.minZ, ...zs), maxZ: Math.max(L.maxZ, ...zs) };
}

export function sceneFrame(): SceneFrame {
  const E = serverExtents();
  const CENTER = new THREE.Vector3((E.minX + E.maxX) / 2, 0, (E.minZ + E.maxZ) / 2);
  // Размеры зоны могут быть любыми, поэтому камера отходит пропорционально зданию
  const span = Math.max(E.maxX - E.minX, E.maxZ - E.minZ);
  const OVERVIEW = { pos: new THREE.Vector3(CENTER.x, span * 1.2, CENTER.z + span * 0.85), target: CENTER.clone() };
  // помещение 024 «Цех-1 Выпечка» — между осями 1–4 и Л–Н
  const SHOP = { pos: new THREE.Vector3(11, 22, -36), target: new THREE.Vector3(10, 0, -58) };
  return { E, CENTER, OVERVIEW, SHOP };
}

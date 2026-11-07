import * as THREE from 'three';
import { create } from 'zustand';
import { SENSOR_BY_ID, keySensorOf, sensorId, sensorsOf } from '../domain/config';
import type { DisplayState, Equipment, EquipmentId } from '../domain/types';
import type { EngineSnapshot } from '../engine/alarmEngine';
import { STATE_META } from '../ui/common/stateMeta';

/**
 * «Живые» экраны на моделях оборудования: вместо парящей таблички позиция, главное показание и состояние
 * рисуются на дисплее самого аппарата (узлы GLB с именем info-screen*). К модели без такого экрана
 * (свой файл, условная модель) двойник крепит экран сам. Экран заливается цветом состояния.
 */

export interface ScreenReading {
  /** Короткая подпись: I, T, RH */
  short: string;
  text: string;
  level: 'normal' | 'warning' | 'alarm';
}

export interface ScreenInfo {
  title: string;
  value: string;
  state: DisplayState;
  /** Все показания (для режима «все показания») */
  readings?: ScreenReading[];
}

export interface DrawOptions {
  content: 'main' | 'all' | 'state';
  showTitle: boolean;
}
export const DEFAULT_DRAW: DrawOptions = { content: 'main', showTitle: true };

/** Заливка экрана по состоянию: всё хорошо — зелёный, тревога — красный (текст подобран для читаемости) */
export const SCREEN_COLORS: Record<DisplayState, { bg: string; fg: string; sub: string }> = {
  running: { bg: '#1c8a4c', fg: '#ffffff', sub: '#d5f5e3' },
  warning: { bg: '#e2a500', fg: '#1d1500', sub: '#3d2e00' },
  alarm: { bg: '#d22b2b', fg: '#ffffff', sub: '#ffe0e0' },
  stopped: { bg: '#5d6a73', fg: '#ffffff', sub: '#e1e7eb' },
  maintenance: { bg: '#5a4bc6', fg: '#ffffff', sub: '#e6e2ff' },
  no_comm: { bg: '#7c3a71', fg: '#ffffff', sub: '#f3dcef' },
  no_sensors: { bg: '#3e505d', fg: '#ffffff', sub: '#d9e3ea' },
  data_only: { bg: '#1f6a8f', fg: '#ffffff', sub: '#d8edf7' },
  decommissioned: { bg: '#3a3f44', fg: '#ffffff', sub: '#d0d4d8' },
};

/** Все показания оборудования для экрана */
export function allReadings(eq: Equipment, live: EngineSnapshot | null | undefined): ScreenReading[] {
  const out: ScreenReading[] = [];
  // У каждого типа свой набор сигналов
  if (eq.server) {
    for (const s of sensorsOf(eq.id).filter((x) => x.valueType === 'number')) {
      const v = live?.sensors[s.id];
      out.push({ short: s.short ?? s.label, text: v?.hasData && v.lastValue != null ? `${v.lastValue.toFixed(s.precision)} ${s.unit}` : '—', level: 'normal' });
    }
    return out;
  }
  for (const kind of ['current', 'temperature', 'humidity'] as const) {
    const sens = SENSOR_BY_ID[sensorId(eq.id, kind)];
    if (!sens) continue;
    const v = live?.sensors[sens.id];
    out.push({
      short: kind === 'current' ? 'I' : kind === 'temperature' ? 'T' : 'RH',
      text: v?.hasData && v.lastValue != null ? `${v.lastValue.toFixed(sens.precision)} ${sens.unit}` : '—',
      level: (v?.level as ScreenReading['level']) ?? 'normal',
    });
  }
  return out;
}

/** Главное показание: температура у печей, расстойки и вакууматора, ток — у остальных */
export function keyReading(eq: Equipment, live: EngineSnapshot | null | undefined): string {
  const sens = keySensorOf(eq);
  if (!sens) return eq.model ? eq.model : 'датчики не подключены';
  const v = live?.sensors[sens.id];
  return v?.hasData && v.lastValue != null ? `${sens.label}: ${v.lastValue.toFixed(sens.precision)} ${sens.unit}` : `${sens.label}: нет данных`;
}

export type ScreenSource = 'own' | 'auto';

/**
 * Сетки живых экранов по оборудованию: own — экран из самой модели (info-screen*), auto — экран,
 * который двойник крепит к модели без своего экрана. Камера при выборе подлетает к own, иначе к auto.
 */
const meshes = new Map<EquipmentId, Partial<Record<ScreenSource, THREE.Mesh[]>>>();
export const screenMeshes = {
  get(id: EquipmentId): THREE.Mesh[] | undefined {
    const m = meshes.get(id);
    return m?.own?.length ? m.own : m?.auto;
  },
  set(id: EquipmentId, src: ScreenSource, list: THREE.Mesh[]) {
    meshes.set(id, { ...meshes.get(id), [src]: list });
  },
  delete(id: EquipmentId, src: ScreenSource) {
    const m = { ...meshes.get(id) };
    delete m[src];
    if (m.own || m.auto) meshes.set(id, m);
    else meshes.delete(id);
  },
};

/** Какие экраны есть у оборудования: свой (из модели) и/или прикреплённый двойником */
export const useInfoScreens = create<{ own: Record<EquipmentId, true>; auto: Record<EquipmentId, true> }>(() => ({ own: {}, auto: {} }));
export function setHasScreen(id: EquipmentId, has: boolean, src: ScreenSource = 'own') {
  const cur = useInfoScreens.getState()[src];
  if (!!cur[id] === has) return;
  const next = { ...cur };
  if (has) next[id] = true;
  else delete next[id];
  useInfoScreens.setState({ [src]: next } as Partial<{ own: Record<EquipmentId, true>; auto: Record<EquipmentId, true> }>);
}

/** Подобрать шрифт, чтобы текст влез в ширину */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, maxPx: number, maxW: number) {
  let size = maxPx;
  for (; size > 8; size -= 1) {
    ctx.font = `${weight} ${size}px "IBM Plex Sans Condensed", "Arial Narrow", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

/** Нарисовать содержимое экрана: заливка цветом состояния, содержимое — по настройкам */
export function drawScreen(canvas: HTMLCanvasElement, info: ScreenInfo, opts: DrawOptions = DEFAULT_DRAW) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const meta = STATE_META[info.state] ?? STATE_META.no_comm;
  const col = SCREEN_COLORS[info.state] ?? SCREEN_COLORS.no_comm;
  const noComm = info.state === 'no_comm';
  ctx.fillStyle = col.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(3, H * 0.025);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  const pad = W * 0.05;
  const inner = W - pad * 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const value = noComm ? '— — —' : info.value.replace(/^[^:]+:\s*/, '');
  const valueLabel = info.value.includes(':') ? info.value.split(':')[0] : '';
  const stateText = `${meta.glyph} ${meta.label}`;
  const wide = W / H > 2.6;

  // строки содержимого: [текст, вес, доля высоты, цвет]
  type Row = { text: string; weight: number; size: number; color: string };
  const rows: Row[] = [];
  if (opts.showTitle) rows.push({ text: info.title, weight: 600, size: 1, color: col.sub });
  if (opts.content === 'state') {
    rows.push({ text: stateText, weight: 700, size: 2.2, color: col.fg });
  } else if (opts.content === 'all' && info.readings?.length && !noComm) {
    const line = info.readings.map((r) => `${r.short} ${r.text}`);
    if (wide) rows.push({ text: line.join('   '), weight: 700, size: 1.6, color: col.fg });
    else for (const l of line) rows.push({ text: l, weight: 700, size: 1.35, color: col.fg });
    rows.push({ text: stateText, weight: 600, size: 1, color: col.fg });
  } else {
    if (valueLabel && !noComm && !wide) rows.push({ text: valueLabel, weight: 500, size: 0.75, color: col.sub });
    rows.push({ text: value, weight: 700, size: 2, color: col.fg });
    rows.push({ text: stateText, weight: 600, size: 1, color: col.fg });
  }

  if (wide && opts.content !== 'all') {
    // узкий широкий экран — одна строка: позиция | значение | состояние
    const cy = H / 2;
    const cells = rows.filter((r) => r.size !== 0.75);
    const n = cells.length;
    cells.forEach((r, i) => {
      const cw = inner / n;
      ctx.fillStyle = r.color;
      fit(ctx, r.text, r.weight, H * (r.size >= 2 ? 0.58 : 0.36), cw * 0.96);
      ctx.fillText(r.text, pad + cw * (i + 0.5), cy);
    });
    return;
  }
  const total = rows.reduce((a, r) => a + r.size, 0);
  const unit = (H * 0.84) / total;
  let y = H * 0.08;
  for (const r of rows) {
    const h = unit * r.size;
    ctx.fillStyle = r.color;
    fit(ctx, r.text, r.weight, h * 0.82, inner);
    ctx.fillText(r.text, W / 2, y + h / 2);
    y += h;
  }
}

/** Создать холст и текстуру под размер экрана (по габариту плоскости) */
export function makeScreenTexture(mesh: THREE.Mesh) {
  // после загрузки GLB у геометрии нет параметров PlaneGeometry — размер берём по габариту (плоскость XY)
  const geo = mesh.geometry as THREE.BufferGeometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = Math.max(1e-3, (bb.max.x - bb.min.x) * Math.abs(mesh.scale.x));
  const h = Math.max(1e-3, (bb.max.y - bb.min.y) * Math.abs(mesh.scale.y));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(96, Math.min(768, Math.round((512 * h) / w)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mesh.material = mat;
  return { canvas, tex, mat };
}

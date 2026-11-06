import { create } from 'zustand';
import { LAYOUT, type WallKind } from '../domain/layout';
import { toast } from '../store/appStore';
import { downloadText } from '../utils/csv';
import type { WallsData } from '../api/types';

/**
 * Редактируемые стены. Исходные — из проекта (plant-layout.json).
 * Изменения уходят через setWallsPersistHook на сервер (см. serverWalls.ts), данные приходят в applyWallsData.
 */

export interface EditWall {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  t: number;
  kind: WallKind;
}

/** Колонна каркаса. id: C0001… — из проекта (по сетке осей) */
export interface EditColumn {
  id: string;
  x: number;
  z: number;
}

/** Снимок для отмены: стены и колонны вместе */
interface Snapshot {
  walls: EditWall[];
  columns: EditColumn[];
}

export type WallTool = 'select' | 'draw' | 'erase';

export const isColumnId = (id: string | null | undefined) => !!id && id.startsWith('C');

export const WALL_KIND_LABEL: Record<WallKind, string> = {
  outer: 'Наружная',
  inner: 'Внутренняя',
  new: 'Новая перегородка',
  partition: 'Перегородка АБК',
};

const MAX_UNDO = 100;
const GRID = 0.1;
const MAGNET = 0.35;

function baseColumns(): EditColumn[] {
  return LAYOUT.columns.map(([x, z], i) => ({ id: `C${String(i + 1).padStart(4, '0')}`, x, z }));
}

function baseWalls(): EditWall[] {
  return LAYOUT.walls.map(([x1, z1, x2, z2, t, kind], i) => ({
    id: `W${String(i + 1).padStart(4, '0')}`,
    x1, z1, x2, z2, t, kind,
  }));
}

interface WallsState {
  walls: EditWall[];
  columns: EditColumn[];
  editMode: boolean;
  tool: WallTool;
  selected: string | null;
  hover: string | null;
  snapGrid: boolean;
  ortho: boolean;
  magnet: boolean;
  newKind: WallKind;
  newThickness: number;
  drawStart: [number, number] | null;
  cursor: [number, number] | null;
  undo: Snapshot[];
  redo: Snapshot[];
  /** Сколько изменений относительно проекта (для подсказки) */
  modified: boolean;
  topViewNonce: number;
  seq: number;
}

export const useWalls = create<WallsState>(() => ({
  walls: baseWalls(),
  columns: baseColumns(),
  editMode: false,
  tool: 'select',
  selected: null,
  hover: null,
  snapGrid: true,
  ortho: true,
  magnet: true,
  newKind: 'new',
  newThickness: 0.12,
  drawStart: null,
  cursor: null,
  undo: [],
  redo: [],
  modified: false,
  topViewNonce: 0,
  seq: 1,
}));

/** Куда передавать изменения: на сервер (см. serverWalls.ts) */
let persistHook: ((data: WallsData) => void) | null = null;

export function setWallsPersistHook(hook: (data: WallsData) => void) {
  persistHook = hook;
}

/**
 * Показать стены, пришедшие с сервера или из кэша. null — на сервере стен нет, берём стены проекта.
 * Это не правка: история отмены очищается, на сервер ничего не отправляется.
 */
export function applyWallsData(data: WallsData | null) {
  useWalls.setState({
    walls: data ? data.walls : baseWalls(),
    columns: data ? data.columns : baseColumns(),
    seq: data ? data.seq : 1,
    modified: !!data,
    undo: [],
    redo: [],
    selected: null,
    hover: null,
    drawStart: null,
  });
}

function persist() {
  const { walls, columns, seq } = useWalls.getState();
  persistHook?.({ walls, columns, seq });
}

const snap = (s: WallsState): Snapshot => ({ walls: s.walls, columns: s.columns });

/** Зафиксировать новое состояние с записью в историю отмены */
function commit(next: EditWall[], prev?: EditWall[], nextColumns?: EditColumn[]) {
  const s = useWalls.getState();
  const before: Snapshot = { walls: prev ?? s.walls, columns: s.columns };
  useWalls.setState({
    walls: next,
    columns: nextColumns ?? s.columns,
    undo: [...s.undo, before].slice(-MAX_UNDO),
    redo: [],
    modified: true,
  });
  persist();
}

// ---------------------------------------------------------------- режим и инструменты

export function setWallEditMode(on: boolean) {
  useWalls.setState({ editMode: on, selected: null, hover: null, drawStart: null, cursor: null, tool: 'select' });
}
export function setWallTool(tool: WallTool) {
  useWalls.setState({ tool, drawStart: null, cursor: tool === 'draw' ? useWalls.getState().cursor : null, selected: tool === 'select' ? useWalls.getState().selected : null });
}
export function selectWall(id: string | null) {
  useWalls.setState({ selected: id });
}
export function requestTopView() {
  useWalls.setState((s) => ({ topViewNonce: s.topViewNonce + 1 }));
}
export function setWallOption(p: Partial<Pick<WallsState, 'snapGrid' | 'ortho' | 'magnet' | 'newKind' | 'newThickness'>>) {
  useWalls.setState(p);
}

// ---------------------------------------------------------------- привязки

const r1 = (v: number) => Math.round(v * 1000) / 1000;

/** Привязка точки: к концам других стен (магнит), иначе к сетке 0,1 м */
export function snapPoint(x: number, z: number, exclude?: string): [number, number] {
  const s = useWalls.getState();
  if (s.magnet) {
    let best: [number, number] | null = null;
    let bd = MAGNET * MAGNET;
    for (const w of s.walls) {
      if (w.id === exclude) continue;
      for (const [px, pz] of [[w.x1, w.z1], [w.x2, w.z2]] as [number, number][]) {
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) {
          bd = d;
          best = [px, pz];
        }
      }
    }
    if (best) return best;
  }
  if (s.snapGrid) return [Math.round(x / GRID) * GRID, Math.round(z / GRID) * GRID].map(r1) as [number, number];
  return [r1(x), r1(z)];
}

/** Ортогональность: точка (x,z) выравнивается по горизонтали или вертикали относительно опорной */
export function orthoFrom(ax: number, az: number, x: number, z: number): [number, number] {
  if (!useWalls.getState().ortho) return [x, z];
  return Math.abs(x - ax) >= Math.abs(z - az) ? [x, az] : [ax, z];
}

// ---------------------------------------------------------------- операции

export function wallLength(w: EditWall) {
  return Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
}

export function createWall(x1: number, z1: number, x2: number, z2: number): EditWall | null {
  if (Math.hypot(x2 - x1, z2 - z1) < 0.2) return null;
  const s = useWalls.getState();
  const w: EditWall = { id: `N${String(s.seq).padStart(4, '0')}`, x1, z1, x2, z2, t: s.newThickness, kind: s.newKind };
  useWalls.setState({ seq: s.seq + 1 });
  commit([...s.walls, w]);
  return w;
}

export function deleteWall(id: string) {
  const s = useWalls.getState();
  if (!s.walls.some((w) => w.id === id)) return;
  commit(s.walls.filter((w) => w.id !== id));
  useWalls.setState({ selected: s.selected === id ? null : s.selected, hover: null });
}

export function deleteColumn(id: string) {
  const s = useWalls.getState();
  if (!s.columns.some((c) => c.id === id)) return;
  commit(s.walls, undefined, s.columns.filter((c) => c.id !== id));
  useWalls.setState({ selected: s.selected === id ? null : s.selected, hover: null });
}

/** Удалить выбранный объект (стену или колонну) */
export function deleteSelected() {
  const id = useWalls.getState().selected;
  if (!id) return;
  if (isColumnId(id)) deleteColumn(id);
  else deleteWall(id);
}

export function updateWall(id: string, patch: Partial<Omit<EditWall, 'id'>>) {
  const s = useWalls.getState();
  commit(s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}

/** Изменить длину, сохранив начало и направление */
export function setWallLength(id: string, len: number) {
  const w = useWalls.getState().walls.find((x) => x.id === id);
  if (!w || !(len >= 0.2)) return;
  const cur = wallLength(w) || 1;
  const k = len / cur;
  updateWall(id, { x2: r1(w.x1 + (w.x2 - w.x1) * k), z2: r1(w.z1 + (w.z2 - w.z1) * k) });
}

// ---- перетаскивание: временные изменения без истории, фиксация в конце
let dragSnapshot: EditWall[] | null = null;

export function beginWallDrag() {
  dragSnapshot = useWalls.getState().walls;
}
export function dragWall(id: string, mutate: (w: EditWall) => EditWall) {
  useWalls.setState((s) => ({ walls: s.walls.map((w) => (w.id === id ? mutate(w) : w)) }));
}
export function endWallDrag() {
  if (!dragSnapshot) return;
  const prev = dragSnapshot;
  dragSnapshot = null;
  const cur = useWalls.getState().walls;
  if (cur !== prev && JSON.stringify(cur) !== JSON.stringify(prev)) commit(cur, prev);
  else useWalls.setState({ walls: prev });
}

export function undoWalls() {
  const s = useWalls.getState();
  const prev = s.undo[s.undo.length - 1];
  if (!prev) return;
  useWalls.setState({
    walls: prev.walls,
    columns: prev.columns,
    undo: s.undo.slice(0, -1),
    redo: [...s.redo, snap(s)].slice(-MAX_UNDO),
    modified: true,
    selected: keepSelection(prev, s.selected),
  });
  persist();
}
export function redoWalls() {
  const s = useWalls.getState();
  const next = s.redo[s.redo.length - 1];
  if (!next) return;
  useWalls.setState({
    walls: next.walls,
    columns: next.columns,
    redo: s.redo.slice(0, -1),
    undo: [...s.undo, snap(s)].slice(-MAX_UNDO),
    modified: true,
    selected: keepSelection(next, s.selected),
  });
  persist();
}

function keepSelection(sn: Snapshot, sel: string | null) {
  if (!sel) return null;
  return (isColumnId(sel) ? sn.columns.some((c) => c.id === sel) : sn.walls.some((w) => w.id === sel)) ? sel : null;
}

/** Вернуть стены и колонны по проекту (с возможностью отмены в текущем сеансе) */
export function resetWallsToProject() {
  const s = useWalls.getState();
  useWalls.setState({ walls: baseWalls(), columns: baseColumns(), undo: [...s.undo, snap(s)].slice(-MAX_UNDO), redo: [], selected: null, modified: false });
  persist();
  toast('Стены и колонны возвращены по проекту');
}

export function wallStats() {
  const { walls } = useWalls.getState();
  const base = new Map(baseWalls().map((w) => [w.id, w]));
  let added = 0;
  let changed = 0;
  const ids = new Set<string>();
  for (const w of walls) {
    ids.add(w.id);
    const b = base.get(w.id);
    if (!b) added++;
    else if (b.x1 !== w.x1 || b.z1 !== w.z1 || b.x2 !== w.x2 || b.z2 !== w.z2 || b.t !== w.t || b.kind !== w.kind) changed++;
  }
  let removed = 0;
  for (const id of base.keys()) if (!ids.has(id)) removed++;
  const { columns } = useWalls.getState();
  const colIds = new Set(columns.map((c) => c.id));
  const columnsRemoved = baseColumns().filter((c) => !colIds.has(c.id)).length;
  return { total: walls.length, added, changed, removed, columns: columns.length, columnsRemoved };
}

// ---------------------------------------------------------------- экспорт / импорт

export function exportWallsJson() {
  const { walls, columns } = useWalls.getState();
  const data = {
    format: 'bakery-twin/walls@1',
    source: LAYOUT.source.sheet,
    coordinates: 'метры; начало — пересечение осей 1 и А; X — на восток, Z — к оси Н со знаком минус',
    exportedAt: new Date().toISOString(),
    stats: wallStats(),
    walls,
    columns,
  };
  void downloadText(`steny_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json').then((ok) => {
    if (ok) toast(`Стены выгружены: ${walls.length}`);
  });
}

const KINDS: WallKind[] = ['outer', 'inner', 'new', 'partition'];

export async function importWallsJson(file: File): Promise<string | null> {
  try {
    const data = JSON.parse(await file.text()) as { walls?: unknown; columns?: unknown };
    const list = Array.isArray(data.walls) ? data.walls : null;
    if (!list || !list.length) return 'В файле нет списка стен (walls)';
    const out: EditWall[] = [];
    let maxSeq = 0;
    for (const raw of list as Record<string, unknown>[]) {
      const n = (k: string) => (typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? (raw[k] as number) : NaN);
      const w: EditWall = {
        id: typeof raw.id === 'string' ? raw.id : `N${String(out.length + 1).padStart(4, '0')}`,
        x1: n('x1'), z1: n('z1'), x2: n('x2'), z2: n('z2'),
        t: n('t'),
        kind: KINDS.includes(raw.kind as WallKind) ? (raw.kind as WallKind) : 'new',
      };
      if ([w.x1, w.z1, w.x2, w.z2, w.t].some((v) => Number.isNaN(v))) return `Стена ${w.id}: неверные координаты или толщина`;
      if (w.id.startsWith('N')) maxSeq = Math.max(maxSeq, Number(w.id.slice(1)) || 0);
      out.push(w);
    }
    // колонны — необязательны (в старых файлах их нет): тогда колонны остаются как есть
    let cols: EditColumn[] | undefined;
    if (Array.isArray(data.columns)) {
      cols = [];
      for (const raw of data.columns as Record<string, unknown>[]) {
        const x = raw.x, z = raw.z;
        if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return 'Неверные координаты колонны в файле';
        cols.push({ id: typeof raw.id === 'string' ? raw.id : `C${String(cols.length + 1).padStart(4, '0')}`, x, z });
      }
    }
    commit(out, undefined, cols);
    useWalls.setState({ seq: maxSeq + 1, selected: null });
    toast(`Загружено стен: ${out.length}${cols ? `, колонн: ${cols.length}` : ''}`);
    return null;
  } catch {
    return 'Не удалось прочитать файл: нужен JSON, выгруженный из редактора стен';
  }
}

// Отладочный доступ для автотестов
(window as unknown as Record<string, unknown>).__twinWalls = () => useWalls.getState().walls;
(window as unknown as Record<string, unknown>).__twinColumns = () => useWalls.getState().columns;

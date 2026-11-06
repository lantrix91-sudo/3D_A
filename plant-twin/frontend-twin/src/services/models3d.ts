import miweUrl from '../../models/miwe-roll-in-e-plus.glb?url';
import debagUrl from '../../models/debag-monsun-s5.glb?url';
import ovenZfUrl from '../../models/oven-zf.glb?url';
import weberUrl from '../../models/weber-cooling.glb?url';
import unifillerUrl from '../../models/unifiller-depositor.glb?url';
import konigUrl from '../../models/konig-mini-rex-futura.glb?url';
import debagSfUrl from '../../models/debag-ka-sf2-eco.glb?url';
import prooferRoomUrl from '../../models/proofer-room.glb?url';
import mceUrl from '../../models/mce-proofer.glb?url';
import kemperUrl from '../../models/kemper-st75a.glb?url';
import sinmagUrl from '../../models/sinmag-dc6r.glb?url';
import teknoUrl from '../../models/teknostamap-tk2-80.glb?url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { create } from 'zustand';
import type { PlanAsset } from '../api/types';
import type { Equipment, Model3D } from '../domain/types';
import { assetModelId } from './planMapper';
import type { Repository } from '../storage/repository';
import { newId } from '../utils/id';

/**
 * 3D-модели оборудования (GLB / glTF с вложенными данными). Файл хранится в IndexedDB как Blob
 * (ключ meta `model3d:<id>`), в сцену подаётся через object URL.
 */

export const MAX_MODEL_BYTES = 50 * 1024 * 1024;
export const UNIT_SCALE = { m: 1, cm: 0.01, mm: 0.001 } as const;
export type ModelUnit = keyof typeof UNIT_SCALE;

export interface ModelCheck {
  ok: boolean;
  error?: string;
  warning?: string;
  /** Габариты в единицах файла */
  rawDims?: [number, number, number];
  meshes?: number;
  triangles?: number;
  suggestedUnit?: ModelUnit;
}

interface LoadedModel {
  url: string;
  scale: number;
  dims: [number, number, number];
  fileName: string;
  /** Не центрировать модель. Точка установки — начало координат GLB, как в старом фронтенде */
  keepOrigin?: boolean;
  /** Смещение центра корпуса от точки установки (x, z), м */
  center?: [number, number];
  /** Узел GLB, который окрашивается в цвет статуса (asset.led_node_name) */
  statusNode?: string;
}

/** Ошибки загрузки 3D-моделей по оборудованию — показываются в карточке, чтобы причина была видна */
export const useModelErrors = create<{ byId: Record<string, string> }>(() => ({ byId: {} }));
export function reportModelError(eqId: string, msg: string | null) {
  const cur = useModelErrors.getState().byId;
  if ((cur[eqId] ?? null) === msg) return;
  const byId = { ...cur };
  if (msg) byId[eqId] = msg;
  else delete byId[eqId];
  useModelErrors.setState({ byId });
}

/** Загруженные в сеанс модели: id → URL и габариты */
export const useModels = create<{ byId: Record<string, LoadedModel | 'missing'> }>(() => ({ byId: {} }));

let repo: Repository | null = null;
const metaKey = (id: string) => `model3d:${id}`;

export function initModels(r: Repository) {
  repo = r;
}

/** Разобрать файл и посчитать габариты; ничего не сохраняет */
export async function inspectModelFile(file: File): Promise<ModelCheck> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
    return { ok: false, error: 'Нужен файл GLB (.glb) или glTF (.gltf) со встроенными данными' };
  }
  if (file.size > MAX_MODEL_BYTES) {
    return { ok: false, error: `Файл ${(file.size / 1048576).toFixed(1)} МБ — больше допустимых 50 МБ. Упростите модель или сожмите текстуры` };
  }
  if (file.size === 0) return { ok: false, error: 'Файл пустой' };
  try {
    const buf = await file.arrayBuffer();
    const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) =>
      new GLTFLoader().parse(buf, '', resolve as never, reject),
    );
    let meshes = 0;
    let triangles = 0;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        const g = m.geometry as THREE.BufferGeometry;
        triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      }
    });
    if (!meshes) return { ok: false, error: 'В файле нет ни одной сетки (mesh) — модель пустая' };
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const rawDims: [number, number, number] = [size.x, size.y, size.z];
    const maxDim = Math.max(...rawDims);
    // эвристика единиц: оборудование цеха обычно 0,3–15 м
    const suggestedUnit: ModelUnit = maxDim > 300 ? 'mm' : maxDim > 30 ? 'cm' : 'm';
    const warning = triangles > 500_000
      ? `Модель тяжёлая (${Math.round(triangles / 1000)} тыс. треугольников) — сцена может работать медленнее`
      : undefined;
    return { ok: true, rawDims, meshes, triangles: Math.round(triangles), suggestedUnit, warning };
  } catch (e) {
    console.warn('[models] файл не прочитан', e);
    return {
      ok: false,
      error: 'Не удалось прочитать модель. Если это .gltf с отдельными файлами (.bin, текстуры) — сохраните её как один .glb',
    };
  }
}

export async function saveModelFile(file: File, unit: ModelUnit, rawDims: [number, number, number]): Promise<Model3D> {
  if (!repo) throw new Error('Хранилище не готово');
  const scale = UNIT_SCALE[unit];
  const rec: Model3D = {
    id: newId('M3D'),
    fileName: file.name,
    size: file.size,
    scale,
    dims: rawDims.map((v) => Math.round(v * scale * 1000) / 1000) as [number, number, number],
    uploadedAt: Date.now(),
    blob: file.slice(0, file.size, 'model/gltf-binary'),
  };
  await repo.setMeta(metaKey(rec.id), rec);
  register(rec);
  return rec;
}

export async function deleteModel(id: string | null | undefined) {
  if (!id || !repo) return;
  await repo.setMeta(metaKey(id), null);
  const cur = useModels.getState().byId[id];
  if (cur && cur !== 'missing') URL.revokeObjectURL(cur.url);
  useModels.setState((s) => {
    const byId = { ...s.byId };
    delete byId[id];
    return { byId };
  });
}

function register(rec: Model3D) {
  const url = URL.createObjectURL(rec.blob);
  useModels.setState((s) => ({ byId: { ...s.byId, [rec.id]: { url, scale: rec.scale, dims: rec.dims, fileName: rec.fileName } } }));
}

/** Подгрузить модели, на которые ссылается оборудование */
export async function loadModels(ids: string[]) {
  if (!repo) return;
  for (const id of ids) {
    if (useModels.getState().byId[id]) continue;
    try {
      const rec = await repo.getMeta<Model3D | null>(metaKey(id));
      if (rec?.blob) register(rec);
      else useModels.setState((s) => ({ byId: { ...s.byId, [id]: 'missing' } }));
    } catch (e) {
      console.warn('[models] не загружена', id, e);
      useModels.setState((s) => ({ byId: { ...s.byId, [id]: 'missing' } }));
    }
  }
}

/**
 * Встроенные модели (собраны по фото заказчика, лежат в models/ и попадают в сборку).
 * Используются, пока для оборудования не загружен свой файл.
 */
export const BUILTIN_MODELS: Record<string, LoadedModel> = {
  'miwe-roll-in-e-plus': { url: miweUrl, scale: 1, dims: [1.55, 2.56, 1.6], fileName: 'miwe-roll-in-e-plus.glb (встроенная)' },
  'debag-monsun-s5': { url: debagUrl, scale: 1, dims: [1.35, 2.935, 2.96], fileName: 'debag-monsun-s5.glb (встроенная)' },
  'oven-zf': { url: ovenZfUrl, scale: 1, dims: [1.33, 2.33, 2.05], fileName: 'oven-zf.glb (встроенная)' },
  'teknostamap-tk2-80': { url: teknoUrl, scale: 1, dims: [0.986, 1.842, 1.069], fileName: 'teknostamap-tk2-80.glb (встроенная)' },
  'sinmag-dc6r': { url: sinmagUrl, scale: 1, dims: [2.19, 2.3, 2.0], fileName: 'sinmag-dc6r.glb (встроенная)' },
  'kemper-st75a': { url: kemperUrl, scale: 1, dims: [0.98, 1.32, 1.5], fileName: 'kemper-st75a.glb (встроенная)' },
  'weber-cooling': { url: weberUrl, scale: 1, dims: [1.94, 2.26, 2.02], fileName: 'weber-cooling.glb (встроенная)' },
  'unifiller-depositor': { url: unifillerUrl, scale: 1, dims: [1.55, 1.88, 0.99], fileName: 'unifiller-depositor.glb (встроенная)' },
  'konig-mini-rex-futura': { url: konigUrl, scale: 1, dims: [1.755, 1.79, 0.63], fileName: 'konig-mini-rex-futura.glb (встроенная)' },
  'debag-ka-sf2-eco': { url: debagSfUrl, scale: 1, dims: [2.1, 2.17, 1.7], fileName: 'debag-ka-sf2-eco.glb (встроенная)' },
  'proofer-room': { url: prooferRoomUrl, scale: 1, dims: [2.24, 2.63, 3.4], fileName: 'proofer-room.glb (встроенная)' },
  'mce-proofer': { url: mceUrl, scale: 1, dims: [0.95, 2.44, 1.35], fileName: 'mce-proofer.glb (встроенная)' },
};

/** Модель, которую показывает сцена: загруженная пользователем, иначе встроенная, иначе null (условная) */
export function effectiveModel(eq: Pick<Equipment, 'modelAsset' | 'builtinModel'>): LoadedModel | null {
  return modelInfo(eq.modelAsset) ?? (eq.builtinModel ? BUILTIN_MODELS[eq.builtinModel] ?? null : null);
}

export function modelInfo(id: string | null | undefined): LoadedModel | null {
  if (!id) return null;
  const m = useModels.getState().byId[id];
  return m && m !== 'missing' ? m : null;
}

// ---------------------------------------------------------------- модели с сервера

/** Зарегистрировать GLB из плана. Размеры в базе часто условные (1×1×1), поэтому это только начальное значение */
export function registerServerModel(asset: PlanAsset | null) {
  if (!asset?.url) return;
  const id = assetModelId(asset.code);
  const cur = useModels.getState().byId[id];
  if (cur && cur !== 'missing' && cur.url === asset.url) return;
  useModels.setState((s) => ({
    byId: {
      ...s.byId,
      [id]: {
        url: asset.url!,
        scale: 1,
        dims: [asset.size.x, asset.size.y, asset.size.z],
        fileName: asset.url!.split('/').pop() ?? asset.code,
        keepOrigin: true,
        statusNode: asset.led_node_name,
      },
    },
  }));
}

/** Модель загрузилась: заменяем условные размеры настоящими, по ним строятся рамка на полу и зона щелчка */
export function reportModelSize(id: string, dims: [number, number, number], center: [number, number]) {
  const cur = useModels.getState().byId[id];
  if (!cur || cur === 'missing') return;
  const same = cur.center && cur.dims.every((v, i) => Math.abs(v - dims[i]) < 0.01) && cur.center.every((v, i) => Math.abs(v - center[i]) < 0.01);
  if (same) return;
  useModels.setState((s) => ({ byId: { ...s.byId, [id]: { ...cur, dims, center } } }));
}

// ---------------------------------------------------------------- габариты для сцены

// габарит корпуса условных моделей в плане (ширина, глубина), м
const FOOT: Record<Equipment['kind'], [number, number]> = {
  proofer: [1.88, 1.23],
  mixer: [0.76, 0.97],
  kneader: [0.99, 1.34],
  oven: [2.2, 2.0],
  cooler: [1.9, 2.0],
  generic: [1.0, 1.0],
};
const HEIGHT: Record<Equipment['kind'], number> = { proofer: 2.4, mixer: 1.6, kneader: 1.55, oven: 3.1, cooler: 2.2, generic: 1.4 };

/** Сдвиг условной модели, чтобы её корпус стоял по центру габарита (замер по сцене), м */
export const PROCEDURAL_OFFSET: Partial<Record<Equipment['kind'], [number, number]>> = {
  proofer: [-0.19, -0.0375],
  mixer: [0, 0.015],
  kneader: [0, 0.0275],
};

/** Габарит оборудования (ширина, глубина, высота) — ровно по корпусу модели, без запаса */
export function equipmentSize(eq: Equipment): { w: number; d: number; h: number } {
  const m = effectiveModel(eq);
  if (m) {
    const [x, y, z] = m.dims;
    return { w: Math.max(0.2, x), d: Math.max(0.2, z), h: Math.max(0.3, y) };
  }
  // Файла модели нет: размер запасной коробки задан на сервере
  if (eq.server) return { ...eq.server.fallbackSize };
  const [w, d] = FOOT[eq.kind];
  return { w, d, h: HEIGHT[eq.kind] };
}

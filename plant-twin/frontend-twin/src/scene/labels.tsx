import { useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { EQUIPMENT, EQUIPMENT_BY_ID } from '../domain/config';
import { allReadings, keyReading } from './infoScreen';
import { isLabelPinned, isLabelShown, labelOpacity, useLabelMode } from './labelMode';
import type { DisplayState, EquipmentId } from '../domain/types';
import { getPose, selectEquipment } from '../services/telemetryHub';
import { useWalls } from '../services/walls';
import { useApp } from '../store/appStore';
import { STATE_META } from '../ui/common/stateMeta';
import { useDisplayStates } from '../ui/common/useDerived';
import { equipmentSize } from '../services/models3d';
import { findCollision } from '../services/collision';
import { useRegistry } from '../domain/config';

/**
 * Подписи оборудования — DOM-слой поверх canvas. Позиции и прозрачность считаются в цикле рендера
 * проекцией 3D-точки на экран (без перерисовки React), но только когда сдвинулась камера, станок
 * или перерисовались сами подписи. Содержимое — из состояния приложения.
 */

export const useSceneUi = create<{ hover: EquipmentId | null; dragging: boolean }>(() => ({ hover: null, dragging: false }));
const labelEls = new Map<EquipmentId, HTMLElement>();
/** Растёт при каждой перерисовке подписей (режим, выбор, наведение, показания): проектор пересчитает раскладку */
let labelsVersion = 0;

/** Внутри Canvas: проецирует якоря подписей */
export function LabelProjector() {
  const { camera, size } = useThree();
  const version = useRegistry((s) => s.version);
  // v — точка подписи над корпусом, c — центр оборудования (от него меряем расстояние), h — высота
  const anchors = useMemo(() => EQUIPMENT.map((e) => ({ id: e.id, v: new THREE.Vector3(NaN, 0, NaN), c: new THREE.Vector3(), h: NaN })), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const tmp = useMemo(() => new THREE.Vector3(), []);
  // Отладочный доступ для автотестов: экранные координаты корпуса оборудования и положение камеры
  useMemo(() => {
    const w = window as unknown as Record<string, unknown>;
    const v = new THREE.Vector3();
    w.__twinScreen = (id: EquipmentId) => {
      const e = EQUIPMENT.find((x) => x.id === id);
      if (!e) return null;
      const p = getPose(id);
      v.set(p.x, equipmentSize(e).h * 0.45, p.z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height };
    };
    w.__twinProject = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height };
    };
    w.__twinHitAt = (id: EquipmentId, x: number, z: number) => findCollision(id, { ...getPose(id), x, z }, getPose)?.label ?? null;
    w.__twinCollisions = () => EQUIPMENT.map((e) => [e.id, findCollision(e.id, getPose(e.id), getPose)?.label ?? null]);
    w.__twinCamera = () => camera.position.toArray().map((n) => Math.round(n * 100) / 100);
  }, [camera, size]);
  // Что было в прошлый пересчёт: если ничего не изменилось, кадр пропускаем
  const last = useMemo(() => ({ world: new THREE.Matrix4(), proj: new THREE.Matrix4(), w: 0, h: 0, labels: -1, anchors: -1 }), []);
  useFrame(() => {
    // Позиции якорей считаем всегда (дёшево, без DOM): станок могут двигать в «Расстановке»
    let anchorsMoved = last.anchors !== version;
    for (const a of anchors) {
      const eq = EQUIPMENT_BY_ID[a.id];
      if (!eq) continue;
      const p = getPose(a.id);
      const h = equipmentSize(eq).h;
      if (a.v.x !== p.x || a.v.z !== p.z || a.h !== h) {
        a.v.set(p.x, h + 0.45, p.z);
        a.c.set(p.x, h / 2, p.z);
        a.h = h;
        anchorsMoved = true;
      }
    }
    const cameraMoved = !last.world.equals(camera.matrixWorld) || !last.proj.equals(camera.projectionMatrix)
      || last.w !== size.width || last.h !== size.height;
    if (!cameraMoved && !anchorsMoved && last.labels === labelsVersion) return;
    last.world.copy(camera.matrixWorld);
    last.proj.copy(camera.projectionMatrix);
    last.w = size.width;
    last.h = size.height;
    last.labels = labelsVersion;
    last.anchors = version;

    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items: { el: HTMLElement; x: number; y: number; z: number; far: boolean; full: boolean }[] = [];
    for (const a of anchors) {
      const el = labelEls.get(a.id);
      if (!el) continue;
      // расстояние от камеры до оборудования: дальше порога подпись гаснет (кроме закреплённых)
      const dist = camera.position.distanceTo(a.c);
      const opacity = labelOpacity(dist, el.dataset.pinned === '1');
      tmp.copy(a.v).project(camera);
      const onScreen = tmp.z < 1 && tmp.z > -1 && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3;
      const visible = onScreen && opacity > 0;
      el.style.visibility = visible ? 'visible' : 'hidden';
      // скрытые не участвуют в раздвигании: не занимают место и не сдвигают видимые
      if (!visible) continue;
      const op = opacity >= 1 ? '' : opacity.toFixed(2);
      if (el.style.opacity !== op) el.style.opacity = op;
      items.push({
        el,
        x: (tmp.x * 0.5 + 0.5) * size.width,
        y: (-tmp.y * 0.5 + 0.5) * size.height,
        z: tmp.z,
        far: camera.position.distanceTo(a.v) > 45,
        full: el.classList.contains('is-full'),
      });
    }
    // раздвигаем пересекающиеся подписи: сначала вверх, у верхнего края — вбок.
    // Полные карточки (выбор, наведение) ставим первыми: их не сдвигают соседи, и карточка
    // не «убегает» из-под курсора, иначе наведение мигало бы
    items.sort((a, b) => Number(b.full) - Number(a.full) || b.y - a.y);
    for (const it of items) {
      if (it.el.classList.contains('is-far') !== it.far) it.el.classList.toggle('is-far', it.far);
      const w = it.el.offsetWidth;
      const h = it.el.offsetHeight;
      let top = Math.max(4, it.y - h);
      let cx = it.x;
      const collide = () => placed.find((r) => Math.abs(r.x - cx) < (r.w + w) / 2 + 2 && top < r.y + r.h + 2 && top + h > r.y - 2);
      for (let guard = 0; guard < 8; guard++) {
        const hit = collide();
        if (!hit) break;
        if (hit.y - h - 4 >= 4) top = hit.y - h - 4;
        else cx = hit.x + (hit.w + w) / 2 + 4;
      }
      it.x = cx;
      placed.push({ x: it.x, y: top, w, h });
      it.el.style.transform = `translate(${(it.x - w / 2).toFixed(1)}px, ${top.toFixed(1)}px)`;
      // полная карточка — поверх компактных подписей
      it.el.style.zIndex = String(Math.round((1 - it.z) * 1000) + (it.full ? 3000 : 0));
    }
  });
  return null;
}

/** Вне Canvas: сами подписи */
(window as unknown as Record<string, unknown>).__twinPose = (id: string) => getPose(id);

export function SceneLabels() {
  // во время перетаскивания и в редакторе стен подписи не перехватывают курсор
  const dragging = useSceneUi((s) => s.dragging);
  const wallEdit = useWalls((s) => s.editMode);
  // Подписи есть у всех станков и в «Расстановке» закрывали бы соседние модели от мыши
  const placeMode = useApp((s) => s.placeMode);
  const passThrough = dragging || wallEdit || placeMode;
  useRegistry((s) => s.version);
  const states = useDisplayStates();
  const live = useApp((s) => s.live);
  const selected = useApp((s) => s.selected);
  const hover = useSceneUi((s) => s.hover);
  const mode = useLabelMode((s) => s.mode);
  // после каждой перерисовки (новые подписи, раскрытие карточки) проектор пересчитает раскладку
  useLayoutEffect(() => {
    labelsVersion++;
  });
  return (
    <div className={`scene-labels${passThrough ? ' is-passive' : ''}`} aria-label="Подписи оборудования на сцене">
      {/* По умолчанию — компактная подпись (название и точка статуса), чтобы не закрывать сцену.
          Полная карточка — у выбранного станка и под курсором. Дальние подписи гаснут (LABEL_*_DISTANCE),
          закреплённые (выбор, авария, нет связи) видны всегда; кнопка «Подписи» задаёт режим */}
      {EQUIPMENT.map((eq) => {
        const st: DisplayState = states[eq.id] ?? 'no_comm';
        const pinned = isLabelPinned(st, selected === eq.id);
        if (!isLabelShown(mode, pinned)) return null;
        const full = selected === eq.id || hover === eq.id;
        const meta = STATE_META[st];
        const readings = full ? allReadings(eq, live) : [];
        const val = readings.length ? readings.map((r) => `${r.short} ${r.text}`).join(' · ') : full ? keyReading(eq, live) : '';
        const type = eq.server?.type ?? eq.model;
        return (
          <button
            key={eq.id}
            type="button"
            ref={(el) => {
              if (el) labelEls.set(eq.id, el);
              else labelEls.delete(eq.id);
            }}
            className={`scene-label${full ? ' is-full' : ' is-compact'}${selected === eq.id ? ' is-selected' : ''}${hover === eq.id ? ' is-hover' : ''}`}
            style={{ ['--c' as string]: meta.color, visibility: 'hidden' }}
            data-pinned={pinned ? '1' : '0'}
            onClick={() => selectEquipment(eq.id)}
            onPointerEnter={() => useSceneUi.setState({ hover: eq.id })}
            onPointerLeave={() => { if (useSceneUi.getState().hover === eq.id) useSceneUi.setState({ hover: null }); }}
            aria-label={`${eq.name} ${eq.id}: ${meta.label}`}
            title={full ? undefined : `${eq.name} ${eq.id}: ${meta.label}`}
          >
            <span className="scene-label__name">
              <i className="scene-label__dot" aria-hidden="true" />
              {eq.shortName} <b>{eq.id}</b>
            </span>
            {full && (
              <>
                {type && <span className="scene-label__type">{type}</span>}
                <span className="scene-label__state"><i aria-hidden="true">{meta.glyph}</i> {meta.label}</span>
                {val && <span className="scene-label__value">{val}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

import { useFrame, useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { EQUIPMENT, EQUIPMENT_BY_ID, keySensorOf } from '../domain/config';
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
 * Подписи оборудования — DOM-слой поверх canvas. Позиции пересчитываются в каждом кадре
 * проекцией 3D-точки на экран (без перерисовки React), содержимое — из состояния приложения.
 */

export const useSceneUi = create<{ hover: EquipmentId | null; dragging: boolean }>(() => ({ hover: null, dragging: false }));
const labelEls = new Map<EquipmentId, HTMLElement>();

/** Внутри Canvas: проецирует якоря подписей */
export function LabelProjector() {
  const { camera, size } = useThree();
  const version = useRegistry((s) => s.version);
  const anchors = useMemo(() => EQUIPMENT.map((e) => ({ id: e.id, v: new THREE.Vector3() })), [version]); // eslint-disable-line react-hooks/exhaustive-deps
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
  useFrame(() => {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items: { el: HTMLElement; x: number; y: number; z: number; far: boolean }[] = [];
    for (const a of anchors) {
      const el = labelEls.get(a.id);
      if (!el) continue;
      const p = getPose(a.id);
      const eq = EQUIPMENT_BY_ID[a.id];
      if (!eq) continue;
      a.v.set(p.x, equipmentSize(eq).h + 0.45, p.z);
      tmp.copy(a.v).project(camera);
      const visible = tmp.z < 1 && tmp.z > -1 && Math.abs(tmp.x) < 1.3 && Math.abs(tmp.y) < 1.3;
      el.style.visibility = visible ? 'visible' : 'hidden';
      if (!visible) continue;
      items.push({
        el,
        x: (tmp.x * 0.5 + 0.5) * size.width,
        y: (-tmp.y * 0.5 + 0.5) * size.height,
        z: tmp.z,
        far: camera.position.distanceTo(a.v) > 45,
      });
    }
    // раздвигаем пересекающиеся подписи: сначала вверх, у верхнего края — вбок
    items.sort((a, b) => b.y - a.y);
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
      it.el.style.zIndex = String(Math.round((1 - it.z) * 1000));
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
  return (
    <div className={`scene-labels${passThrough ? ' is-passive' : ''}`} aria-label="Подписи оборудования на сцене">
      {/* Подписи есть у всех: только по ним можно найти станок на общем виде цеха */}
      {EQUIPMENT.map((eq) => {
        const st: DisplayState = states[eq.id] ?? 'no_comm';
        const meta = STATE_META[st];
        const sens = keySensorOf(eq);
        const v = sens ? live?.sensors[sens.id] : undefined;
        const val = !sens
          ? (eq.model ? eq.model : 'датчики не подключены')
          : v?.hasData && v.lastValue != null ? `${sens.label}: ${v.lastValue.toFixed(sens.precision)} ${sens.unit}` : `${sens.label}: нет данных`;
        return (
          <button
            key={eq.id}
            type="button"
            ref={(el) => {
              if (el) labelEls.set(eq.id, el);
              else labelEls.delete(eq.id);
            }}
            className={`scene-label${selected === eq.id ? ' is-selected' : ''}${hover === eq.id ? ' is-hover' : ''}`}
            style={{ ['--c' as string]: meta.color, visibility: 'hidden' }}
            onClick={() => selectEquipment(eq.id)}
            aria-label={`${eq.name} ${eq.id}: ${meta.label}`}
          >
            <span className="scene-label__name">{eq.shortName} <b>{eq.id}</b></span>
            <span className="scene-label__state"><i aria-hidden="true">{meta.glyph}</i> {meta.label}</span>
            <span className="scene-label__value">{val}</span>
          </button>
        );
      })}
    </div>
  );
}

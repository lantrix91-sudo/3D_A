import { reportWallBlocked, wallHitsEquipment } from '../services/collision';
import { getPose } from '../services/telemetryHub';
import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LAYOUT } from '../domain/layout';
import {
  beginWallDrag,
  createWall,
  deleteColumn,
  deleteWall,
  isColumnId,
  dragWall,
  endWallDrag,
  orthoFrom,
  selectWall,
  snapPoint,
  useWalls,
  type EditWall,
} from '../services/walls';
import { ACCENT_3D } from '../ui/common/stateMeta';

/**
 * Редактор стен в 3D-сцене.
 *  «Выбор»   — щелчок выбирает стену; перетаскивание стены двигает её целиком, маркеров на концах — меняет конец.
 *  «Стена»   — щелчки по полу ставят точки ломаной; каждая пара точек — новая стена. Esc / двойной щелчок /
 *              правая кнопка — закончить ломаную.
 *  «Удалить» — щелчок по стене удаляет её.
 * Привязки: сетка 0,1 м, магнит к концам стен (0,35 м), ортогональность.
 */

type Drag =
  | { type: 'move'; id: string; sx: number; sz: number; orig: EditWall }
  | { type: 'end'; id: string; which: 1 | 2 }
  | null;

const E = LAYOUT.extents;
const CX = (E.minX + E.maxX) / 2;
const CZ = (E.minZ + E.maxZ) / 2;

export function useWallEditor() {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const drag = useRef<Drag>(null);

  const lockCamera = useCallback((on: boolean) => {
    if (controls) controls.enabled = !on;
  }, [controls]);

  const onWallDown = useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    const st = useWalls.getState();
    if (!st.editMode || e.button !== 0) return;
    if (st.tool === 'erase') {
      e.stopPropagation();
      if (isColumnId(id)) deleteColumn(id);
      else deleteWall(id);
      return;
    }
    if (st.tool === 'select') {
      e.stopPropagation();
      selectWall(id);
      if (isColumnId(id)) return; // колонны только выбираются и удаляются, не перемещаются
      const w = st.walls.find((x) => x.id === id);
      if (!w) return;
      drag.current = { type: 'move', id, sx: e.point.x, sz: e.point.z, orig: w };
      beginWallDrag();
      lockCamera(true);
    }
  }, [lockCamera]);

  const onWallHover = useCallback((id: string | null) => {
    const st = useWalls.getState();
    if (!st.editMode || drag.current) return;
    if (st.hover !== id) useWalls.setState({ hover: id });
  }, []);

  const onHandleDown = useCallback((id: string, which: 1 | 2, e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { type: 'end', id, which };
    beginWallDrag();
    lockCamera(true);
  }, [lockCamera]);

  const finishDrag = useCallback(() => {
    if (!drag.current) return;
    setTimeout(() => reportWallBlocked(null), 2500);
    drag.current = null;
    endWallDrag();
    lockCamera(false);
  }, [lockCamera]);

  const onGroundMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const st = useWalls.getState();
    const d = drag.current;
    if (d?.type === 'move') {
      const dx = Math.round((e.point.x - d.sx) * 10) / 10;
      const dz = Math.round((e.point.z - d.sz) * 10) / 10;
      const o = d.orig;
      let ox = 0;
      let oz = 0;
      if (st.magnet) {
        // примагнитить ближайший конец
        const c1 = [o.x1 + dx, o.z1 + dz] as const;
        const c2 = [o.x2 + dx, o.z2 + dz] as const;
        const s1 = snapPoint(c1[0], c1[1], d.id);
        const s2 = snapPoint(c2[0], c2[1], d.id);
        const off1 = Math.hypot(s1[0] - c1[0], s1[1] - c1[1]);
        const off2 = Math.hypot(s2[0] - c2[0], s2[1] - c2[1]);
        if (off1 > 0.06 || off2 > 0.06) {
          if (off1 <= off2) { ox = s1[0] - c1[0]; oz = s1[1] - c1[1]; } else { ox = s2[0] - c2[0]; oz = s2[1] - c2[1]; }
        }
      }
      const r = (v: number) => Math.round(v * 1000) / 1000;
      dragWall(d.id, (w) => {
        const next = { ...o, x1: r(o.x1 + dx + ox), z1: r(o.z1 + dz + oz), x2: r(o.x2 + dx + ox), z2: r(o.z2 + dz + oz) };
        const hit = wallHitsEquipment(next, getPose);
        reportWallBlocked(hit ? hit.label : null);
        return hit ? w : next; // стена не проходит сквозь оборудование
      });
      return;
    }
    if (d?.type === 'end') {
      dragWall(d.id, (w) => {
        const ax = d.which === 1 ? w.x2 : w.x1;
        const az = d.which === 1 ? w.z2 : w.z1;
        const [ox, oz] = orthoFrom(ax, az, e.point.x, e.point.z);
        let [px, pz] = snapPoint(ox, oz, d.id);
        if (Math.hypot(px - ax, pz - az) < 0.2) [px, pz] = d.which === 1 ? [w.x1, w.z1] : [w.x2, w.z2];
        const next = d.which === 1 ? { ...w, x1: px, z1: pz } : { ...w, x2: px, z2: pz };
        const hit = wallHitsEquipment(next, getPose);
        reportWallBlocked(hit ? hit.label : null);
        return hit ? w : next;
      });
      return;
    }
    if (st.tool === 'draw') {
      let p: [number, number];
      if (st.drawStart) {
        const [ox, oz] = orthoFrom(st.drawStart[0], st.drawStart[1], e.point.x, e.point.z);
        p = snapPoint(ox, oz);
      } else p = snapPoint(e.point.x, e.point.z);
      const c = st.cursor;
      if (!c || c[0] !== p[0] || c[1] !== p[1]) useWalls.setState({ cursor: p });
    }
  }, []);

  const onGroundClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const st = useWalls.getState();
    if (!st.editMode || e.button !== 0 || e.delta > 4) return; // перетаскивание камеры — не щелчок
    if (st.tool === 'draw') {
      let p: [number, number];
      if (st.drawStart) {
        const [ox, oz] = orthoFrom(st.drawStart[0], st.drawStart[1], e.point.x, e.point.z);
        p = snapPoint(ox, oz);
      } else p = snapPoint(e.point.x, e.point.z);
      if (!st.drawStart) {
        useWalls.setState({ drawStart: p, cursor: p });
      } else {
        const hit = wallHitsEquipment({ x1: st.drawStart[0], z1: st.drawStart[1], x2: p[0], z2: p[1], t: st.newThickness }, getPose);
        reportWallBlocked(hit ? hit.label : null);
        if (hit) return; // новая стена прошла бы сквозь оборудование
        const w = createWall(st.drawStart[0], st.drawStart[1], p[0], p[1]);
        if (w) useWalls.setState({ drawStart: p });
      }
      return;
    }
    if (st.tool === 'select') selectWall(null);
  }, []);

  return { onWallDown, onWallHover, onHandleDown, onGroundMove, onGroundClick, finishDrag };
}

/** Визуальные элементы режима: плоскость ввода, подсветка, маркеры концов, предпросмотр новой стены */
export function WallEditorOverlay({ height, ed }: { height: number; ed: ReturnType<typeof useWallEditor> }) {
  const editMode = useWalls((s) => s.editMode);
  const walls = useWalls((s) => s.walls);
  const selected = useWalls((s) => s.selected);
  const hover = useWalls((s) => s.hover);
  const tool = useWalls((s) => s.tool);
  const drawStart = useWalls((s) => s.drawStart);
  const cursor = useWalls((s) => s.cursor);
  const newThickness = useWalls((s) => s.newThickness);
  const columns = useWalls((s) => s.columns);
  const selW = useMemo(() => walls.find((w) => w.id === selected) ?? null, [walls, selected]);
  const selC = useMemo(() => columns.find((c) => c.id === selected) ?? null, [columns, selected]);
  const hovC = useMemo(() => (hover && hover !== selected ? columns.find((c) => c.id === hover) ?? null : null), [columns, hover, selected]);
  const hovW = useMemo(() => (hover && hover !== selected ? walls.find((w) => w.id === hover) ?? null : null), [walls, hover, selected]);
  const selMat = useMemo(() => new THREE.MeshBasicMaterial({ color: ACCENT_3D, transparent: true, opacity: 0.55, depthWrite: false }), []);
  const hovMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }), []);
  const delMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.55, depthWrite: false }), []);
  const prevMat = useMemo(() => new THREE.MeshBasicMaterial({ color: ACCENT_3D, transparent: true, opacity: 0.45, depthWrite: false }), []);
  if (!editMode) return null;
  const preview = tool === 'draw' && drawStart && cursor ? { id: 'preview', x1: drawStart[0], z1: drawStart[1], x2: cursor[0], z2: cursor[1], t: newThickness, kind: 'new' as const } : null;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CX, 0.015, CZ]}
        onClick={ed.onGroundClick}
        onContextMenu={() => useWalls.setState({ drawStart: null })}
        onPointerMove={ed.onGroundMove}
        onPointerUp={ed.finishDrag}
        onPointerLeave={ed.finishDrag}
        onDoubleClick={() => useWalls.setState({ drawStart: null })}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {hovW && <WallBox w={hovW} height={height} material={tool === 'erase' ? delMat : hovMat} grow={0.06} />}
      {selW && <WallBox w={selW} height={height} material={selMat} grow={0.08} />}
      {hovC && <ColumnBox x={hovC.x} z={hovC.z} height={height} material={tool === 'erase' ? delMat : hovMat} />}
      {selC && <ColumnBox x={selC.x} z={selC.z} height={height} material={selMat} />}
      {selW && tool === 'select' && (
        <>
          <Handle x={selW.x1} z={selW.z1} height={height} onDown={(e) => ed.onHandleDown(selW.id, 1, e)} />
          <Handle x={selW.x2} z={selW.z2} height={height} onDown={(e) => ed.onHandleDown(selW.id, 2, e)} />
        </>
      )}
      {preview && <WallBox w={preview} height={height} material={prevMat} grow={0} />}
      {tool === 'draw' && cursor && (
        <mesh position={[cursor[0], 0.03, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.18, 0.28, 24]} />
          <meshBasicMaterial color={ACCENT_3D} />
        </mesh>
      )}
      {tool === 'draw' && drawStart && (
        <mesh position={[drawStart[0], 0.03, drawStart[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 20]} />
          <meshBasicMaterial color={ACCENT_3D} />
        </mesh>
      )}
    </group>
  );
}

function WallBox({ w, height, material, grow }: { w: Pick<EditWall, 'x1' | 'z1' | 'x2' | 'z2' | 't'>; height: number; material: THREE.Material; grow: number }) {
  const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
  return (
    <mesh
      position={[(w.x1 + w.x2) / 2, (height + grow) / 2, (w.z1 + w.z2) / 2]}
      rotation={[0, -Math.atan2(w.z2 - w.z1, w.x2 - w.x1), 0]}
      scale={[len + w.t * 0.5 + grow, height + grow, w.t + grow]}
      material={material}
      renderOrder={5}
      raycast={() => null}
    >
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function ColumnBox({ x, z, height, material }: { x: number; z: number; height: number; material: THREE.Material }) {
  return (
    <mesh position={[x, (height + 0.15) / 2, z]} scale={[0.55, height + 0.15, 0.55]} material={material} renderOrder={5} raycast={() => null}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function Handle({ x, z, height, onDown }: { x: number; z: number; height: number; onDown: (e: ThreeEvent<PointerEvent>) => void }) {
  return (
    <mesh
      position={[x, height + 0.25, z]}
      onPointerDown={onDown}
      onClick={(e) => e.stopPropagation()}
      onPointerOver={() => (document.body.style.cursor = 'grab')}
      onPointerOut={() => (document.body.style.cursor = '')}
      renderOrder={6}
    >
      <sphereGeometry args={[0.32, 20, 14]} />
      <meshBasicMaterial color="#ffffff" depthTest={false} />
    </mesh>
  );
}

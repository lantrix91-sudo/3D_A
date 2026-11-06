import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import underlayUrl from '../assets/plan-floor1.png';
import { LAYOUT, type WallKind } from '../domain/layout';
import { useWalls } from '../services/walls';

export type WallPointer = (id: string, e: ThreeEvent<PointerEvent>) => void;

/**
 * Здание по рабочему проекту: подложка-план на полу, стены (выдавлены из линий чертежа), колонны каркаса.
 * Высота стен: «низкие» — разрез на 1,4 м, чтобы видеть помещения; «полные» — высота этажа.
 */

const LOW_H = 1.4;
const WALL_COLOR: Record<WallKind, { light: string; dark: string }> = {
  outer: { light: '#7d8790', dark: '#7a858f' },
  inner: { light: '#a5aeb5', dark: '#5f6a73' },
  new: { light: '#8ea3b8', dark: '#56708a' },
  partition: { light: '#b8c0c6', dark: '#525c64' },
};

export function PlantBuilding({ theme, wallMode, underlay, onWallDown, onWallHover }: {
  theme: 'dark' | 'light';
  wallMode: 'low' | 'full';
  underlay: boolean;
  onWallDown?: WallPointer;
  onWallHover?: (id: string | null) => void;
}) {
  const h = wallMode === 'full' ? LAYOUT.floorHeight : LOW_H;
  return (
    <group>
      <Ground theme={theme} />
      <FloorPlan theme={theme} visible={underlay} />
      {(['outer', 'inner', 'new', 'partition'] as WallKind[]).map((k) => (
        <WallSet key={k} kind={k} height={h} color={WALL_COLOR[k][theme]} onDown={onWallDown} onHover={onWallHover} />
      ))}
      <Columns height={h + 0.05} theme={theme} onDown={onWallDown} onHover={onWallHover} />
    </group>
  );
}

function Ground({ theme }: { theme: 'dark' | 'light' }) {
  const { minX, maxX, minZ, maxZ } = LAYOUT.extents;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.02, cz]} receiveShadow>
      <planeGeometry args={[(maxX - minX) + 60, (maxZ - minZ) + 60]} />
      <meshStandardMaterial color={theme === 'light' ? '#c3c9ce' : '#141a1f'} roughness={1} />
    </mesh>
  );
}

/** Подложка: растр листа чертежа в точном масштабе. В тёмной теме инвертируется. */
function FloorPlan({ theme, visible }: { theme: 'dark' | 'light'; visible: boolean }) {
  const u = LAYOUT.underlay;
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      if (theme === 'dark') {
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const a = d.data;
        for (let i = 0; i < a.length; i += 4) {
          const v = 255 - a[i];
          a[i] = a[i + 1] = a[i + 2] = v;
        }
        ctx.putImageData(d, 0, 0);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      setTex((old) => {
        old?.dispose();
        return t;
      });
    };
    img.src = underlayUrl;
    return () => {
      cancelled = true;
    };
  }, [theme]);
  const w = u.maxX - u.minX;
  const d = u.maxZ - u.minZ;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(u.minX + u.maxX) / 2, 0.002, (u.minZ + u.maxZ) / 2]} receiveShadow visible={visible && !!tex}>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial
        map={tex}
        color={theme === 'light' ? '#c4cbd1' : '#9fb0bd'}
        roughness={0.95}
        transparent={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}

function WallSet({ kind, height, color, onDown, onHover }: {
  kind: WallKind;
  height: number;
  color: string;
  onDown?: WallPointer;
  onHover?: (id: string | null) => void;
}) {
  const all = useWalls((s) => s.walls);
  const walls = useMemo(() => all.filter((w) => w.kind === kind), [all, kind]);
  const capacity = Math.max(50, Math.ceil((walls.length + 20) / 50) * 50);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    walls.forEach((w, i) => {
      const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
      o.position.set((w.x1 + w.x2) / 2, height / 2, (w.z1 + w.z2) / 2);
      o.rotation.set(0, -Math.atan2(w.z2 - w.z1, w.x2 - w.x1), 0);
      o.scale.set(len + w.t * 0.5, height, w.t);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = walls.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [walls, height, capacity]);
  const idOf = (e: ThreeEvent<PointerEvent>) => (e.instanceId != null ? walls[e.instanceId]?.id : undefined);
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[undefined, undefined, capacity]}
      castShadow
      receiveShadow
      onPointerDown={onDown ? (e) => { const id = idOf(e); if (id) onDown(id, e); } : undefined}
      onPointerMove={onHover ? (e) => { const id = idOf(e); if (id) onHover(id); } : undefined}
      onPointerOut={onHover ? () => onHover(null) : undefined}
      onClick={onDown ? (e) => { if (useWalls.getState().tool !== 'draw') e.stopPropagation(); } : undefined}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </instancedMesh>
  );
}

function Columns({ height, theme, onDown, onHover }: {
  height: number;
  theme: 'dark' | 'light';
  onDown?: WallPointer;
  onHover?: (id: string | null) => void;
}) {
  const columns = useWalls((s) => s.columns);
  const capacity = Math.max(50, Math.ceil((columns.length + 10) / 50) * 50);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    columns.forEach((c, i) => {
      o.position.set(c.x, height / 2, c.z);
      o.scale.set(0.4, height, 0.4);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = columns.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [columns, height, capacity]);
  const idOf = (e: ThreeEvent<PointerEvent>) => (e.instanceId != null ? columns[e.instanceId]?.id : undefined);
  return (
    <instancedMesh
      key={capacity}
      ref={ref}
      args={[undefined, undefined, capacity]}
      castShadow
      onPointerDown={onDown ? (e) => { const id = idOf(e); if (id) onDown(id, e); } : undefined}
      onPointerMove={onHover ? (e) => { const id = idOf(e); if (id) onHover(id); } : undefined}
      onPointerOut={onHover ? () => onHover(null) : undefined}
      onClick={onDown ? (e) => { if (useWalls.getState().tool !== 'draw') e.stopPropagation(); } : undefined}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={theme === 'light' ? '#6f7880' : '#8a949c'} roughness={0.7} />
    </instancedMesh>
  );
}

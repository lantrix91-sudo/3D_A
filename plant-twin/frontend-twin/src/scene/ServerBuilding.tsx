import { useLoader } from '@react-three/fiber';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlanZone } from '../api/types';
import { useServer } from '../store/serverStore';
import { fileNameFromUrl, hideUrls } from '../utils/url';

/**
 * GLB цеха из zone.model_url поверх чертежа. Модель сдвинута той же привязкой zone.plan_offset, что и
 * оборудование, поэтому по ней удобно проверять совпадение. Основное здание рисует PlantBuilding.
 */
export function ServerBuilding() {
  const zones = useServer((s) => s.zones);
  return (
    <group>
      {zones.map((zone) => zone.model_url && (
        <HallBoundary key={zone.code} url={zone.model_url}>
          <Suspense fallback={null}>
            <ZoneHall zone={zone} url={zone.model_url} />
          </Suspense>
        </HallBoundary>
      ))}
    </group>
  );
}

function ZoneHall({ zone, url }: { zone: Omit<PlanZone, 'equipment'>; url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.receiveShadow = true;
    });
    return root;
  }, [gltf]);
  // Снаружи внутрь: привязка к чертежу, смещение и поворот зоны (docs/COORDINATES.md), коррекция самого GLB
  return (
    <group position={[zone.plan_offset.x, 0, -zone.plan_offset.z]} rotation={[0, THREE.MathUtils.degToRad(zone.plan_rotation_deg), 0]}>
      <group position={[zone.offset.x, 0, -zone.offset.z]} rotation={[0, THREE.MathUtils.degToRad(zone.rotation_deg), 0]}>
        <primitive object={scene} rotation={[0, THREE.MathUtils.degToRad(zone.model_rotation_deg), 0]} />
      </group>
    </group>
  );
}

/** Файл здания не загрузился: сцена продолжает работать, оборудование останется видно */
class HallBoundary extends Component<{ url: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error(`[scene] модель здания ${fileNameFromUrl(this.props.url)} не загружена: ${hideUrls(String(e))}`);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

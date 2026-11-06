import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAT, screenMaterial } from './materials';

/**
 * Упрощённые узнаваемые модели оборудования. Локальная система: фронт смотрит в +Z, пол — y=0.
 * Размеры условные (метры). Модели не являются копиями конкретных изделий.
 */

export interface ModelProps {
  running: boolean;
  /** 0..1 — нагрев для подсветки окон печи / камеры */
  heat: number;
  screenColor: string;
}

// ---------------------------------------------------------------- Расстоечная камера
export function ProoferModel({ running, heat, screenColor }: ModelProps) {
  const W = 1.5, H = 2.15, D = 1.15;
  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf87', emissiveIntensity: 0 }), []);
  const screen = useMemo(() => screenMaterial(screenColor), [screenColor]);
  useFrame(() => {
    lampMat.emissiveIntensity = THREE.MathUtils.lerp(lampMat.emissiveIntensity, running ? 0.25 + heat * 0.5 : 0.02, 0.05);
  });
  return (
    <group>
      {/* ножки */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} position={[x * (W / 2 - 0.08), 0.06, z * (D / 2 - 0.08)]} material={MAT.steelDark} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.12, 12]} />
        </mesh>
      ))}
      {/* корпус: задняя стенка, бока, верх, низ */}
      <group position={[0, 0.12 + H / 2, 0]}>
        <mesh position={[0, 0, -D / 2 + 0.03]} material={MAT.brushed} castShadow receiveShadow>
          <boxGeometry args={[W, H, 0.06]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 - 0.03), 0, 0]} material={MAT.brushed} castShadow receiveShadow>
            <boxGeometry args={[0.06, H, D]} />
          </mesh>
        ))}
        <mesh position={[0, H / 2 - 0.03, 0]} material={MAT.brushed} castShadow>
          <boxGeometry args={[W, 0.06, D]} />
        </mesh>
        <mesh position={[0, -H / 2 + 0.03, 0]} material={MAT.steelDark} receiveShadow>
          <boxGeometry args={[W, 0.06, D]} />
        </mesh>
        {/* подсветка камеры */}
        <mesh position={[0, H / 2 - 0.08, 0]} material={lampMat}>
          <boxGeometry args={[W - 0.2, 0.02, 0.1]} />
        </mesh>
        {/* стеллажная тележка с противнями и заготовками */}
        <group position={[0, -0.05, 0]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.48, 0, 0]} material={MAT.steelDark}>
              <boxGeometry args={[0.03, H - 0.3, 0.8]} />
            </mesh>
          ))}
          {Array.from({ length: 9 }).map((_, i) => {
            const y = -H / 2 + 0.3 + i * 0.2;
            return (
              <group key={i} position={[0, y, 0]}>
                <mesh material={MAT.tray}>
                  <boxGeometry args={[0.95, 0.015, 0.75]} />
                </mesh>
                {[-0.3, 0, 0.3].map((x) => (
                  <mesh key={x} position={[x, 0.04, 0]} material={MAT.dough} scale={[1, 0.55, 1]}>
                    <capsuleGeometry args={[0.055, 0.45, 4, 10]} />
                  </mesh>
                ))}
              </group>
            );
          })}
        </group>
        {/* стеклянная дверь */}
        <group position={[0, 0, D / 2 - 0.01]}>
          {/* рама двери */}
          {[
            [0, H / 2 - 0.08, W - 0.02, 0.16],
            [0, -H / 2 + 0.08, W - 0.02, 0.16],
            [-W / 2 + 0.06, 0, 0.12, H],
            [W / 2 - 0.06, 0, 0.12, H],
          ].map(([x, y, w, h], i) => (
            <mesh key={i} position={[x, y, 0]} material={MAT.steel}>
              <boxGeometry args={[w, h, 0.03]} />
            </mesh>
          ))}
          <mesh material={MAT.glass}>
            <boxGeometry args={[W - 0.2, H - 0.3, 0.01]} />
          </mesh>
          <mesh position={[W / 2 - 0.16, 0, 0.06]} material={MAT.steelDark} castShadow>
            <boxGeometry args={[0.04, 0.7, 0.05]} />
          </mesh>
        </group>
      </group>
      {/* «вырез» стекла: рамка вокруг остекления поверх металла */}
      {/* пульт и парогенератор сбоку */}
      <group position={[W / 2 + 0.2, 0.12, 0]}>
        <mesh position={[0, 0.55, 0]} material={MAT.brushed} castShadow>
          <boxGeometry args={[0.36, 1.1, 0.7]} />
        </mesh>
        <mesh position={[0, 1.45, 0.05]} material={MAT.panel} castShadow>
          <boxGeometry args={[0.36, 0.55, 0.6]} />
        </mesh>
        <mesh position={[0, 1.5, 0.36]} material={screen}>
          <boxGeometry args={[0.24, 0.16, 0.01]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- Планетарный миксер
export function MixerModel({ running, screenColor }: ModelProps) {
  const beater = useRef<THREE.Group>(null);
  const orbit = useRef<THREE.Group>(null);
  const screen = useMemo(() => screenMaterial(screenColor), [screenColor]);
  const speed = useRef(0);
  useFrame((_, dt) => {
    speed.current = THREE.MathUtils.lerp(speed.current, running ? 1 : 0, Math.min(1, dt * 1.5));
    if (orbit.current) orbit.current.rotation.y += dt * 2.2 * speed.current;
    if (beater.current) beater.current.rotation.y -= dt * 7 * speed.current;
  });
  const bowlProfile = useMemo(
    () => [
      new THREE.Vector2(0, 0), new THREE.Vector2(0.18, 0), new THREE.Vector2(0.27, 0.06),
      new THREE.Vector2(0.31, 0.2), new THREE.Vector2(0.33, 0.42), new THREE.Vector2(0.35, 0.44),
    ],
    [],
  );
  return (
    <group>
      {/* основание */}
      <RoundedBox args={[0.75, 0.22, 0.85]} radius={0.05} position={[0, 0.11, -0.05]} material={MAT.white} castShadow receiveShadow />
      {/* колонна */}
      <RoundedBox args={[0.4, 1.25, 0.36]} radius={0.06} position={[0, 0.84, -0.32]} material={MAT.white} castShadow />
      {/* подъёмные кронштейны дежи */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.3, 0.62, -0.05]} material={MAT.steelDark} castShadow>
          <boxGeometry args={[0.05, 0.06, 0.55]} />
        </mesh>
      ))}
      {/* дежа */}
      <group position={[0, 0.42, 0.12]}>
        <mesh material={MAT.steel} castShadow receiveShadow>
          <latheGeometry args={[bowlProfile, 40]} />
        </mesh>
        <mesh position={[0, 0.17, 0]} material={MAT.dough}>
          <sphereGeometry args={[0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </group>
      {/* голова */}
      <RoundedBox args={[0.42, 0.34, 0.78]} radius={0.08} position={[0, 1.36, 0.0]} material={MAT.white} castShadow />
      <mesh position={[0, 1.42, 0.395]} material={screen}>
        <boxGeometry args={[0.2, 0.1, 0.01]} />
      </mesh>
      {/* защитная решётка */}
      <mesh position={[0, 0.9, 0.12]} material={MAT.steelDark}>
        <torusGeometry args={[0.37, 0.008, 6, 40]} />
      </mesh>
      {/* планетарный привод и венчик */}
      <group ref={orbit} position={[0, 1.18, 0.12]}>
        <group ref={beater} position={[0.09, 0, 0]}>
          <mesh position={[0, -0.18, 0]} material={MAT.steel}>
            <cylinderGeometry args={[0.02, 0.02, 0.36, 10]} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, -0.5, 0]} rotation={[0, (i * Math.PI) / 4, 0]} material={MAT.steel}>
              <torusGeometry args={[0.12, 0.006, 6, 24, Math.PI]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- Спиральный тестомес
export function KneaderModel({ running, screenColor }: ModelProps) {
  const spiral = useRef<THREE.Mesh>(null);
  const bowl = useRef<THREE.Group>(null);
  const screen = useMemo(() => screenMaterial(screenColor), [screenColor]);
  const speed = useRef(0);
  const helix = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 2 * 1.6;
      const r = 0.04 + 0.1 * t;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -t * 0.42, Math.sin(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.014, 8, false);
  }, []);
  useFrame((_, dt) => {
    speed.current = THREE.MathUtils.lerp(speed.current, running ? 1 : 0, Math.min(1, dt * 1.5));
    if (spiral.current) spiral.current.rotation.y += dt * 9 * speed.current;
    if (bowl.current) bowl.current.rotation.y -= dt * 0.9 * speed.current;
  });
  return (
    <group>
      {/* станина */}
      <RoundedBox args={[0.95, 0.72, 1.25]} radius={0.06} position={[0, 0.36, -0.05]} material={MAT.white} castShadow receiveShadow />
      <mesh position={[0, 0.03, -0.05]} material={MAT.rubber}>
        <boxGeometry args={[0.99, 0.06, 1.29]} />
      </mesh>
      {/* дежа (вращается) */}
      <group ref={bowl} position={[0, 0.72, 0.18]}>
        <mesh material={MAT.steel} castShadow receiveShadow>
          <cylinderGeometry args={[0.43, 0.4, 0.42, 40, 1, true]} />
        </mesh>
        <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} material={MAT.steel}>
          <circleGeometry args={[0.4, 40]} />
        </mesh>
        <mesh position={[0, 0.21, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.steel}>
          <torusGeometry args={[0.43, 0.012, 6, 40]} />
        </mesh>
        <mesh position={[0.12, -0.09, 0.05]} material={MAT.dough} scale={[1.3, 0.55, 1.2]}>
          <sphereGeometry args={[0.24, 20, 14]} />
        </mesh>
      </group>
      {/* стойка с головой */}
      <RoundedBox args={[0.5, 0.75, 0.38]} radius={0.06} position={[0, 1.08, -0.5]} material={MAT.white} castShadow />
      <RoundedBox args={[0.42, 0.26, 0.72]} radius={0.06} position={[0, 1.35, -0.2]} material={MAT.white} castShadow />
      <mesh position={[0.26, 1.15, -0.32]} rotation={[0, Math.PI / 2, 0]} material={screen}>
        <boxGeometry args={[0.2, 0.12, 0.01]} />
      </mesh>
      {/* спираль и центральный стержень */}
      <mesh ref={spiral} position={[0.08, 1.2, 0.08]} geometry={helix} material={MAT.steel} castShadow />
      <mesh position={[-0.12, 0.92, 0.18]} material={MAT.steel}>
        <cylinderGeometry args={[0.03, 0.03, 0.42, 10]} />
      </mesh>
      {/* защитная крышка (прозрачная) */}
      <mesh position={[0, 0.99, 0.18]} material={MAT.glass}>
        <cylinderGeometry args={[0.46, 0.46, 0.08, 40, 1, true, 0, Math.PI]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Подовая печь (условная)
export function OvenModel({ running, heat, screenColor }: ModelProps) {
  const W = 2.2, H = 1.85, D = 1.9;
  const decks = 3;
  const glowMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a1608', emissive: '#ff7a1a', emissiveIntensity: 0, roughness: 0.3 }),
    [],
  );
  const screen = useMemo(() => screenMaterial(screenColor), [screenColor]);
  useFrame((st) => {
    const target = running ? 0.25 + heat * 1.4 : heat * 0.25;
    const flicker = running ? Math.sin(st.clock.elapsedTime * 3) * 0.03 : 0;
    glowMat.emissiveIntensity = THREE.MathUtils.lerp(glowMat.emissiveIntensity, target + flicker, 0.04);
  });
  const deckH = (H - 0.2) / decks;
  return (
    <group>
      {/* подставка */}
      <mesh position={[0, 0.2, 0]} material={MAT.steelDark} castShadow receiveShadow>
        <boxGeometry args={[W - 0.1, 0.4, D - 0.2]} />
      </mesh>
      {/* корпус */}
      <mesh position={[0, 0.4 + H / 2, -0.05]} material={MAT.brushed} castShadow receiveShadow>
        <boxGeometry args={[W, H, D - 0.1]} />
      </mesh>
      {/* фасад: ярусы с дверцами и смотровыми окнами */}
      {Array.from({ length: decks }).map((_, i) => {
        const y = 0.4 + 0.1 + deckH * (i + 0.5);
        return (
          <group key={i} position={[-0.18, y, D / 2 - 0.08]}>
            <mesh material={MAT.panel} castShadow>
              <boxGeometry args={[W - 0.55, deckH - 0.06, 0.06]} />
            </mesh>
            <mesh position={[0, 0.02, 0.032]} material={glowMat}>
              <boxGeometry args={[W - 1.05, deckH * 0.42, 0.01]} />
            </mesh>
            <mesh position={[0, -deckH * 0.33, 0.07]} rotation={[0, 0, Math.PI / 2]} material={MAT.steel} castShadow>
              <cylinderGeometry args={[0.018, 0.018, W - 0.9, 10]} />
            </mesh>
          </group>
        );
      })}
      {/* панель управления справа */}
      <group position={[W / 2 - 0.2, 0.4 + H / 2, D / 2 - 0.08]}>
        <mesh material={MAT.panel}>
          <boxGeometry args={[0.32, H - 0.1, 0.06]} />
        </mesh>
        {Array.from({ length: decks }).map((_, i) => (
          <mesh key={i} position={[0, -H / 2 + 0.1 + deckH * (i + 0.6), 0.033]} material={screen}>
            <boxGeometry args={[0.2, 0.12, 0.01]} />
          </mesh>
        ))}
      </group>
      {/* вытяжной зонт и воздуховод */}
      <mesh position={[0, 0.4 + H + 0.12, 0.25]} material={MAT.steel} castShadow>
        <boxGeometry args={[W + 0.1, 0.24, D - 0.4]} />
      </mesh>
      <mesh position={[0.5, 0.4 + H + 0.75, 0.1]} material={MAT.steelDark} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 1.05, 20]} />
      </mesh>
      {/* загрузочный стол-полка */}
      <mesh position={[-0.18, 0.62, D / 2 + 0.12]} material={MAT.steel} castShadow>
        <boxGeometry args={[W - 0.6, 0.04, 0.3]} />
      </mesh>
    </group>
  );
}

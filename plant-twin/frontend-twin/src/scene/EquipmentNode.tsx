import { useFrame, useLoader, type ThreeEvent } from '@react-three/fiber';
import { Component, memo, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useRegistry } from '../domain/config';
import { effectiveModel, equipmentSize, PROCEDURAL_OFFSET, reportModelError, reportModelSize, useModels } from '../services/models3d';
import { hideUrls } from '../utils/url';
import { useCollision } from '../services/collision';
import { useWalls } from '../services/walls';
import { useSceneUi } from './labels';
import * as THREE from 'three';
import type { DisplayState, Equipment } from '../domain/types';
import { ACCENT_3D, STATE_META } from '../ui/common/stateMeta';
import { KneaderModel, MixerModel, OvenModel, ProoferModel } from './models/Models';
import { depositorState, type ConveyorParams } from './depositAnim';
import { DEFAULT_DRAW, drawScreen, makeScreenTexture, screenMeshes, setHasScreen, useInfoScreens, type ScreenInfo } from './infoScreen';
import { useApp } from '../store/appStore';
import { defaultScreens } from '../storage/settings';

export interface NodeProps {
  eq: Equipment;
  pose: { x: number; z: number; rotY: number };
  placeMode: boolean;
  onDragStart?: (e: ThreeEvent<PointerEvent>) => void;
  state: DisplayState;
  running: boolean;
  heat: number;
  selected: boolean;
  onSelect: () => void;
  /** Что показать на живом экране модели (позиция, показание, состояние) */
  info: ScreenInfo;
}


function EquipmentNodeImpl({ eq, pose, placeMode, onDragStart, state, running, heat, selected, onSelect, info }: NodeProps) {
  const meta = STATE_META[state];
  const color = meta.color;
  const zoneMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }), [color]);
  const edgeMat = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }), [color]);
  const isBlocked = useCollision((s) => s.blocked?.id === eq.id);
  const selMat = useMemo(() => new THREE.MeshBasicMaterial({ color: isBlocked ? '#ef4444' : ACCENT_3D, transparent: true, opacity: 0.95 }), [isBlocked]);
  const lampRef = useRef<THREE.MeshStandardMaterial>(null);
  const selRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  footProbe[eq.id] = () => measureFootprint(modelRef.current, fw, fd);
  useRegistry((s) => s.version); // правка записи (модель, файл) — перерисовка
  const uploaded = useModels((s) => (eq.modelAsset ? s.byId[eq.modelAsset] : undefined));
  // загруженный файл важнее встроенной модели; пока он грузится из хранилища — показываем встроенную
  const model = uploaded && uploaded !== 'missing' ? uploaded : effectiveModel({ modelAsset: null, builtinModel: eq.builtinModel }) ?? uploaded;
  const { w: fw, d: fd, h } = equipmentSize(eq);
  const hasModel = !!model && model !== 'missing';
  // Модель стоит как есть, а центр корпуса может быть смещён от точки установки.
  // Чтобы рамка на полу и зона щелчка совпали с корпусом, сдвигаем их на тот же центр.
  const center = hasModel ? model.center : undefined;
  const cx = center?.[0] ?? 0;
  const cz = center?.[1] ?? 0;
  const floorX = cx * Math.cos(pose.rotY) + cz * Math.sin(pose.rotY);
  const floorZ = -cx * Math.sin(pose.rotY) + cz * Math.cos(pose.rotY);

  const ownScreen = useInfoScreens((s) => !!s.own[eq.id]);
  const blink = state === 'alarm' || state === 'warning' || state === 'no_comm';
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = blink ? 0.5 + 0.5 * Math.sin(t * (state === 'alarm' ? 8 : 4)) : 1;
    zoneMat.opacity = 0.12 + 0.18 * pulse;
    if (lampRef.current) lampRef.current.emissiveIntensity = 0.4 + 1.8 * pulse;
    if (selRef.current) {
      selRef.current.visible = selected;
      const s = 1 + 0.025 * Math.sin(t * 3);
      selRef.current.scale.set(s, 1, s);
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (useWalls.getState().editMode) return; // в редакторе стен щелчок проходит к полу (рисование стены)
    e.stopPropagation();
    if (e.delta > 6) return; // это было перетаскивание камеры
    onSelect();
  };

  return (
    <group position={[pose.x, eq.server?.posY ?? 0, pose.z]}>
      <group position={[floorX, 0, floorZ]}>
      {/* зона оборудования на полу: цвет = состояние */}
      <mesh rotation={[-Math.PI / 2, 0, pose.rotY]} position={[0, 0.012, 0]} material={zoneMat}>
        <planeGeometry args={[fw, fd]} />
      </mesh>
      <ZoneEdge w={fw} d={fd} rot={pose.rotY} material={edgeMat} y={0.014} />
      {/* выделение выбранного */}
      <group ref={selRef} visible={selected}>
        <ZoneEdge w={fw + 0.14} d={fd + 0.14} rot={pose.rotY} material={selMat} y={0.016} thick={0.06} />
      </group>
      </group>

      <group
        rotation={[0, pose.rotY, 0]}
        onClick={handleClick}
        onPointerDown={(e) => {
          if (placeMode && selected && onDragStart) {
            e.stopPropagation();
            onDragStart(e);
          }
        }}
        onPointerOver={(e) => {
          // Остановка здесь блокирует движения мыши, пока курсор над моделью: события не дошли бы до плоскости
          // перетаскивания за ней. В плотном ряду станков курсор всё время над соседом, и станок не двигался бы
          if (!(placeMode && eq.server)) e.stopPropagation();
          useSceneUi.setState({ hover: eq.id });
          document.body.style.cursor = placeMode && selected ? 'move' : 'pointer';
        }}
        onPointerOut={() => {
          useSceneUi.setState({ hover: null });
          document.body.style.cursor = '';
        }}
      >
        <group ref={modelRef} position={hasModel ? [0, 0, 0] : [PROCEDURAL_OFFSET[eq.kind]?.[0] ?? 0, 0, PROCEDURAL_OFFSET[eq.kind]?.[1] ?? 0]}>
        {hasModel ? (
          <ModelErrorBoundary key={model.url} eqId={eq.id} url={model.url} fallback={<PlaceholderModel w={fw} d={fd} h={h} color={color} />}>
            <Suspense fallback={<LoadingModel eqId={eq.id} w={fw} d={fd} h={h} color={color} />}>
              <GlbModel eqId={eq.id} modelId={eq.modelAsset ?? undefined} keepOrigin={model.keepOrigin} statusNode={model.statusNode} url={model.url} scale={model.scale} running={running} heat={heat} stateColor={color} blink={blink} commOk={state !== 'no_comm' && state !== 'no_sensors'} info={info} />
            </Suspense>
          </ModelErrorBoundary>
        ) : eq.server ? (
          // Файла модели на сервере нет: запасная коробка размером из плана
          <PlaceholderModel w={fw} d={fd} h={h} color={color} />
        ) : (
          <>
            {eq.kind === 'proofer' && <ProoferModel running={running} heat={heat} screenColor={color} />}
            {eq.kind === 'mixer' && <MixerModel running={running} heat={heat} screenColor={color} />}
            {eq.kind === 'kneader' && <KneaderModel running={running} heat={heat} screenColor={color} />}
            {eq.kind === 'oven' && <OvenModel running={running} heat={heat} screenColor={color} />}
            {(eq.kind === 'generic' || eq.kind === 'cooler') && <PlaceholderModel w={fw} d={fd} h={h} color={color} />}
          </>
        )}
        </group>
        {/* невидимый объём для удобного попадания курсором */}
        <mesh position={[cx, h / 2, cz]}>
          <boxGeometry args={[fw, h, fd]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        {/* у модели нет своего экрана (свой файл, условная модель) — крепим живой экран на лицевую сторону */}
        {!ownScreen && <group position={[cx, 0, cz]}><AutoScreen eqId={eq.id} fw={fw} fd={fd} h={h} info={info} /></group>}
      </group>

      {/* светосигнальная колонна */}
      <group rotation={[0, pose.rotY, 0]}>
      <group position={[fw / 2 + cx, 0, -fd / 2 + cz]}>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[0.02, 0.02, h, 8]} />
          <meshStandardMaterial color="#59636c" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, h + 0.12, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.22, 16]} />
          <meshStandardMaterial ref={lampRef} color={color} emissive={color} emissiveIntensity={1} toneMapped={false} />
        </mesh>
      </group>
      </group>

    </group>
  );
}

/**
 * Загруженная GLB-модель: масштаб к метрам, низ — на полу, центр площадки — в точке установки.
 * Оживление по соглашению имён узлов (anim-*), см. tools/glb/PHOTO_GUIDE.md:
 *   anim-rotate — вращается вокруг своей оси Y, пока оборудование работает (тележка печи, дежа);
 *   anim-spin   — быстрое вращение (вал, спираль, мешалка), ~120 об/мин;
 *   anim-bowl   — вращение дежи тестомеса, ~12 об/мин;
 *   anim-orbit  — планетарная головка миксера: обход дежи, ~40 об/мин (инструмент внутри — anim-spin-rev);
 *   суффикс -rev (anim-spin-rev, anim-bowl-rev, anim-rotate-rev) — вращение в обратную сторону;
 *   anim-glow   — свечение (свет и жар камеры), яркость от температуры и работы;
 *   anim-status — окрашивается в цвет состояния, мигает при тревоге и потере связи;
 *   anim-screen — экран пульта: светится, пока есть связь;
 *   anim-display — дисплей, который светится только во время работы (гаснет при остановке);
 *   anim-progress — полоса хода цикла: масштаб по X растёт от 0 до 1 за 30 с, пока идёт работа;
 *   anim-steam  — точка, из которой идёт пар, пока оборудование работает.
 * Встроенные в GLB анимации (например, из Blender) проигрываются, пока оборудование работает.
 */
function GlbModel({ eqId, modelId, keepOrigin, statusNode, url, scale, running, heat, stateColor, blink, commOk, info }: {
  eqId: string;
  /** Id модели в useModels, чтобы сообщить настоящие размеры */
  modelId?: string;
  /** Не сдвигать модель, начало координат GLB и есть точка установки */
  keepOrigin?: boolean;
  /** Узел, который красится в цвет статуса (led_node_name) */
  statusNode?: string;
  url: string;
  scale: number;
  running: boolean;
  heat: number;
  stateColor: string;
  blink: boolean;
  commOk: boolean;
  info: ScreenInfo;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const rig = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const c = box.getCenter(new THREE.Vector3());
    const measured = box.getSize(new THREE.Vector3());
    if (!keepOrigin) root.position.set(-c.x, -box.min.y, -c.z);
    root.updateMatrixWorld(true);
    const rotate: THREE.Object3D[] = [];
    const spin: THREE.Object3D[] = [];
    const bowl: THREE.Object3D[] = [];
    const orbit: THREE.Object3D[] = [];
    const dir = (o: THREE.Object3D) => (o.name.toLowerCase().includes('-rev') ? -1 : 1);
    const glow: { m: THREE.MeshStandardMaterial; base: number }[] = [];
    const status: THREE.MeshStandardMaterial[] = [];
    const screen: { m: THREE.MeshStandardMaterial; base: number }[] = [];
    const steam: THREE.Vector3[] = [];
    // сыплющаяся мука: объём завесы (узел anim-flour) в координатах узла оборудования
    const flours: { box: THREE.Box3; node: THREE.Object3D }[] = [];
    const display: { m: THREE.MeshStandardMaterial; base: number }[] = [];
    const progress: THREE.Object3D[] = [];
    // дозатор: лист на конвейере, порции крема по колонкам, струйки, шток поршня
    const trays: { o: THREE.Object3D; conv: ConveyorParams }[] = [];
    const fills: { o: THREE.Object3D; col: number }[] = [];
    const streams: THREE.Object3D[] = [];
    const doses: { o: THREE.Object3D; x: number }[] = [];
    // делитель-округлитель: шарики теста едут по ленте, барабан вращается
    const balls: { o: THREE.Object3D; phase: number; fromX: number; toX: number; period: number }[] = [];
    const rolls: THREE.Object3D[] = [];
    const infoScreens: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; mat: THREE.MeshBasicMaterial; mesh: THREE.Mesh }[] = [];
    // материалы узлов анимации копируются: одна модель может стоять у нескольких единиц оборудования
    const ownMaterials = (node: THREE.Object3D, cb: (m: THREE.MeshStandardMaterial) => void) => {
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => {
          const cm = (m as THREE.MeshStandardMaterial).clone();
          if (cm.emissive) cb(cm);
          return cm;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      });
    };
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      const n = o.name.toLowerCase();
      if (n.startsWith('anim-rotate')) rotate.push(o);
      else if (n.startsWith('anim-spin')) spin.push(o);
      else if (n.startsWith('anim-bowl')) bowl.push(o);
      else if (n.startsWith('anim-orbit')) orbit.push(o);
      else if (n.startsWith('anim-glow')) ownMaterials(o, (m) => glow.push({ m, base: m.emissiveIntensity || 1 }));
      else if (n.startsWith('anim-status') || (statusNode && n === statusNode.toLowerCase())) ownMaterials(o, (m) => status.push(m));
      else if (n.startsWith('info-screen') && (o as THREE.Mesh).isMesh) {
        try {
          infoScreens.push({ ...makeScreenTexture(o as THREE.Mesh), mesh: o as THREE.Mesh });
        } catch (err) {
          console.warn('[scene] живой экран не создан — модель показывается без него', err); // модель важнее экрана
        }
      }
      else if (n.startsWith('anim-display')) ownMaterials(o, (m) => display.push({ m, base: m.emissiveIntensity || 1 }));
      else if (n.startsWith('anim-progress')) {
        progress.push(o);
        ownMaterials(o, (m) => display.push({ m, base: m.emissiveIntensity || 1 }));
      } else if (n.startsWith('anim-screen')) ownMaterials(o, (m) => screen.push({ m, base: m.emissiveIntensity || 1 }));
      else if (n.startsWith('anim-tray')) {
        const conv = o.userData?.conv as ConveyorParams | undefined;
        if (conv && Number.isFinite(conv.nozzleX) && Number.isFinite(conv.startX) && Number.isFinite(conv.endX) && conv.cols > 0) trays.push({ o, conv });
      } else if (n.startsWith('anim-fill')) fills.push({ o, col: Number(o.userData?.col) || 0 });
      else if (n.startsWith('anim-stream')) streams.push(o);
      else if (n.startsWith('anim-dose')) doses.push({ o, x: o.position.x });
      else if (n.startsWith('anim-ball')) {
        const u = o.userData ?? {};
        if (Number.isFinite(u.fromX) && Number.isFinite(u.toX)) {
          balls.push({ o, phase: Number(u.phase) || 0, fromX: u.fromX, toX: u.toX, period: Number(u.period) > 0 ? Number(u.period) : 8 });
        }
      } else if (n.startsWith('anim-roll')) rolls.push(o);
      else if (n.startsWith('anim-flour')) {
        flours.push({ box: new THREE.Box3().setFromObject(o), node: o }); // root ещё не в сцене: координаты узла оборудования
      } else if (n.startsWith('anim-steam')) {
        // позиция точки пара в системе координат узла оборудования
        steam.push(o.getWorldPosition(new THREE.Vector3())); // root ещё не в сцене: это координаты узла оборудования
      }
    });
    const mixer = gltf.animations.length ? new THREE.AnimationMixer(root) : null;
    if (mixer) for (const clip of gltf.animations) mixer.clipAction(clip).play();
    return { measured, boxCenter: c, root, infoScreens, rotate, spin, bowl, orbit, dir, glow, status, screen, steam, flours, mixer, display, progress, trays, fills, streams, doses, balls, rolls };
  }, [gltf, scale, keepOrigin, statusNode]);

  // Размеры в базе часто условные, поэтому берём настоящие из загруженной модели
  useEffect(() => {
    if (keepOrigin && modelId) reportModelSize(modelId, [rig.measured.x, rig.measured.y, rig.measured.z], [rig.boxCenter.x, rig.boxCenter.z]);
  }, [rig, keepOrigin, modelId]);

  // живые экраны: перерисовываются при смене показания, состояния или настроек
  const scr = useApp((s) => s.settings?.ui.screens) ?? defaultScreens();
  const readingsKey = (info.readings ?? []).map((x) => x.text + x.level).join('|');
  useEffect(() => {
    for (const sc of rig.infoScreens) {
      try {
        drawScreen(sc.canvas, info, { ...DEFAULT_DRAW, content: scr.content, showTitle: scr.showTitle });
        sc.tex.needsUpdate = true;
      } catch (err) {
        console.warn('[scene] экран не обновлён', err);
      }
    }
  }, [rig, info.title, info.value, info.state, readingsKey, scr.content, scr.showTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  // сдвиг собственного экрана модели (по осям самого экрана, в метрах)
  const own = scr.shift?.[eqId];
  const sx = own?.x ?? 0;
  const sy = own?.y ?? 0;
  const zoom = scr.zoom?.[eqId] ?? 1;
  useEffect(() => {
    const ws = new THREE.Vector3();
    for (const sc of rig.infoScreens) {
      const m = sc.mesh;
      if (!m.userData.basePos) m.userData.basePos = m.position.clone();
      if (!m.userData.baseScale) m.userData.baseScale = m.scale.clone();
      m.scale.copy(m.userData.baseScale as THREE.Vector3).multiplyScalar(zoom);
      ws.set(1, 1, 1);
      m.parent?.getWorldScale(ws);
      const dx = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion).multiplyScalar(sx / (Math.abs(ws.x) || 1));
      const dy = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion).multiplyScalar(sy / (Math.abs(ws.y) || 1));
      // увеличенный или сдвинутый экран чуть выносим вперёд, чтобы его не перекрывал корпус
      const out = zoom !== 1 || sx !== 0 || sy !== 0 ? 0.03 : 0;
      const dz = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion).multiplyScalar(out / (Math.abs(ws.z) || 1));
      m.position.copy(m.userData.basePos as THREE.Vector3).add(dx).add(dy).add(dz);
    }
  }, [rig, sx, sy, zoom]);
  useEffect(() => {
    reportModelError(eqId, null);
    setHasScreen(eqId, rig.infoScreens.length > 0, 'own');
    if (rig.infoScreens.length) screenMeshes.set(eqId, 'own', rig.infoScreens.map((sc) => sc.mesh));
    return () => {
      setHasScreen(eqId, false, 'own');
      screenMeshes.delete(eqId, 'own');
    };
  }, [rig, eqId]);
  useEffect(() => () => { for (const sc of rig.infoScreens) sc.tex.dispose(); }, [rig]);
  useEffect(() => {
    screenProbe[eqId] = () => rig.infoScreens.map((sc) => sc.canvas.toDataURL('image/png'));
    return () => { delete screenProbe[eqId]; };
  }, [rig, eqId]);

  const speed = useRef(running ? 1 : 0);
  const glowLevel = useRef(0);
  const displayLevel = useRef(running && commOk ? 1 : 0);
  const cycle = useRef(0);
  const depCycle = useRef(0);
  const ballCycle = useRef(0);
  const statusColor = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.5); // на медленных устройствах кадр может длиться до 0,5 с
    // разгон и выбег ~2–3 с, как у привода тележки
    speed.current = THREE.MathUtils.lerp(speed.current, running ? 1 : 0, Math.min(1, step * 0.8));
    if (!running && speed.current < 0.004) speed.current = 0; // выбег закончен — полная остановка
    for (const o of rig.rotate) o.rotation.y += rig.dir(o) * step * speed.current * ((Math.PI * 2) / 24); // 1 оборот за 24 с
    for (const o of rig.spin) o.rotation.y += rig.dir(o) * step * speed.current * Math.PI * 4; // 2 об/с
    for (const o of rig.bowl) o.rotation.y += rig.dir(o) * step * speed.current * ((Math.PI * 2) / 5); // 1 оборот за 5 с
    for (const o of rig.orbit) o.rotation.y += rig.dir(o) * step * speed.current * ((Math.PI * 2) / 1.5); // 40 об/мин
    if (rig.mixer) {
      rig.mixer.timeScale = speed.current;
      rig.mixer.update(step);
    }
    // жар камеры: при работе ярко по температуре, после остановки медленно остывает
    const targetGlow = running ? 0.35 + 0.9 * heat : 0.15 * heat;
    glowLevel.current = THREE.MathUtils.lerp(glowLevel.current, targetGlow, Math.min(1, step * 0.6));
    const flicker = running ? 1 + 0.04 * Math.sin(clock.elapsedTime * 2.3) : 1;
    for (const g of rig.glow) g.m.emissiveIntensity = g.base * glowLevel.current * flicker;
    const pulse = blink ? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)) : 1;
    statusColor.set(stateColor);
    for (const m of rig.status) {
      m.emissive.copy(statusColor);
      m.color.copy(statusColor);
      m.emissiveIntensity = 1.4 * pulse;
    }
    for (const sc of rig.screen) sc.m.emissiveIntensity = commOk ? sc.base : 0.03;
    // авария — живой экран мигает
    const scrPulse = info.state === 'alarm' ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)) : 1;
    for (const sc of rig.infoScreens) sc.mat.color.setScalar(scrPulse);
    // дисплей: плавно загорается при пуске и гаснет при остановке
    displayLevel.current = THREE.MathUtils.lerp(displayLevel.current, running && commOk ? 1 : 0, Math.min(1, step * 2.5));
    for (const d of rig.display) d.m.emissiveIntensity = d.base * Math.max(0.02, displayLevel.current);
    if (rig.progress.length) {
      if (running) cycle.current = (cycle.current + step / 30) % 1; // цикл охлаждения ~30 с (условно)
      for (const o of rig.progress) {
        o.scale.x = Math.max(0.001, cycle.current);
        o.visible = displayLevel.current > 0.05;
      }
    }
    // дозатор: цикл идёт, пока аппарат работает (с разгоном и выбегом); при остановке лист замирает
    let tray: { x: number; filled: number } | null = null;
    if (rig.trays.length) {
      depCycle.current += step * speed.current;
      const conv = rig.trays[0].conv;
      const st = depositorState(depCycle.current, conv);
      for (const t of rig.trays) t.o.position.x = st.x;
      for (const f of rig.fills) {
        const v = st.fill[f.col] ?? 0;
        f.o.visible = v > 0.02;
        f.o.scale.setScalar(Math.max(0.02, v));
      }
      const d = running ? st.dose : 0;
      for (const sm of rig.streams) {
        sm.visible = d > 0.08;
        sm.scale.set(1, Math.max(0.05, d), 1);
      }
      for (const ds of rig.doses) ds.o.position.x = ds.x - 0.035 * st.dose;
      tray = { x: st.x, filled: st.fill.reduce((a, b) => a + b, 0) };
    }
    // струи без листа-дозатора (например, завеса муки): видны, пока оборудование работает
    if (!rig.trays.length && rig.streams.length) {
      for (const sm of rig.streams) {
        sm.visible = speed.current > 0.3;
        sm.scale.set(1, Math.min(1, Math.max(0.05, speed.current)), 1);
      }
    }
    // делитель-округлитель: шарики выходят из-под барабана, едут к краю ленты и там исчезают
    let ballsInfo: { cycle: number; visible: number; firstX: number } | null = null;
    if (rig.balls.length || rig.rolls.length) {
      const period = rig.balls[0]?.period ?? 8;
      const lanes = new Set(rig.balls.map((b) => b.phase)).size || 4;
      ballCycle.current += (step * speed.current) / period;
      let vis = 0;
      for (const b of rig.balls) {
        const p = (((ballCycle.current + b.phase) % 1) + 1) % 1;
        b.o.position.x = b.fromX + (b.toX - b.fromX) * p;
        const k = p < 0.06 ? p / 0.06 : p > 0.92 ? (1 - p) / 0.08 : 1;
        b.o.scale.setScalar(Math.max(0.02, k));
        b.o.visible = k > 0.03;
        if (b.o.visible) vis++;
      }
      // барабан: четверть оборота на каждую пару заготовок; низ барабана движется по ходу ленты
      for (const r of rig.rolls) r.rotation.z -= step * speed.current * ((Math.PI / 2) * lanes) / period;
      ballsInfo = { cycle: ballCycle.current, visible: vis, firstX: rig.balls[0]?.o.position.x ?? 0 };
    }
    animProbe[eqId] = { steam: steamProbe[eqId] ?? 0, balls: ballsInfo, tray, orbit: rig.orbit[0]?.rotation.y ?? null, bowl: rig.bowl[0]?.rotation.y ?? null, spin: rig.spin[0]?.rotation.y ?? null, rotation: rig.rotate[0]?.rotation.y ?? null, speed: speed.current, glow: glowLevel.current, display: displayLevel.current, progress: cycle.current };
  });

  return (
    <>
      <primitive object={rig.root} />
      {rig.steam.map((p, i) => <Steam key={i} eqId={eqId} at={p} active={running} intensity={0.4 + 0.6 * heat} />)}
      {rig.flours.map((f, i) => <FlourFall key={`f${i}`} eqId={eqId} box={f.box} node={f.node} active={running} />)}
    </>
  );
}

/** Габарит прямоугольника на полу и фактический габарит модели (без поворота) — для автотестов */
const footProbe: Record<string, () => unknown> = {};
const _box = new THREE.Box3();
function measureFootprint(g: THREE.Group | null, fw: number, fd: number) {
  if (!g?.parent) return null;
  const parent = g.parent;
  const rot = parent.rotation.y;
  parent.rotation.y = 0;
  parent.updateMatrixWorld(true);
  _box.makeEmpty();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && m.visible) _box.expandByObject(m, true);
  });
  parent.rotation.y = rot;
  parent.updateMatrixWorld(true);
  if (_box.isEmpty()) return null;
  const pos = parent.getWorldPosition(new THREE.Vector3());
  return {
    zone: [fw, fd],
    model: [_box.max.x - _box.min.x, _box.max.z - _box.min.z],
    offset: [(_box.max.x + _box.min.x) / 2 - pos.x, (_box.max.z + _box.min.z) / 2 - pos.z],
  };
}
(window as unknown as Record<string, unknown>).__twinFootprint = (id: string) => footProbe[id]?.() ?? null;

/** Картинки живых экранов (для автотестов) */
const screenProbe: Record<string, () => string[]> = {};
const autoProbe: Record<string, () => string[]> = {};
(window as unknown as Record<string, unknown>).__twinScreens = (id: string) => screenProbe[id]?.() ?? [];
(window as unknown as Record<string, unknown>).__twinAutoScreens = (id: string) => autoProbe[id]?.() ?? [];

/** Состояние анимации по оборудованию (для автотестов и отладки) */
const animProbe: Record<string, { steam: number; balls: { cycle: number; visible: number; firstX: number } | null; tray: { x: number; filled: number } | null; orbit: number | null; bowl: number | null; spin: number | null; rotation: number | null; speed: number; glow: number; display: number; progress: number }> = {};
(window as unknown as Record<string, unknown>).__twinAnim = (id: string) => animProbe[id] ?? null;

/** Уровень сыплющейся муки по оборудованию (для автотестов) */
const flourProbe: Record<string, number> = {};
(window as unknown as Record<string, unknown>).__twinFlour = (id: string) => flourProbe[id] ?? 0;

/**
 * Мука сыплется из бункера на ленту: мелкие белые частицы падают внутри объёма завесы (узел anim-flour),
 * пока оборудование работает; сама завеса — лёгкая дымка. При остановке поток плавно иссякает.
 */
function FlourFall({ eqId, box, node, active }: { eqId: string; box: THREE.Box3; node: THREE.Object3D; active: boolean }) {
  const N = 260;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), []);
  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box]);
  const parts = useMemo(() => Array.from({ length: N }, () => ({ t: Math.random(), x: Math.random(), z: Math.random(), s: 0.6 + Math.random() * 0.8 })), []);
  const level = useRef(0);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const step = Math.min(dt, 0.5);
    level.current = THREE.MathUtils.lerp(level.current, active ? 1 : 0, Math.min(1, step * 1.5));
    if (!active && level.current < 0.01) level.current = 0;
    flourProbe[eqId] = level.current;
    m.visible = level.current > 0.02;
    node.visible = level.current > 0.05; // дымка завесы
    const fall = step / 0.7; // частица падает до ленты за ~0,7 с
    parts.forEach((p, i) => {
      p.t += fall * (0.8 + 0.4 * p.s);
      if (p.t >= 1) {
        p.t -= 1;
        p.x = Math.random();
        p.z = Math.random();
      }
      o.position.set(box.min.x + p.x * size.x, box.max.y - p.t * size.y, box.min.z + p.z * size.z);
      o.scale.setScalar(0.011 * p.s * (level.current > 0.02 ? 1 : 0) * Math.min(1, level.current * 1.5));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} material={mat} raycast={() => null} frustumCulled={false}>
      <boxGeometry args={[1, 3.5, 1]} />
    </instancedMesh>
  );
}

/** Уровень пара по оборудованию (для автотестов) */
const steamProbe: Record<string, number> = {};

/** Пар над вытяжкой: полупрозрачные клубы поднимаются и тают, пока оборудование работает */
function Steam({ eqId, at, active, intensity }: { eqId: string; at: THREE.Vector3; active: boolean; intensity: number }) {
  const N = 14;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e8eef2', transparent: true, opacity: 0.18, depthWrite: false }), []);
  const puffs = useMemo(() => Array.from({ length: N }, (_, i) => ({ t: i / N, ox: 0, oz: 0 })), []);
  const level = useRef(0);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const step = Math.min(dt, 0.5); // на медленных устройствах кадр может длиться до 0,5 с
    level.current = THREE.MathUtils.lerp(level.current, active ? intensity : 0, Math.min(1, step * 0.7));
    mat.opacity = 0.2 * level.current;
    steamProbe[eqId] = level.current;
    m.visible = level.current > 0.02;
    puffs.forEach((p, i) => {
      p.t += step / 3.2; // клуб живёт ~3 с
      if (p.t >= 1) {
        p.t -= 1;
        p.ox = (Math.random() - 0.5) * 0.25;
        p.oz = (Math.random() - 0.5) * 0.25;
      }
      const r = 0.08 + p.t * 0.32;
      o.position.set(at.x + p.ox + p.t * 0.15, at.y + 0.05 + p.t * 1.1, at.z + p.oz);
      o.scale.setScalar(r * (1 - p.t * 0.35) * level.current);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} material={mat} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
    </instancedMesh>
  );
}

/** Замена модели: пока файл загружается, нет файла или он повреждён */
function PlaceholderModel({ w, d, h, color, loading }: { w: number; d: number; h: number; color: string; loading?: boolean }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[Math.max(0.3, w), h, Math.max(0.3, d)]} />
        <meshStandardMaterial color={loading ? '#5c6770' : '#a9b3bb'} metalness={0.4} roughness={0.55} transparent opacity={loading ? 0.5 : 1} />
      </mesh>
      <mesh position={[0, h * 0.7, Math.max(0.3, d) / 2 + 0.006]}>
        <planeGeometry args={[Math.min(0.4, w * 0.4), Math.min(0.25, h * 0.2)]} />
        <meshStandardMaterial color="#0d1a20" emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Живой экран, прикреплённый к модели без своего экрана: панель с рамкой на лицевой стороне (+Z),
 * на высоте ~¾ модели, размер — по ширине модели.
 */
function AutoScreen({ eqId, fw, fd, h, info }: { eqId: string; fw: number; fd: number; h: number; info: ScreenInfo }) {
  const scr = useApp((st) => st.settings?.ui.screens) ?? defaultScreens();
  const place = scr.place[eqId] ?? { side: 'front' as const, height: 0.72 };
  const sizeK = (scr.size === 's' ? 0.7 : scr.size === 'l' ? 1.45 : 1) * (scr.zoom?.[eqId] ?? 1);
  const face = place.side === 'left' || place.side === 'right' ? fd : fw; // ширина стороны, на которой экран
  const depth = place.side === 'left' || place.side === 'right' ? fw : fd;
  const sw = THREE.MathUtils.clamp(face * 0.55 * sizeK, 0.12, Math.max(0.3, face * 0.95) * Math.max(1, scr.zoom?.[eqId] ?? 1));
  const sh = sw * 0.62;
  const y = THREE.MathUtils.clamp(h * place.height, sh / 2 + 0.2, Math.max(sh / 2 + 0.2, h - sh / 2 - 0.03));
  const xMax = Math.max(0, (face - sw) / 2 + sw * 0.4); // экран может немного выступать за край
  const x = THREE.MathUtils.clamp(place.x ?? 0, -xMax, xMax);
  const rotY = place.side === 'back' ? Math.PI : place.side === 'left' ? -Math.PI / 2 : place.side === 'right' ? Math.PI / 2 : 0;
  const screen = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh));
    mesh.position.set(x, y, 0.012);
    mesh.name = 'info-screen-auto';
    const tex = makeScreenTexture(mesh);
    return { mesh, ...tex };
  }, [sw, sh, y, x]);
  const bezel = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2f34', metalness: 0.3, roughness: 0.5 }), []);
  const readingsKey = (info.readings ?? []).map((x) => x.text + x.level).join('|');
  useEffect(() => {
    try {
      drawScreen(screen.canvas, info, { ...DEFAULT_DRAW, content: scr.content, showTitle: scr.showTitle });
      screen.tex.needsUpdate = true;
    } catch (err) {
      console.warn('[scene] экран не обновлён', err);
    }
  }, [screen, info.title, info.value, info.state, readingsKey, scr.content, scr.showTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    screen.mat.color.setScalar(info.state === 'alarm' ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 6)) : 1);
  });
  useEffect(() => {
    setHasScreen(eqId, true, 'auto');
    screenMeshes.set(eqId, 'auto', [screen.mesh]);
    autoProbe[eqId] = () => [screen.canvas.toDataURL('image/png')];
    return () => {
      delete autoProbe[eqId];
      setHasScreen(eqId, false, 'auto');
      screenMeshes.delete(eqId, 'auto');
      screen.tex.dispose();
      screen.mat.dispose();
      screen.mesh.geometry.dispose();
    };
  }, [eqId, screen]);
  return (
    // группа поворачивается к выбранной стороне и отодвигается к её плоскости
    <group rotation={[0, rotY, 0]}>
      <group position={[0, 0, depth / 2]}>
        <mesh position={[x, y, 0]} material={bezel}>
          <boxGeometry args={[sw + 0.04, sh + 0.04, 0.02]} />
        </mesh>
        <primitive object={screen.mesh} />
      </group>
    </group>
  );
}

/** Пока модель грузится — условная модель; если дольше 15 с, причина видна в карточке */
const SLOW_MSG = 'модель загружается дольше 15 с (возможно, не хватает памяти или файл повреждён)';
function LoadingModel({ eqId, w, d, h, color }: { eqId: string; w: number; d: number; h: number; color: string }) {
  useEffect(() => {
    const t = window.setTimeout(() => reportModelError(eqId, SLOW_MSG), 15000);
    return () => window.clearTimeout(t);
  }, [eqId]);
  return <PlaceholderModel w={w} d={d} h={h} color={color} loading />;
}

/**
 * Ошибка загрузки модели: показываем условную модель, пишем причину в карточку и пробуем ещё раз
 * (до 3 попыток, с очисткой кэша загрузчика). Новый файл (другой url) — новая граница, без «залипания».
 */
class ModelErrorBoundary extends Component<{ eqId: string; url: string; fallback: ReactNode; children: ReactNode }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  private timer: number | null = null;
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    // Загрузчик пишет в сообщение полный адрес файла, а в нём подпись доступа к bucket
    const msg = hideUrls(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    console.error(`[scene] 3D-модель ${this.props.eqId} не загружена: ${msg}`);
    reportModelError(this.props.eqId, msg);
    if (this.state.attempt < 3) {
      this.timer = window.setTimeout(() => {
        useLoader.clear(GLTFLoader, this.props.url);
        this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
      }, 4000);
    }
  }
  componentWillUnmount() {
    if (this.timer) window.clearTimeout(this.timer);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ZoneEdge({ w, d, rot, material, y, thick = 0.035 }: { w: number; d: number; rot: number; material: THREE.Material; y: number; thick?: number }) {
  const bars: [number, number, number, number][] = [
    [0, d / 2, w + thick, thick],
    [0, -d / 2, w + thick, thick],
    [w / 2, 0, thick, d],
    [-w / 2, 0, thick, d],
  ];
  return (
    <group rotation={[0, rot, 0]} position={[0, y, 0]}>
      {bars.map(([x, z, bw, bd], i) => (
        <mesh key={i} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
          <planeGeometry args={[bw, bd]} />
        </mesh>
      ))}
    </group>
  );
}

export const EquipmentNode = memo(EquipmentNodeImpl);

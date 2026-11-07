import { CameraControls, Environment, Lightformer } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { EQUIPMENT, sensorId } from '../domain/config';
import { LAYOUT } from '../domain/layout';
import type { EquipmentId } from '../domain/types';
import { deriveDisplayState } from '../engine/alarmEngine';
import {
  commitPose,
  getPose,
  requestOverview,
  requestShopView,
  selectEquipment,
  setPlaceMode,
  setPose,
  setUi,
} from '../services/telemetryHub';
import { useApp } from '../store/appStore';
import { useThemeMode } from '../ui/common/useTheme';
import { EquipmentNode } from './EquipmentNode';
import { equipmentSize } from '../services/models3d';
import { allReadings, keyReading, screenMeshes } from './infoScreen';
import { LabelProjector, SceneLabels, useSceneUi } from './labels';
import { LABEL_MODE_TEXT, nextLabelMode, setLabelMode, useLabelMode } from './labelMode';
import { PlacementPanel } from './PlacementPanel';
import { PlantBuilding } from './PlantBuilding';
import { reportBlocked } from '../services/collision';
import { WallEditorOverlay, useWallEditor } from './WallEditor';
import { WallEditPanel } from './WallEditPanel';
import { ScreensPanel, useScreensPanel } from './ScreensPanel';
import { requestTopView, setWallEditMode, useWalls } from '../services/walls';
import { isSoftwareRenderer, isWebGLAvailable } from './webgl';
import { clampServerPose } from '../services/serverHub';
import { useServer } from '../store/serverStore';
import { useWallsSync } from '../services/serverWalls';
import { ServerBuilding } from './ServerBuilding';
import { sceneFrame } from './sceneFrame';

/**
 * 3D-сцена: здание по рабочему проекту (лист 7, план 1-го этажа после перепланировки)
 * и четыре единицы оборудования. Только визуализация: читает состояние, выбор и перемещение — через сервис.
 */

function frontDir(rot: number) {
  return new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
}

function SceneContent() {
  // Границы здания и точки камеры (см. sceneFrame.ts)
  const frame = useMemo(() => sceneFrame(), []);
  const { E, CENTER, OVERVIEW, SHOP } = frame;
  const controls = useRef<CameraControls>(null);
  // для автотестов и отладки: поставить камеру в точку и навести на цель
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__twinLookAt = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) =>
      controls.current?.setLookAt(px, py, pz, tx, ty, tz, false);
  }, []);
  const live = useApp((s) => s.live);
  const selected = useApp((s) => s.selected);
  const settings = useApp((s) => s.settings);
  const resetNonce = useApp((s) => s.resetViewNonce);
  const focusNonce = useApp((s) => s.focusNonce);
  const shopNonce = useApp((s) => s.shopViewNonce);
  const placeMode = useApp((s) => s.placeMode);
  const theme = useThemeMode();
  const autoFly = settings?.ui.autoFly ?? true;
  const wallMode = settings?.ui.wallMode ?? 'low';
  const underlay = settings?.ui.underlay ?? true;
  const showHall = settings?.ui.showHall ?? false;
  const drag = useRef<{ id: EquipmentId; dx: number; dz: number } | null>(null);
  const wallEdit = useWalls((s) => s.editMode);
  const topNonce = useWalls((s) => s.topViewNonce);
  const ed = useWallEditor();
  const endDragRef = useRef<() => void>(() => undefined);

  const bg = theme === 'light' ? '#dfe4e8' : '#0f1418';

  const look = (p: { pos: THREE.Vector3; target: THREE.Vector3 }, smooth: boolean) =>
    controls.current?.setLookAt(p.pos.x, p.pos.y, p.pos.z, p.target.x, p.target.y, p.target.z, smooth);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    void look(OVERVIEW, false);
    c.setBoundary(new THREE.Box3(new THREE.Vector3(E.minX - 4, 0, E.minZ - 4), new THREE.Vector3(E.maxX + 4, 6, E.maxZ + 4)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetNonce) void look(OVERVIEW, true);
  }, [resetNonce]);
  useEffect(() => {
    if (shopNonce) void look(SHOP, true);
  }, [shopNonce]);
  useEffect(() => {
    if (topNonce) void controls.current?.setLookAt(CENTER.x, 118, CENTER.z + 2, CENTER.x, 0, CENTER.z, true);
  }, [topNonce]);

  useEffect(() => {
    if (!focusNonce || !selected || !autoFly) return;
    const eq = EQUIPMENT.find((e) => e.id === selected);
    if (!eq) return;
    const p = getPose(eq.id);
    const screen = screenMeshes.get(eq.id)?.[0];
    if (screen) {
      // у модели есть живой экран: подлетаем к лицевой стороне так, чтобы экран читался, а аппарат был виден
      const sp = screen.getWorldPosition(new THREE.Vector3());
      const normal = screen.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      const h = equipmentSize(eq).h;
      const target = sp.clone().lerp(new THREE.Vector3(p.x, sp.y, p.z), 0.4);
      target.y = Math.max(0.6, sp.y - 0.15);
      const dist = THREE.MathUtils.clamp(h * 1.1, 2.0, 3.6);
      const side = new THREE.Vector3(normal.z, 0, -normal.x); // вбок, чтобы был виден объём
      const pos = target.clone().addScaledVector(normal, dist).addScaledVector(side, dist * 0.22).add(new THREE.Vector3(0, dist * 0.32, 0));
      void controls.current?.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
    } else {
      const target = new THREE.Vector3(p.x, 1.0, p.z);
      const dist = eq.viewRadius * 2.6;
      const pos = target.clone().add(frontDir(p.rotY).multiplyScalar(dist)).add(new THREE.Vector3(dist * 0.35, dist * 0.8, 0));
      void controls.current?.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const onSelect = useCallback((id: EquipmentId) => {
    if (useWalls.getState().editMode) return; // в редакторе стен щелчки по оборудованию не перехватываются
    selectEquipment(id, { focus: !useApp.getState().placeMode });
  }, []);

  // ---------- перетаскивание в режиме «Расстановка»
  const startDrag = (id: EquipmentId) => (e: ThreeEvent<PointerEvent>) => {
    const p = getPose(id);
    // смещение считаем по точке на полу под курсором, а не по точке на корпусе (иначе модель «прыгает»)
    const ground = e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.01), new THREE.Vector3()) ?? e.point;
    drag.current = { id, dx: p.x - ground.x, dz: p.z - ground.z };
    if (controls.current) controls.current.enabled = false;
    useSceneUi.setState({ dragging: true });
    // отпускание кнопки где угодно (в том числе над подписью или панелью) завершает перетаскивание
    window.addEventListener('pointerup', endDragRef.current, { once: true });
  };
  const onDragMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    const p = getPose(d.id);
    const snap = (v: number) => Math.round(v * 10) / 10;
    // Двигаем свободно, но только внутри зоны (иначе сервер отклонит PATCH).
    // Столкновения не запрещают движение: в базе станки могут уже стоять вплотную к стенам и друг к другу.
    // Панель «Расстановка» только предупреждает о наложении
    const next = clampServerPose(d.id, snap(e.point.x + d.dx), snap(e.point.z + d.dz));
    if (next.x !== p.x || next.z !== p.z) setPose(d.id, { ...p, x: next.x, z: next.z }, false);
  };
  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    useSceneUi.setState({ dragging: false });
    if (controls.current) controls.current.enabled = true;
    commitPose(d.id);
    setTimeout(() => reportBlocked(d.id, null), 2500);
  };  endDragRef.current = endDrag;


  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 120, 260]} />
      <hemisphereLight args={['#dfe9f2', '#3a3328', 0.75]} />
      <directionalLight
        position={[CENTER.x + 30, 60, CENTER.z + 40]}
        target-position={[CENTER.x, 0, CENTER.z]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-62}
        shadow-camera-right={62}
        shadow-camera-top={62}
        shadow-camera-bottom={-62}
        shadow-camera-far={200}
        shadow-bias={-0.0006}
      />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[20, 6, 1]} />
        <Lightformer intensity={1} position={[-8, 2, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer intensity={0.6} position={[8, 2, -4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
      </Environment>

      <CameraControls
        ref={controls}
        makeDefault
        minDistance={3}
        maxDistance={150}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2 - 0.08}
        dollyToCursor
        smoothTime={0.4}
      />

      <PlantBuilding
        theme={theme}
        wallMode={wallMode}
        underlay={underlay}
        onWallDown={wallEdit ? ed.onWallDown : undefined}
        onWallHover={wallEdit ? ed.onWallHover : undefined}
      />
      <WallEditorOverlay height={wallMode === 'full' ? LAYOUT.floorHeight : 1.4} ed={ed} />
      {/* GLB цеха можно наложить на чертёж кнопкой «Модель цеха» */}
      {showHall && <ServerBuilding />}
      <LabelProjector />

      {/* плоскость для перетаскивания (только в режиме расстановки) */}
      {placeMode && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[CENTER.x, 0.01, CENTER.z]}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
        >
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}

      {EQUIPMENT.map((eq) => {
        const eLive = live?.equipment[eq.id];
        const state = eLive ? deriveDisplayState(eLive) : 'no_comm';
        const tS = live?.sensors[sensorId(eq.id, 'temperature')];
        const temp = tS?.lastValue ?? 20;
        const heat = eq.kind === 'oven'
          ? THREE.MathUtils.clamp((temp - 40) / 200, 0, 1)
          : eq.kind === 'proofer' ? THREE.MathUtils.clamp((temp - 24) / 14, 0, 1) : 0;
        const pose = settings?.layout?.[eq.id] ?? { x: eq.position[0], z: eq.position[1], rotY: eq.rotationY };
        return (
          <EquipmentNode
            key={eq.id}
            eq={eq}
            pose={pose}
            placeMode={placeMode}
            onDragStart={startDrag(eq.id)}
            state={state}
            running={eLive?.runState === 'running' && state !== 'no_comm'}
            heat={heat}
            selected={selected === eq.id}
            onSelect={() => onSelect(eq.id)}
            info={{ title: `${eq.shortName} ${eq.id}`, value: keyReading(eq, live), state, readings: allReadings(eq, live) }}
          />
        );
      })}
    </>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('[scene] ошибка 3D-сцены', e);
  }
  render() {
    return this.state.error ? <SceneUnavailable reason="Ошибка инициализации 3D-графики." /> : this.props.children;
  }
}

export function SceneUnavailable({ reason }: { reason: string }) {
  return (
    <div className="scene-fallback" role="status">
      <div className="scene-fallback__box">
        <strong>3D-сцена недоступна</strong>
        <p>{reason} Возможно, браузер не поддерживает WebGL или аппаратное ускорение отключено.</p>
        <p>Список оборудования, показания, графики и журналы продолжают работать — выбирайте оборудование в списке.</p>
      </div>
    </div>
  );
}

function SceneTools() {
  const wallMode = useApp((s) => s.settings?.ui.wallMode ?? 'low');
  const underlay = useApp((s) => s.settings?.ui.underlay ?? true);
  const placeMode = useApp((s) => s.placeMode);
  const wallEdit = useWalls((s) => s.editMode);
  const showHall = useApp((s) => s.settings?.ui.showHall ?? false);
  const listHidden = useApp((s) => s.settings?.ui.listCollapsed ?? false);
  const screensOpen = useScreensPanel((s) => s.open);
  const labelMode = useLabelMode((s) => s.mode);
  const panels = useApp((s) => s.settings?.ui.panels) ?? { card: false, events: false, ppr: false };
  // Редактор стен и расстановка — только с правом записи
  const canEdit = useServer((s) => s.canEdit);
  const canEditWalls = useServer((s) => s.canEditWalls);
  const wallsLoaded = useWallsSync((s) => s.loaded);
  const togglePanel = (k: 'card' | 'events' | 'ppr') => setUi({ panels: { ...panels, [k]: !panels[k] } });
  const PANEL_BTNS: { k: 'card' | 'events' | 'ppr'; label: string; title: string }[] = [
    { k: 'card', label: '▤ Карточка', title: 'Карточка выбранного оборудования' },
    { k: 'events', label: '⚠ События', title: 'События и предупреждения' },
    { k: 'ppr', label: '🛠 ППР', title: 'ППР цеха' },
  ];
  return (
    <div className="scene-tools" role="toolbar" aria-label="Вид сцены">
      {!placeMode && !wallEdit && (
        <button type="button" className={`btn btn--sm scene-tools__list${listHidden ? ' btn--ghost' : ' is-on'}`}
          aria-pressed={!listHidden} onClick={() => setUi({ listCollapsed: !listHidden })}
          title={listHidden ? 'Показать список оборудования' : 'Скрыть список оборудования'}>
          ☰ Оборудование · {EQUIPMENT.length}
        </button>
      )}
      {!placeMode && !wallEdit && PANEL_BTNS.map((b) => (
        <button key={b.k} type="button" className={`btn btn--sm scene-tools__panel scene-tools__panel--${b.k}${panels[b.k] ? ' is-on' : ' btn--ghost'}`}
          aria-pressed={panels[b.k]} onClick={() => togglePanel(b.k)} title={(panels[b.k] ? 'Скрыть: ' : 'Показать: ') + b.title}>
          {b.label}
        </button>
      ))}
      <button type="button" className="btn btn--ghost btn--sm" onClick={requestOverview} title="Весь этаж">⌂ Весь этаж</button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={requestShopView} title="Помещение 024 «Цех-1 Выпечка»">Цех-1</button>
      <button type="button" className="btn btn--ghost btn--sm" aria-pressed={wallMode === 'full'}
        onClick={() => setUi({ wallMode: wallMode === 'full' ? 'low' : 'full' })}
        title="Высота стен: разрез 1,4 м или полная высота этажа 3,95 м">
        Стены: {wallMode === 'full' ? 'полные' : 'разрез'}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" aria-pressed={underlay} onClick={() => setUi({ underlay: !underlay })}
        title="Показать чертёж на полу">
        План на полу: {underlay ? 'вкл' : 'выкл'}
      </button>
      <button type="button" className={`btn btn--sm scene-tools__labels${labelMode === 'all' ? ' btn--ghost' : ' is-on'}`}
        onClick={() => setLabelMode(nextLabelMode(labelMode))}
        title="Подписи оборудования: все (дальние гаснут) / только выбранный и проблемные (авария, нет связи) / выкл">
        Подписи: {LABEL_MODE_TEXT[labelMode]}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" aria-pressed={showHall} onClick={() => setUi({ showHall: !showHall })}
        title="Наложить GLB-модель цеха с сервера на чертёж, чтобы проверить привязку">
        Модель цеха: {showHall ? 'вкл' : 'выкл'}
      </button>
      {!placeMode && !wallEdit && (
        <button type="button" className={`btn btn--sm scene-tools__screens${screensOpen ? ' is-on' : ' btn--ghost'}`} aria-pressed={screensOpen}
          onClick={() => useScreensPanel.setState({ open: !screensOpen })} title="Настроить экраны на оборудовании: что показывать, размер, место">
          ▣ Экраны
        </button>
      )}
      {canEditWalls && (
        // Пока версия стен неизвестна (нет связи и кэша), редактировать нельзя
        <button type="button" className={`btn btn--sm ${wallEdit ? 'btn--primary' : 'btn--ghost'}`} aria-pressed={wallEdit}
          disabled={!wallsLoaded}
          onClick={() => { if (!wallEdit) setPlaceMode(false); setWallEditMode(!wallEdit); if (!wallEdit) requestTopView(); }}
          title={!wallsLoaded ? 'Стены ещё не загружены с сервера' : 'Редактировать стены: перемещение, создание, удаление'}>
          ✎ Стены
        </button>
      )}
      {canEdit && (
        <button type="button" className={`btn btn--sm ${placeMode ? 'btn--primary' : 'btn--ghost'}`} aria-pressed={placeMode}
          onClick={() => setPlaceMode(!placeMode)} title="Перетаскивать оборудование по плану">
          ✥ Расстановка
        </button>
      )}
    </div>
  );
}

export default function PlantScene() {
  const webgl = isWebGLAvailable();
  const { OVERVIEW } = useMemo(() => sceneFrame(), []);
  const zones = useServer((s) => s.zones);
  // сброс 3D-контекста видеокартой (нехватка памяти, смена GPU, драйвер): не оставляем белое поле —
  // показываем «восстанавливаю» и пересоздаём холст
  const [canvasKey, setCanvasKey] = useState(0);
  const [lost, setLost] = useState(false);
  const lostTimer = useRef<number | null>(null);
  const onCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    const el = gl.domElement;
    const remount = () => {
      if (lostTimer.current) window.clearTimeout(lostTimer.current);
      lostTimer.current = null;
      setLost(false);
      setCanvasKey((k) => k + 1);
    };
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); // разрешить браузеру восстановить контекст
      console.warn('[scene] 3D-контекст потерян — восстанавливаю');
      setLost(true);
      // если браузер сам не вернул контекст за 2,5 с — создаём холст заново
      lostTimer.current = window.setTimeout(remount, 2500);
    }, false);
    el.addEventListener('webglcontextrestored', remount, false);
    // для автотестов: имитация потери контекста
    (window as unknown as Record<string, unknown>).__twinLoseContext = () => gl.getContext().getExtension('WEBGL_lose_context')?.loseContext();
  }, []);
  useEffect(() => () => { if (lostTimer.current) window.clearTimeout(lostTimer.current); }, []);
  if (!webgl) return <SceneUnavailable reason="WebGL недоступен в этом браузере." />;
  return (
    <SceneErrorBoundary>
      <Canvas
        key={canvasKey}
        shadows={isSoftwareRenderer() ? false : { type: THREE.PCFShadowMap }}
        dpr={isSoftwareRenderer() ? 1 : [1, 1.5]}
        camera={{ fov: 42, near: 0.2, far: 600, position: [OVERVIEW.pos.x, OVERVIEW.pos.y, OVERVIEW.pos.z] }}
        gl={{ antialias: !isSoftwareRenderer(), powerPreference: 'default' }}
        onCreated={onCreated}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>
      {lost && (
        <div className="scene-restoring" role="status">
          <div className="scene-fallback__box">Восстанавливаю 3D-сцену…</div>
        </div>
      )}
      <SceneLabels />
      <SceneTools />
      <PlacementPanel />
      <WallEditPanel />
      <ScreensPanel />
      <div className="scene-source" title={LAYOUT.source.note}>
        План: {LAYOUT.source.sheet.replace('Лист 7. ', '')} · 21/03-26-АР
        {zones.length > 0 && <> · зона {zones.map((z) => z.name).join(', ')}</>}
      </div>
    </SceneErrorBoundary>
  );
}

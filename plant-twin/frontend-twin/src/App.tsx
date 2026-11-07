import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { initApp } from './services/telemetryHub';
import { useWalls } from './services/walls';
import { useApp } from './store/appStore';
import { defaultPanels, loadSettings, type PanelsShown } from './storage/settings';
import { isWebGLAvailable } from './scene/webgl';
import { EquipmentCard } from './ui/card/EquipmentCard';
import { EquipmentList } from './ui/EquipmentList';
import { EventFeed } from './ui/EventFeed';
import { Header } from './ui/Header';
import { KpiStrip } from './ui/KpiStrip';
import { MaintenanceOverview } from './ui/MaintenanceOverview';
import { Toasts } from './ui/Toasts';
import { LoginScreen } from './ui/LoginScreen';
import { useConnectionAlert } from './ui/common/useConnectionAlert';
import { PanelBoundary } from './ui/common/PanelBoundary';

const PlantScene = lazy(() => import('./scene/PlantScene'));

export default function App() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const wallEdit = useWalls((s) => s.editMode);
  const placeMode = useApp((s) => s.placeMode);
  const listCollapsed = useApp((s) => s.settings?.ui.listCollapsed ?? false) && isWebGLAvailable();
  const editing = wallEdit || placeMode;
  const link = useConnectionAlert();
  const [bannerHidden, setBannerHidden] = useState(false);
  const panels = useApp((s) => s.settings?.ui.panels) ?? defaultPanels();
  const desktop = useDesktop();
  const gridStyle = desktop ? layoutGrid(panels, !editing && listCollapsed, editing) : undefined;

  useEffect(() => {
    void initApp();
  }, []);

  // Связь вернулась — скрытие сбрасывается: при следующем долгом обрыве предупреждение покажется снова
  useEffect(() => {
    if (!link.banner) setBannerHidden(false);
  }, [link.banner]);

  // Нет действующего токена: сначала вход
  if (phase === 'login') return <LoginScreen />;

  if (phase === 'loading') {
    return (
      <div className="boot">
        <div className="boot__box">
          <b>{loadSettings().ui.plantName}</b>
          <span>Загрузка цифрового двойника…</span>
          <small>Загрузка плана с сервера…</small>
        </div>
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div className="boot">
        <div className="boot__box">
          <b>Не удалось запустить приложение</b>
          <span>{error}</span>
          <button type="button" className="btn btn--primary" onClick={() => location.reload()}>Перезагрузить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      {link.banner && !bannerHidden && (
        <div className="storage-warning connection-banner" role="alert">
          <span>
            {link.chip === 'forbidden'
              ? 'У пользователя нет роли для получения статусов. Роль назначается в админке Django.'
              : 'Нет связи с сервером больше 2 минут: цвета и показания могут быть устаревшими. Соединение восстанавливается автоматически.'}
          </span>
          <button type="button" className="link-btn" onClick={() => setBannerHidden(true)}>Скрыть</button>
        </div>
      )}
      <PanelBoundary name="сводка"><KpiStrip /></PanelBoundary>
      <main className={`layout${editing ? ' is-editing' : ''}${!editing && listCollapsed ? ' list-collapsed' : ''}`} style={gridStyle}>
        <PanelBoundary name="список оборудования"><EquipmentList /></PanelBoundary>
        <section className="scene panel" aria-label="3D-сцена цеха">
          <Suspense fallback={<div className="scene-fallback"><div className="scene-fallback__box">Загрузка 3D-сцены…</div></div>}>
            <PlantScene />
          </Suspense>
        </section>
        {panels.card && <PanelBoundary name="карточка оборудования"><EquipmentCard /></PanelBoundary>}
        {panels.events && <PanelBoundary name="события"><EventFeed /></PanelBoundary>}
        {panels.ppr && <PanelBoundary name="ППР цеха"><MaintenanceOverview /></PanelBoundary>}
      </main>
      <Toasts />
    </div>
  );
}

/** Широкий экран (сетка из трёх колонок) */
function useDesktop() {
  const q = '(min-width: 1280px)';
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

/** Сетка на широком экране: скрытые панели не занимают места, сцена растягивается */
function layoutGrid(p: PanelsShown, listHidden: boolean, editing: boolean): CSSProperties {
  const bottom = p.events && p.ppr ? ['ppr', 'events'] : p.events ? ['events', 'events'] : p.ppr ? ['ppr', 'ppr'] : null;
  if (editing) {
    // режимы «Расстановка» и «Стены»: сцена во всю ширину (список и карточка спрятаны), снизу — события/ППР, если открыты
    const rowsE = [['scene', 'scene', 'scene'], ...(bottom ? [[bottom[0], bottom[1], bottom[1]]] : [])];
    return {
      gridTemplateColumns: '290px minmax(0, 1fr) minmax(380px, 440px)',
      gridTemplateRows: bottom ? 'minmax(420px, 1fr) 240px' : 'minmax(420px, 1fr)',
      gridTemplateAreas: rowsE.map((r) => `'${r.join(' ')}'`).join(' '),
    };
  }
  const top = listHidden ? ['scene', 'scene'] : ['list', 'scene'];
  const rows = [top, ...(bottom ? [bottom] : [])].map((r) => (p.card ? [...r, 'card'] : r));
  return {
    gridTemplateColumns: `290px minmax(0, 1fr)${p.card ? ' minmax(380px, 440px)' : ''}`,
    gridTemplateRows: bottom ? 'minmax(420px, 1fr) 240px' : 'minmax(420px, 1fr)',
    gridTemplateAreas: rows.map((r) => `'${r.join(' ')}'`).join(' '),
  };
}

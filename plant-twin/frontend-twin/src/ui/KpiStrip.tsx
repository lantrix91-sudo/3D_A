import { EQUIPMENT, useRegistry } from '../domain/config';
import { useApp } from '../store/appStore';
import { setUi } from '../services/telemetryHub';
import { useDisplayStates } from './common/useDerived';

export function KpiStrip() {
  useRegistry((s) => s.version);
  const states = useDisplayStates();
  const live = useApp((s) => s.live);

  const list = Object.values(states);
  const count = (st: string) => list.filter((s) => s === st).length;
  const runningUnits = EQUIPMENT.filter((e) => {
    const l = live?.equipment[e.id];
    return l?.runState === 'running' && l.comm === 'ok';
  }).length;

  const alarm = count('alarm');
  const nocomm = count('no_comm');
  const maint = count('maintenance');
  const collapsed = useApp((s) => s.settings?.ui.kpiCollapsed ?? false);
  const toggle = () => setUi({ kpiCollapsed: !collapsed });
  const noSensors = count('no_sensors');

  // Предупреждений, суммы токов и ППР у бэкенда пока нет.
  // Показывать там нули или «в срок» было бы неверно, поэтому этих плиток здесь нет

  if (collapsed) {
    // одна тонкая строка: главное видно, сцене — больше места
    return (
      <section className="kpis-mini" aria-label="Сводные показатели цеха (свёрнуто)">
        <span className="kpis-mini__item"><b>{EQUIPMENT.length}</b> оборуд.</span>
        <span className={`kpis-mini__item${runningUnits ? ' is-run' : ''}`}><b>{runningUnits}</b> в работе</span>
        <span className={`kpis-mini__item${alarm ? ' is-alarm' : ''}`}>◆ <b>{alarm}</b> аварий</span>
        {nocomm > 0 && <span className="kpis-mini__item is-nocomm">⨯ <b>{nocomm}</b> нет связи</span>}
        {maint > 0 && <span className="kpis-mini__item is-maint">⚒ <b>{maint}</b> на обслуж.</span>}
        <button type="button" className="kpis-toggle" onClick={toggle} aria-expanded={false} title="Показать сводку полностью">▾ Сводка</button>
      </section>
    );
  }

  return (
    <div className="kpis-wrap">
    <section className="kpis" aria-label="Сводные показатели цеха">
      <Kpi label="Оборудование" value={EQUIPMENT.length} sub="единиц в цехе" />
      <Kpi label="В работе" value={runningUnits} sub={`из ${EQUIPMENT.length}, по данным связи`} tone={runningUnits ? 'run' : undefined} />
      <Kpi label="Аварии" value={alarm} sub="единиц" tone={alarm ? 'alarm' : undefined} />
      <Kpi label="Нет связи" value={nocomm} sub="единиц" tone={nocomm ? 'nocomm' : undefined} />
      <Kpi label="На обслуживании" value={maint} sub="ТО и ремонт" tone={maint ? 'maint' : undefined} />
      <Kpi label="Без датчиков" value={noSensors} sub="устройство не привязано" />
    </section>
    <button type="button" className="kpis-toggle kpis-toggle--side" onClick={toggle} aria-expanded={true}
      aria-label="Свернуть сводку" title="Свернуть сводку — больше места для сцены">▴</button>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone?: string }) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <span className="kpi__label">{label}</span>
      <b className="kpi__value">{value}</b>
      <span className="kpi__sub">{sub}</span>
    </div>
  );
}

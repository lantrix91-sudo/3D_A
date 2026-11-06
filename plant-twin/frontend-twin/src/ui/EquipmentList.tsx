import { useState } from 'react';
import { EQUIPMENT, sensorsOf, useRegistry } from '../domain/config';
import { selectEquipment, setUi } from '../services/telemetryHub';
import { useApp, useClock } from '../store/appStore';
import { formatAgo } from '../utils/time';
import { StatePill } from './common/StatePill';
import { useDisplayStates } from './common/useDerived';
import { ServerEquipmentForm } from './ServerEquipmentForm';
import { useServer } from '../store/serverStore';
import { isWebGLAvailable } from '../scene/webgl';
import { EquipmentArchive } from './EquipmentArchive';

export function EquipmentList() {
  useRegistry((s) => s.version);
  const states = useDisplayStates();
  const live = useApp((s) => s.live);
  const selected = useApp((s) => s.selected);
  const now = useClock((s) => s.now);
  const [adding, setAdding] = useState(false);
  const [archive, setArchive] = useState(false);
  const collapsed = useApp((s) => s.settings?.ui.listCollapsed ?? false) && isWebGLAvailable();
  // Кнопка есть только у администратора (сервер проверяет права и сам)
  const canAdd = useServer((s) => s.canEdit);

  if (collapsed) return null; // скрыт: показывается кнопкой «☰ Оборудование» на панели сцены

  return (
    <nav className="eq-list panel" aria-label="Список оборудования">
      <div className="panel__bar">
        <h2 className="panel__title">Оборудование · {EQUIPMENT.length}</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setArchive(true)}>Архив</button>
        {canAdd && <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdding(true)}>+ Добавить</button>}
        <button type="button" className="eq-list__toggle" onClick={() => setUi({ listCollapsed: true })}
          aria-expanded={true} aria-label="Скрыть список оборудования" title="Скрыть список — больше места для сцены. Вернуть: кнопка «☰ Оборудование» на сцене">«</button>
      </div>
      <ul>
        {EQUIPMENT.map((e) => {
          const st = states[e.id];
          const l = live?.equipment[e.id];
          const lastTs = Math.max(0, ...sensorsOf(e.id).map((s) => live?.sensors[s.id]?.lastGoodTs ?? 0)) || null;
          return (
            <li key={e.id}>
              <button
                type="button"
                className={`eq-item eq-item--${st}${selected === e.id ? ' is-selected' : ''}`}
                aria-pressed={selected === e.id}
                onClick={() => selectEquipment(e.id)}
              >
                <span className="eq-item__head">
                  <span className="eq-item__name">{e.name}</span>
                  <span className="eq-item__id">{e.id}{e.server ? ` · ${e.server.type}` : ''}</span>
                </span>
                <StatePill state={st} size="sm" />
                <span className="eq-item__vals">
                  {/* В списке только числа и только если устройство привязано */}
                  {sensorsOf(e.id).filter((s) => e.server?.hasTelemetry && s.valueType === 'number').map((s) => {
                    const v = live?.sensors[s.id];
                    const ok = v?.hasData && v.lastValue != null;
                    return (
                      <span key={s.id} className={`mini mini--${v?.level ?? 'normal'}${ok ? '' : ' mini--nodata'}`}>
                        <em>{s.short ?? (s.label === 'Температура' ? 'T' : s.label === 'Влажность' ? 'RH' : 'I')}</em>
                        {ok ? `${v!.lastValue!.toFixed(s.precision)} ${s.unit}` : 'нет данных'}
                      </span>
                    );
                  })}
                </span>
                <span className="eq-item__meta">
                  {e.kind === 'generic' ? (
                    <>датчики не подключены</>
                  ) : (
                    <>
                      {l?.runState === 'stopped' ? 'Привод остановлен · ' : ''}
                      {lastTs ? `обновлено ${formatAgo(lastTs, now)}` : 'данных ещё не было'}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {EQUIPMENT.length === 0 && <p className="empty">{canAdd ? 'Оборудования нет. Добавьте его кнопкой «+ Добавить».' : 'Оборудования в плане нет.'}</p>}
      {adding && <ServerEquipmentForm onClose={() => setAdding(false)} />}
      {archive && <EquipmentArchive onClose={() => setArchive(false)} />}
    </nav>
  );
}

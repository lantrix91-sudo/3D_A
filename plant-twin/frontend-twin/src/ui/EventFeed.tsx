import { useMemo, useState } from 'react';
import { equipmentLabel } from '../domain/config';
import { selectEquipment } from '../services/telemetryHub';
import { useApp } from '../store/appStore';
import { formatDateTimeSec, formatTimeSec } from '../utils/time';

type Filter = 'all' | 'alerts' | 'selected';

export function EventFeed() {
  const events = useApp((s) => s.events);
  const selected = useApp((s) => s.selected);
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(() => {
    let list = events;
    if (filter === 'alerts') list = list.filter((e) => e.severity !== 'info' || e.type.endsWith('_end') || e.type === 'comm_restored');
    if (filter === 'selected') list = list.filter((e) => e.equipmentId === selected);
    return list.slice(0, 80);
  }, [events, filter, selected]);

  return (
    <section className="panel events" aria-label="Лента событий">
      <div className="panel__bar">
        <h2 className="panel__title">События и предупреждения</h2>
        <div className="seg" role="tablist" aria-label="Фильтр событий">
          {([['all', 'Все'], ['alerts', 'Тревоги'], ['selected', 'Выбранное']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'is-on' : ''}
              disabled={k === 'selected' && !selected} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty">Событий нет.</p>
      ) : (
        <ol className="events__list">
          {shown.map((e) => (
            <li key={e.id} className={`ev ev--${e.severity} ev--${e.type}`}>
              <time dateTime={new Date(e.ts).toISOString()} title={formatDateTimeSec(e.ts)}>{formatTimeSec(e.ts)}</time>
              {e.equipmentId ? (
                <button type="button" className="ev__eq" onClick={() => selectEquipment(e.equipmentId!)} title={equipmentLabel(e.equipmentId)}>
                  {e.equipmentId}
                </button>
              ) : (
                <span className="ev__eq ev__eq--sys">СИСТ</span>
              )}
              <span className="ev__sev" aria-label={sevLabel(e.severity)}>{sevGlyph(e.severity, e.type)}</span>
              <span className="ev__msg">{e.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function sevLabel(s: string) {
  return s === 'alarm' ? 'Авария' : s === 'warning' ? 'Предупреждение' : 'Информация';
}
function sevGlyph(s: string, type: string) {
  if (s === 'alarm') return '◆';
  if (s === 'warning') return '▲';
  if (type.endsWith('_end') || type === 'comm_restored') return '✓';
  return '·';
}

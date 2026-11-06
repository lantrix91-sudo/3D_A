import { EQUIPMENT_BY_ID, equipmentLabel } from '../domain/config';
import { JOURNALS_WRITABLE, PLAN_STATUS, planDisplayStatus } from '../services/journals';
import { selectEquipment } from '../services/telemetryHub';
import { useApp, useClock } from '../store/appStore';
import { DAY_MS, formatDate } from '../utils/time';

export function MaintenanceOverview() {
  const plans = useApp((s) => s.plans);
  const now = useClock((s) => s.now);
  const open = plans
    .filter((p) => p.status !== 'done' && !!EQUIPMENT_BY_ID[p.equipmentId])
    .sort((a, b) => a.plannedDate - b.plannedDate);
  const overdue = open.filter((p) => planDisplayStatus(p, now) === 'overdue');
  const upcoming = open.filter((p) => planDisplayStatus(p, now) === 'planned').slice(0, 5);

  const row = (p: (typeof plans)[number]) => {
    const st = planDisplayStatus(p, now);
    const days = Math.round((p.plannedDate - now) / DAY_MS);
    return (
      <li key={p.id} className={`ppr-row ppr-row--${st}`}>
        <button type="button" className="ppr-row__eq" onClick={() => selectEquipment(p.equipmentId)} title={equipmentLabel(p.equipmentId)}>
          {p.equipmentId}
        </button>
        <span className="ppr-row__title">{p.title}</span>
        <span className="ppr-row__date">
          {formatDate(p.plannedDate)}
          <small>{st === 'overdue' ? `${PLAN_STATUS.overdue.toLowerCase()} на ${-days} дн.` : days === 0 ? 'сегодня' : `через ${days} дн.`}</small>
        </span>
      </li>
    );
  };

  return (
    <section className="panel ppr-overview" aria-label="Ближайшие и просроченные ППР">
      <h2 className="panel__title">ППР цеха</h2>
      {!JOURNALS_WRITABLE && <p className="hint">На сервере пока нет данных ППР.</p>}
      <h3 className="sub-title sub-title--warn">Просрочено · {overdue.length}</h3>
      {overdue.length ? <ul>{overdue.map(row)}</ul> : <p className="empty">Просроченных работ нет.</p>}
      <h3 className="sub-title">Ближайшие</h3>
      {upcoming.length ? <ul>{upcoming.map(row)}</ul> : <p className="empty">Нет запланированных работ.</p>}
    </section>
  );
}

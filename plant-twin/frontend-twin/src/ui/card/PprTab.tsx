import { useState } from 'react';
import { EQUIPMENT, equipmentLabel } from '../../domain/config';
import type { EquipmentId, MaintenancePlan } from '../../domain/types';
import {
  completePlan,
  emptyPlan,
  exportPlansCsv,
  JOURNALS_WRITABLE,
  PLAN_STATUS,
  planDisplayStatus,
  savePlan,
  validatePlan,
} from '../../services/journals';
import { useApp, useClock } from '../../store/appStore';
import { formatDate, fromDateInput, toDateInput } from '../../utils/time';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

const ORDER = { overdue: 0, planned: 1, done: 2 } as const;

export function PprTab({ equipmentId }: { equipmentId: EquipmentId }) {
  const plans = useApp((s) => s.plans);
  const records = useApp((s) => s.records);
  const now = useClock((s) => s.now);
  const [edit, setEdit] = useState<MaintenancePlan | null>(null);
  const [complete, setComplete] = useState<MaintenancePlan | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const mine = plans.filter((p) => p.equipmentId === equipmentId);
  const active = mine
    .filter((p) => p.status !== 'done')
    .sort((a, b) => ORDER[planDisplayStatus(a, now)] - ORDER[planDisplayStatus(b, now)] || a.plannedDate - b.plannedDate);
  const done = mine.filter((p) => p.status === 'done').sort((a, b) => (b.actualDate ?? 0) - (a.actualDate ?? 0));
  const recs = records.filter((r) => r.equipmentId === equipmentId).sort((a, b) => b.completedAt - a.completedAt);

  return (
    <div className="journal">
      <div className="journal__bar">
        <span className="journal__count">В плане: {active.length} · выполнено: {done.length}</span>
        {JOURNALS_WRITABLE && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportPlansCsv(equipmentId)}>CSV</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(emptyPlan(equipmentId))}>+ Работа ППР</button>
          </>
        )}
      </div>
      {!JOURNALS_WRITABLE && <p className="hint">На сервере пока нет данных ППР.</p>}
      {active.length === 0 ? (
        <p className="empty">Запланированных работ нет.</p>
      ) : (
        <ul className="records">
          {active.map((p) => {
            const st = planDisplayStatus(p, now);
            return (
              <li key={p.id} className={`record record--${st}`}>
                <div className="record__head">
                  <span className={`chip chip--${st}`}>{PLAN_STATUS[st]}</span>
                  <time>План: {formatDate(p.plannedDate)}</time>
                </div>
                <h4 className="record__title">{p.title}</h4>
                <dl className="record__grid">
                  <dt>Перечень работ</dt><dd>{p.works || '—'}</dd>
                  <dt>Периодичность</dt><dd>{p.periodDays > 0 ? `каждые ${p.periodDays} дн.` : 'разовая'}</dd>
                  <dt>Ответственный</dt><dd>{p.responsible || '—'}</dd>
                  {p.comment && (<><dt>Комментарий</dt><dd>{p.comment}</dd></>)}
                </dl>
                <div className="record__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(p)}>Редактировать</button>
                  <button type="button" className="btn btn--sm" onClick={() => setComplete(p)}>Отметить выполнение</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="disclosure" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
        {showHistory ? '▾' : '▸'} История выполнения ({recs.length})
      </button>
      {showHistory && (
        recs.length === 0 ? <p className="empty">Выполненных работ пока нет.</p> : (
          <div className="table-wrap">
            <table className="hist-table">
              <thead>
                <tr><th>Дата</th><th>Работа</th><th>Ответственный</th><th>Комментарий</th></tr>
              </thead>
              <tbody>
                {recs.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.completedAt)}</td>
                    <td>{r.title}</td>
                    <td>{r.responsible || '—'}</td>
                    <td>{r.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {edit && <PlanForm initial={edit} onClose={() => setEdit(null)} />}
      {complete && <CompleteForm p={complete} onClose={() => setComplete(null)} />}
    </div>
  );
}

function PlanForm({ initial, onClose }: { initial: MaintenancePlan; onClose: () => void }) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MaintenancePlan>(k: K, v: MaintenancePlan[K]) => setP((x) => ({ ...x, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePlan(p);
    if (err) return setError(err);
    const res = await savePlan(p);
    if (res) setError(res);
    else onClose();
  };
  return (
    <Modal
      title={initial.id ? 'Редактирование работы ППР' : 'Новая работа ППР'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="submit" form="ppr-form" className="btn btn--primary">Сохранить</button>
        </>
      }
    >
      <form id="ppr-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Оборудование" htmlFor="ppr-eq">
          <select id="ppr-eq" className="select" value={p.equipmentId} onChange={(e) => set('equipmentId', e.target.value as EquipmentId)} disabled={!!initial.id}>
            {EQUIPMENT.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
          </select>
        </Field>
        <Field label="Плановая дата *" htmlFor="ppr-date">
          <input id="ppr-date" type="date" className="input" value={toDateInput(p.plannedDate)} onChange={(e) => set('plannedDate', fromDateInput(e.target.value) ?? 0)} />
        </Field>
        <Field label="Название работы *" htmlFor="ppr-title" full>
          <input id="ppr-title" className="input" value={p.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
        </Field>
        <Field label="Перечень работ" htmlFor="ppr-works" full>
          <textarea id="ppr-works" className="input" rows={3} value={p.works} onChange={(e) => set('works', e.target.value)} maxLength={1500} />
        </Field>
        <Field label="Периодичность, дней" htmlFor="ppr-period" hint="0 — разовая работа">
          <input id="ppr-period" type="number" min={0} max={3650} className="input" value={p.periodDays}
            onChange={(e) => set('periodDays', e.target.value === '' ? 0 : Number(e.target.value))} />
        </Field>
        <Field label="Ответственный" htmlFor="ppr-resp">
          <input id="ppr-resp" className="input" value={p.responsible} onChange={(e) => set('responsible', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Комментарий" htmlFor="ppr-comment" full>
          <input id="ppr-comment" className="input" value={p.comment} onChange={(e) => set('comment', e.target.value)} maxLength={500} />
        </Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function CompleteForm({ p, onClose }: { p: MaintenancePlan; onClose: () => void }) {
  const [date, setDate] = useState<number | null>(Date.now());
  const [resp, setResp] = useState(p.responsible);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await completePlan(p, date ?? 0, resp, comment);
    if (res) setError(res);
    else onClose();
  };
  return (
    <Modal
      title="Отметка выполнения ППР"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="submit" form="ppr-done" className="btn btn--primary">Отметить выполненной</button>
        </>
      }
    >
      <form id="ppr-done" className="form-grid" onSubmit={submit} noValidate>
        <p className="field--full">
          <b>{p.title}</b> · {equipmentLabel(p.equipmentId)} {p.equipmentId}
          <br />
          <small>Плановая дата {formatDate(p.plannedDate)}. {p.periodDays > 0
            ? `После отметки будет создана следующая запись: фактическая дата + ${p.periodDays} дн.`
            : 'Разовая работа — следующая запись не создаётся.'}</small>
        </p>
        <Field label="Фактическая дата *" htmlFor="pd-date">
          <input id="pd-date" type="date" className="input" value={toDateInput(date)} max={toDateInput(Date.now())}
            onChange={(e) => setDate(fromDateInput(e.target.value))} />
        </Field>
        <Field label="Исполнитель" htmlFor="pd-resp">
          <input id="pd-resp" className="input" value={resp} onChange={(e) => setResp(e.target.value)} />
        </Field>
        <Field label="Комментарий" htmlFor="pd-comment" full>
          <textarea id="pd-comment" className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

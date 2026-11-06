import { useState } from 'react';
import type { Breakdown, BreakdownStatus, EquipmentId } from '../../domain/types';
import {
  BREAKDOWN_STATUS,
  closeBreakdown,
  downtimeMs,
  emptyBreakdown,
  exportBreakdownsCsv,
  saveBreakdown,
  validateBreakdown,
} from '../../services/journals';
import { useApp, useClock } from '../../store/appStore';
import { formatDateTime, formatDuration, fromLocalInput, toLocalInput } from '../../utils/time';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

export function BreakdownsTab({ equipmentId }: { equipmentId: EquipmentId }) {
  const all = useApp((s) => s.breakdowns);
  const now = useClock((s) => s.now);
  const [edit, setEdit] = useState<Breakdown | null>(null);
  const [closing, setClosing] = useState<Breakdown | null>(null);
  const list = all.filter((b) => b.equipmentId === equipmentId).sort((a, b) => b.occurredAt - a.occurredAt);
  const active = list.filter((b) => b.status !== 'resolved').length;

  return (
    <div className="journal">
      <div className="journal__bar">
        <span className="journal__count">Записей: {list.length} · активных: {active}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportBreakdownsCsv(equipmentId)}>CSV</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEdit(emptyBreakdown(equipmentId))}>+ Неисправность</button>
      </div>
      {list.length === 0 ? (
        <p className="empty">Неисправностей не зарегистрировано.</p>
      ) : (
        <ul className="records">
          {list.map((b) => {
            const dt = downtimeMs(b, now);
            return (
              <li key={b.id} className={`record record--${b.status}`}>
                <div className="record__head">
                  <span className={`chip chip--${b.status}`}>{BREAKDOWN_STATUS[b.status]}</span>
                  <time>{formatDateTime(b.occurredAt)}</time>
                </div>
                <h4 className="record__title">{b.description}</h4>
                <dl className="record__grid">
                  <dt>Причина</dt><dd>{b.cause || '—'}</dd>
                  <dt>Выполненные работы</dt><dd>{b.worksDone || '—'}</dd>
                  <dt>Простой</dt>
                  <dd>
                    {b.downtimeStart == null ? 'без простоя' : (
                      <>
                        {formatDateTime(b.downtimeStart)} — {b.downtimeEnd ? formatDateTime(b.downtimeEnd) : 'продолжается'}
                        <b className="record__dur"> · {formatDuration(dt)}</b>
                      </>
                    )}
                  </dd>
                  <dt>Ответственный</dt><dd>{b.responsible || '—'}</dd>
                  {b.comment && (<><dt>Комментарий</dt><dd>{b.comment}</dd></>)}
                </dl>
                <div className="record__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEdit(b)}>Редактировать</button>
                  {b.status !== 'resolved' && (
                    <button type="button" className="btn btn--sm" onClick={() => setClosing(b)}>Закрыть неисправность</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <BreakdownForm initial={edit} onClose={() => setEdit(null)} />}
      {closing && <CloseBreakdownForm b={closing} onClose={() => setClosing(null)} />}
    </div>
  );
}

function BreakdownForm({ initial, onClose }: { initial: Breakdown; onClose: () => void }) {
  const [b, setB] = useState<Breakdown>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasDowntime, setHasDowntime] = useState(initial.downtimeStart != null);
  const set = <K extends keyof Breakdown>(k: K, v: Breakdown[K]) => setB((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rec = { ...b, downtimeStart: hasDowntime ? b.downtimeStart : null, downtimeEnd: hasDowntime ? b.downtimeEnd : null };
    const err = validateBreakdown(rec);
    if (err) return setError(err);
    setBusy(true);
    const res = await saveBreakdown(rec);
    setBusy(false);
    if (res) setError(res);
    else onClose();
  };

  return (
    <Modal
      title={initial.id ? 'Редактирование неисправности' : 'Новая неисправность'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="submit" form="brk-form" className="btn btn--primary" disabled={busy}>Сохранить</button>
        </>
      }
    >
      <form id="brk-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Дата и время возникновения *" htmlFor="brk-occ">
          <input id="brk-occ" type="datetime-local" className="input" value={toLocalInput(b.occurredAt)}
            onChange={(e) => set('occurredAt', fromLocalInput(e.target.value) ?? 0)} required />
        </Field>
        <Field label="Статус" htmlFor="brk-status">
          <select id="brk-status" className="select" value={b.status} onChange={(e) => set('status', e.target.value as BreakdownStatus)}>
            {Object.entries(BREAKDOWN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Описание неисправности *" htmlFor="brk-desc" full>
          <input id="brk-desc" className="input" value={b.description} onChange={(e) => set('description', e.target.value)} required maxLength={300} />
        </Field>
        <Field label="Причина" htmlFor="brk-cause" full>
          <input id="brk-cause" className="input" value={b.cause} onChange={(e) => set('cause', e.target.value)} maxLength={300} />
        </Field>
        <Field label="Выполненные работы" htmlFor="brk-works" full>
          <textarea id="brk-works" className="input" rows={2} value={b.worksDone} onChange={(e) => set('worksDone', e.target.value)} maxLength={1000} />
        </Field>
        <div className="field field--full field--check">
          <input id="brk-has-dt" type="checkbox" checked={hasDowntime} onChange={(e) => {
            setHasDowntime(e.target.checked);
            if (e.target.checked && b.downtimeStart == null) set('downtimeStart', b.occurredAt);
          }} />
          <label htmlFor="brk-has-dt">Был простой оборудования</label>
        </div>
        {hasDowntime && (
          <>
            <Field label="Начало простоя" htmlFor="brk-dts">
              <input id="brk-dts" type="datetime-local" className="input" value={toLocalInput(b.downtimeStart)}
                onChange={(e) => set('downtimeStart', fromLocalInput(e.target.value))} />
            </Field>
            <Field label="Окончание простоя" htmlFor="brk-dte" hint="Пусто — простой продолжается">
              <input id="brk-dte" type="datetime-local" className="input" value={toLocalInput(b.downtimeEnd)}
                min={toLocalInput(b.downtimeStart)} onChange={(e) => set('downtimeEnd', fromLocalInput(e.target.value))} />
            </Field>
            <p className="field--full calc">
              Продолжительность простоя: <b>{b.downtimeStart != null ? formatDuration((b.downtimeEnd ?? Date.now()) - b.downtimeStart) : '—'}</b>
              {b.downtimeEnd == null && b.downtimeStart != null ? ' (продолжается)' : ''}
            </p>
          </>
        )}
        <Field label="Ответственный" htmlFor="brk-resp">
          <input id="brk-resp" className="input" value={b.responsible} onChange={(e) => set('responsible', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Комментарий" htmlFor="brk-comment">
          <input id="brk-comment" className="input" value={b.comment} onChange={(e) => set('comment', e.target.value)} maxLength={500} />
        </Field>
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function CloseBreakdownForm({ b, onClose }: { b: Breakdown; onClose: () => void }) {
  const [works, setWorks] = useState(b.worksDone);
  const [end, setEnd] = useState<number | null>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!works.trim()) return setError('Опишите выполненные работы');
    const res = await closeBreakdown(b, works, end);
    if (res) setError(res);
    else onClose();
  };
  return (
    <Modal
      title="Закрытие неисправности"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>Отмена</button>
          <button type="submit" form="brk-close" className="btn btn--primary">Отметить устранённой</button>
        </>
      }
    >
      <form id="brk-close" className="form-grid" onSubmit={submit} noValidate>
        <p className="field--full"><b>{b.description}</b><br /><small>возникла {formatDateTime(b.occurredAt)}</small></p>
        <Field label="Выполненные работы *" htmlFor="cl-works" full>
          <textarea id="cl-works" className="input" rows={3} value={works} onChange={(e) => setWorks(e.target.value)} />
        </Field>
        {b.downtimeStart != null ? (
          <Field label="Окончание простоя" htmlFor="cl-end" full hint={`Начало простоя: ${formatDateTime(b.downtimeStart)}`}>
            <input id="cl-end" type="datetime-local" className="input" value={toLocalInput(end)} min={toLocalInput(b.downtimeStart)}
              onChange={(e) => setEnd(fromLocalInput(e.target.value))} />
          </Field>
        ) : (
          <p className="field--full hint">Простой по этой неисправности не фиксировался.</p>
        )}
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

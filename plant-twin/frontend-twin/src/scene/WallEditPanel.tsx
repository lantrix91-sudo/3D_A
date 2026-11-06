import { useEffect, useRef, useState } from 'react';
import { axisRef, type WallKind } from '../domain/layout';
import { logSystemEvent } from '../services/telemetryHub';
import {
  WALL_KIND_LABEL,
  deleteColumn,
  deleteSelected,
  deleteWall,
  exportWallsJson,
  importWallsJson,
  redoWalls,
  requestTopView,
  resetWallsToProject,
  setWallEditMode,
  setWallLength,
  setWallOption,
  setWallTool,
  undoWalls,
  updateWall,
  useWalls,
  wallLength,
  wallStats,
  type WallTool,
} from '../services/walls';
import { toast } from '../store/appStore';
import { useCollision } from '../services/collision';
import { ConfirmModal } from '../ui/common/Modal';
import { FloatingPanel } from './FloatingPanel';
import { keepMineWalls, takeServerWalls, useWallsSync } from '../services/serverWalls';
import { formatDateTimeSec } from '../utils/time';

/** Строка о сохранении на сервер. При ошибке и конфликте message содержит причину */
function syncText(status: string, message: string | null, version: number | null): string {
  if (status === 'offline') return 'Нет связи с сервером: правки сохранены в черновике браузера и уйдут, когда связь появится';
  if (message) return message;
  if (status === 'pending') return 'Есть несохранённые правки…';
  if (status === 'saving') return 'Сохраняется на сервере…';
  return version ? `Сохранено на сервере, версия ${version}` : 'Стены проекта: на сервер ещё не сохранялись';
}

const TOOLS: { id: WallTool; label: string; key: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', key: 'V', hint: 'Выбрать стену или колонну; стену можно перетащить целиком или за белые маркеры на концах' },
  { id: 'draw', label: 'Стена', key: 'D', hint: 'Щелчками ставьте точки; Esc, двойной щелчок или правая кнопка — закончить' },
  { id: 'erase', label: 'Удалить', key: 'E', hint: 'Щелчок по стене или колонне удаляет её' },
];
const KINDS: WallKind[] = ['outer', 'inner', 'new', 'partition'];
/** Типовая толщина, м: перегородка, кладка в 1, 1,5 и 2 кирпича */
const T_PRESETS = [0.12, 0.25, 0.38, 0.51];

export function WallEditPanel() {
  const s = useWalls();
  const sync = useWallsSync();
  const wallBlocked = useCollision((c) => c.wallBlocked);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sel = s.selected ? s.walls.find((w) => w.id === s.selected) ?? null : null;
  const selCol = s.selected ? s.columns.find((c) => c.id === s.selected) ?? null : null;
  const [lenDraft, setLenDraft] = useState('');
  // толщина новой стены: черновик в поле, применяется по Enter или при уходе из поля
  const [newTDraft, setNewTDraft] = useState(() => String(useWalls.getState().newThickness));
  const applyNewT = () => {
    const v = Number(newTDraft.replace(',', '.'));
    if (!(v >= 0.05 && v <= 1.5)) {
      toast('Толщина стены — от 0,05 до 1,5 м', 'error');
      setNewTDraft(String(useWalls.getState().newThickness));
      return;
    }
    const r = Math.round(v * 1000) / 1000;
    setWallOption({ newThickness: r });
    setNewTDraft(String(r));
  };
  const [tDraft, setTDraft] = useState('');

  useEffect(() => {
    setLenDraft(sel ? wallLength(sel).toFixed(2) : '');
    setTDraft(sel ? String(sel.t) : '');
  }, [sel?.id, sel?.x1, sel?.x2, sel?.z1, sel?.z2, sel?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // горячие клавиши
  useEffect(() => {
    if (!s.editMode) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const st = useWalls.getState();
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) redoWalls();
        else undoWalls();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        redoWalls();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && st.selected) {
        e.preventDefault();
        deleteSelected();
      } else if (e.code === 'Escape') {
        if (st.drawStart) useWalls.setState({ drawStart: null });
        else if (st.selected) useWalls.setState({ selected: null });
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tool = TOOLS.find((x) => e.code === `Key${x.key}`);
        if (tool) setWallTool(tool.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.editMode]);

  if (!s.editMode) return null;
  const stats = wallStats();
  const previewLen = s.tool === 'draw' && s.drawStart && s.cursor ? Math.hypot(s.cursor[0] - s.drawStart[0], s.cursor[1] - s.drawStart[1]) : null;

  const finish = () => {
    setWallEditMode(false);
    if (s.undo.length) {
      void logSystemEvent(`Изменена планировка стен: добавлено ${stats.added}, изменено ${stats.changed}, удалено ${stats.removed} (всего ${stats.total}); удалено колонн: ${stats.columnsRemoved}`);
    }
  };

  const applyLen = () => {
    if (!sel) return;
    const v = Number(lenDraft.replace(',', '.'));
    if (!(v >= 0.2 && v <= 200)) {
      toast('Длина стены — от 0,2 до 200 м', 'error');
      setLenDraft(wallLength(sel).toFixed(2));
      return;
    }
    if (Math.abs(v - wallLength(sel)) < 0.005) return;
    setWallLength(sel.id, v);
  };
  const applyT = () => {
    if (!sel) return;
    const v = Number(tDraft.replace(',', '.'));
    if (!(v >= 0.05 && v <= 1.5)) {
      toast('Толщина — от 0,05 до 1,5 м', 'error');
      setTDraft(String(sel.t));
      return;
    }
    if (Math.abs(v - sel.t) < 0.0005) return;
    updateWall(sel.id, { t: Math.round(v * 1000) / 1000 });
  };

  return (
    <FloatingPanel
      id="walls"
      title="Редактор стен"
      className="wall-panel"
      ariaLabel="Редактор стен"
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={finish}>Готово</button>}
      more={
        <>
          <div className="wall-panel__opts">
            <label><input id="wopt-grid" type="checkbox" checked={s.snapGrid} onChange={(e) => setWallOption({ snapGrid: e.target.checked })} /> Сетка 0,1 м</label>
            <label><input id="wopt-magnet" type="checkbox" checked={s.magnet} onChange={(e) => setWallOption({ magnet: e.target.checked })} /> Магнит к концам</label>
            <label><input id="wopt-ortho" type="checkbox" checked={s.ortho} onChange={(e) => setWallOption({ ortho: e.target.checked })} /> Только 0°/90°</label>
          </div>
          <div className="place-panel__row">
            <button type="button" className="btn btn--ghost btn--sm" onClick={exportWallsJson}>Выгрузить JSON</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}>Загрузить JSON</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmReset(true)} disabled={!s.modified}>Вернуть по проекту</button>
          </div>
          <p className="place-panel__hint">
            Изменения сохраняются на сервере автоматически, примерно через секунду. JSON — резервная копия.
            {' '}Клавиши: V, D, E — инструменты; Ctrl+Z / Ctrl+Y; Del — удалить выбранное.
          </p>
        </>
      }
    >
      <div className={`wall-sync wall-sync--${sync.status}`} role="status">
        <p>{syncText(sync.status, sync.message, sync.version)}</p>
        {sync.status !== 'conflict' && sync.updatedBy && sync.updatedAt != null && (
          <small>Изменил {sync.updatedBy}, {formatDateTimeSec(sync.updatedAt * 1000)}</small>
        )}
        {/* Конфликт решает человек: автоматически ничего не перезаписываем */}
        {sync.status === 'conflict' && (
          <div className="wall-sync__actions">
            <button type="button" className="btn btn--sm" onClick={() => void takeServerWalls()}>Взять версию с сервера</button>
            <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => void keepMineWalls()}>Записать мою поверх</button>
          </div>
        )}
      </div>
      <div className="seg seg--full" role="radiogroup" aria-label="Инструмент">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={s.tool === t.id} className={s.tool === t.id ? 'is-on' : ''}
            onClick={() => setWallTool(t.id)} title={`${t.hint} (клавиша ${t.key})`}>
            {t.label} <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <p className="wall-panel__hint">{TOOLS.find((t) => t.id === s.tool)!.hint}</p>

      {s.tool === 'draw' && (
        <div className="wall-panel__group">
          <div className="wall-panel__row2">
            <label htmlFor="wnew-kind">Тип</label>
            <select id="wnew-kind" className="select" value={s.newKind} onChange={(e) => setWallOption({ newKind: e.target.value as WallKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{WALL_KIND_LABEL[k]}</option>)}
            </select>
            <label htmlFor="wnew-t">Толщина, м</label>
            <input id="wnew-t" className="input input--num" inputMode="decimal" value={newTDraft}
              onChange={(e) => setNewTDraft(e.target.value)}
              onBlur={applyNewT}
              onKeyDown={(e) => { if (e.key === 'Enter') { applyNewT(); e.currentTarget.blur(); } }} />
          </div>
          <div className="wall-panel__presets" role="group" aria-label="Типовая толщина">
            {T_PRESETS.map((t) => (
              <button key={t} type="button" className={`btn btn--sm${Math.abs(s.newThickness - t) < 0.0005 ? ' is-on' : ''}`}
                onClick={() => { setWallOption({ newThickness: t }); setNewTDraft(String(t)); }}>
                {String(t).replace('.', ',')}
              </button>
            ))}
          </div>
          <p className="wall-panel__status">
            {s.drawStart ? <>Длина сегмента: <b>{previewLen != null ? `${previewLen.toFixed(2)} м` : '—'}</b></> : 'Щёлкните по полу, чтобы начать стену'}
          </p>
        </div>
      )}

      {s.tool === 'select' && (sel || selCol) && (
        sel ? (
          <div className="wall-panel__group">
            <p className="wall-panel__sel">Стена <b>{sel.id}</b>{sel.id.startsWith('N') ? ' · новая' : ''}</p>
            <div className="wall-panel__row2">
              <label htmlFor="wsel-kind">Тип</label>
              <select id="wsel-kind" className="select" value={sel.kind} onChange={(e) => updateWall(sel.id, { kind: e.target.value as WallKind })}>
                {KINDS.map((k) => <option key={k} value={k}>{WALL_KIND_LABEL[k]}</option>)}
              </select>
              <label htmlFor="wsel-len">Длина, м</label>
              <input id="wsel-len" className="input input--num" inputMode="decimal" value={lenDraft}
                onChange={(e) => setLenDraft(e.target.value)} onBlur={applyLen} onKeyDown={(e) => { if (e.key === 'Enter') { applyLen(); e.currentTarget.blur(); } }} />
              <label htmlFor="wsel-t">Толщина, м</label>
              <input id="wsel-t" className="input input--num" inputMode="decimal" value={tDraft}
                onChange={(e) => setTDraft(e.target.value)} onBlur={applyT} onKeyDown={(e) => { if (e.key === 'Enter') { applyT(); e.currentTarget.blur(); } }} />
            </div>
            <p className="wall-panel__coords">
              ({sel.x1.toFixed(2)}; {sel.z1.toFixed(2)}) → ({sel.x2.toFixed(2)}; {sel.z2.toFixed(2)}) м
            </p>
            <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => deleteWall(sel.id)}>Удалить стену (Del)</button>
          </div>
        ) : selCol ? (
          <div className="wall-panel__group">
            <p className="wall-panel__sel">Колонна <b>{selCol.id}</b></p>
            <p className="wall-panel__coords">{axisRef(selCol.x, selCol.z)} · X {selCol.x.toFixed(2)}; Z {selCol.z.toFixed(2)} м</p>
            <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => deleteColumn(selCol.id)}>Удалить колонну (Del)</button>
          </div>
        ) : null
      )}

      {wallBlocked && <p className="place-panel__block" role="status">⛔ Стена не может пройти сквозь оборудование: {wallBlocked}</p>}
      <div className="place-panel__row">
        <button type="button" className="btn btn--sm" onClick={undoWalls} disabled={!s.undo.length} title="Отменить (Ctrl+Z)" aria-label="Отменить">↶</button>
        <button type="button" className="btn btn--sm" onClick={redoWalls} disabled={!s.redo.length} title="Повторить (Ctrl+Y)" aria-label="Повторить">↷</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={requestTopView}>Вид сверху</button>
      </div>

      <p className="wall-panel__stats">
        Стен: {stats.total} (+{stats.added} / изм. {stats.changed} / −{stats.removed}) · колонн: {stats.columns} (−{stats.columnsRemoved})
      </p>
      {importErr && <p className="form-error" role="alert">{importErr}</p>}

      <input ref={fileRef} id="walls-import" type="file" accept="application/json,.json" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setImportErr(await importWallsJson(f));
        }} />

      {confirmReset && (
        <ConfirmModal
          title="Вернуть стены и колонны по проекту?"
          danger
          confirmLabel="Вернуть по проекту"
          onClose={() => setConfirmReset(false)}
          onConfirm={() => { setConfirmReset(false); resetWallsToProject(); }}
          text={<p>Все добавленные, перемещённые и удалённые стены и удалённые колонны вернутся к состоянию листа 7 проекта 21/03-26-АР. До закрытия страницы это можно отменить кнопкой «Отменить».</p>}
        />
      )}
    </FloatingPanel>
  );
}

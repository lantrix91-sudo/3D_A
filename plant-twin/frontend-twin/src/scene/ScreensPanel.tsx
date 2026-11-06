import { useState } from 'react';
import { create } from 'zustand';
import { EQUIPMENT_BY_ID } from '../domain/config';
import { equipmentSize } from '../services/models3d';
import { setUi } from '../services/telemetryHub';
import { defaultScreens, type ScreenContent, type ScreenPlace, type ScreenSide, type ScreenSize, type ScreenSettings } from '../storage/settings';
import { useApp } from '../store/appStore';
import { FloatingPanel } from './FloatingPanel';
import { useInfoScreens } from './infoScreen';

/** Открыта ли панель «Экраны» */
export const useScreensPanel = create<{ open: boolean }>(() => ({ open: false }));

const CONTENT: { id: ScreenContent; label: string }[] = [
  { id: 'main', label: 'Главное показание' },
  { id: 'all', label: 'Все показания' },
  { id: 'state', label: 'Только состояние' },
];
const SIZES: { id: ScreenSize; label: string }[] = [
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
];
const STEPS = [0.01, 0.05, 0.1];
const cm = (m: number) => `${m > 0 ? '+' : ''}${Math.round(m * 100)} см`;
const SIDES: { id: ScreenSide; label: string }[] = [
  { id: 'front', label: 'Спереди' },
  { id: 'back', label: 'Сзади' },
  { id: 'left', label: 'Слева' },
  { id: 'right', label: 'Справа' },
];

/**
 * Настройки живых экранов на оборудовании: что показывать (для всех экранов), размер экранов на ваших
 * моделях и место экрана у выбранного оборудования (сторона и высота). Цвет экрана — по состоянию.
 */
export function ScreensPanel() {
  const open = useScreensPanel((s) => s.open);
  const scr: ScreenSettings = useApp((s) => s.settings?.ui.screens) ?? defaultScreens();
  const selected = useApp((s) => s.selected);
  const autoIds = useInfoScreens((s) => s.auto);
  const [step, setStep] = useState(0.05);
  if (!open) return null;
  const save = (patch: Partial<ScreenSettings>) => setUi({ screens: { ...scr, ...patch } });
  const eq = selected ? EQUIPMENT_BY_ID[selected] : null;
  const hasAuto = !!(selected && autoIds[selected]);
  const place: ScreenPlace = (selected && scr.place[selected]) || { side: 'front', height: 0.72 };
  const shift = (selected && scr.shift?.[selected]) || { x: 0, y: 0 };
  const size = eq ? equipmentSize(eq) : { w: 1, d: 1, h: 1 };
  const setPlace = (p: Partial<ScreenPlace>) => {
    if (!selected) return;
    save({ place: { ...scr.place, [selected]: { ...place, ...p } } });
  };
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  /** Сдвиг стрелками: dx — вправо, dy — вверх (в метрах) */
  const nudge = (dx: number, dy: number) => {
    if (!selected) return;
    if (hasAuto) {
      const face = place.side === 'left' || place.side === 'right' ? size.d : size.w;
      const x = Math.max(-face, Math.min(face, (place.x ?? 0) + dx));
      const height = Math.max(0.1, Math.min(1, place.height + dy / Math.max(0.2, size.h)));
      setPlace({ x: r2(x), height: r2(height) });
    } else {
      const lim = 1.5;
      const x = Math.max(-lim, Math.min(lim, shift.x + dx));
      const y = Math.max(-lim, Math.min(lim, shift.y + dy));
      save({ shift: { ...(scr.shift ?? {}), [selected]: { x: r2(x), y: r2(y) } } });
    }
  };
  const resetPlace = () => {
    if (!selected) return;
    const place2 = { ...scr.place };
    const shift2 = { ...(scr.shift ?? {}) };
    delete place2[selected];
    delete shift2[selected];
    const zoom2 = { ...(scr.zoom ?? {}) };
    delete zoom2[selected];
    save({ place: place2, shift: shift2, zoom: zoom2 });
  };
  const zoom = (selected && scr.zoom?.[selected]) || 1;
  const setZoom = (z: number) => {
    if (!selected) return;
    const v = Math.round(Math.max(0.4, Math.min(3, z)) * 10) / 10;
    save({ zoom: { ...(scr.zoom ?? {}), [selected]: v } });
  };
  const offX = hasAuto ? place.x ?? 0 : shift.x;
  const offY = hasAuto ? (place.height - 0.72) * size.h : shift.y;

  return (
    <FloatingPanel
      id="screens"
      title="Экраны"
      className="screens-panel"
      ariaLabel="Настройки экранов на оборудовании"
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => useScreensPanel.setState({ open: false })}>Готово</button>}
    >
      <fieldset className="screens-panel__group screens-panel__group--place">
        <legend>Место экрана{eq ? `: ${eq.shortName} ${eq.id}` : ''}</legend>
        {!eq ? (
          <p className="place-panel__hint">Выберите оборудование на сцене или в списке.</p>
        ) : (
          <>
            {!hasAuto && <p className="place-panel__hint">Экран стоит на дисплее модели — его можно сдвинуть стрелками и изменить размер.</p>}
            {hasAuto && (
              <div className="seg seg--full" role="radiogroup" aria-label="Сторона экрана">
                {SIDES.map((sd) => (
                  <button key={sd.id} type="button" role="radio" aria-checked={place.side === sd.id} className={place.side === sd.id ? 'is-on' : ''}
                    onClick={() => setPlace({ side: sd.id, x: 0 })}>{sd.label}</button>
                ))}
              </div>
            )}
            <div className="screens-panel__move">
              <div className="nudge" role="group" aria-label="Сдвинуть экран">
                <button type="button" className="nudge__up" title="Выше" aria-label="Выше" onClick={() => nudge(0, step)}>▲</button>
                <button type="button" className="nudge__left" title="Левее" aria-label="Левее" onClick={() => nudge(-step, 0)}>◀</button>
                <button type="button" className="nudge__right" title="Правее" aria-label="Правее" onClick={() => nudge(step, 0)}>▶</button>
                <button type="button" className="nudge__down" title="Ниже" aria-label="Ниже" onClick={() => nudge(0, -step)}>▼</button>
              </div>
              <div className="screens-panel__move-info">
                <div>Шаг:</div>
                <div className="seg" role="radiogroup" aria-label="Шаг сдвига">
                  {STEPS.map((st) => (
                    <button key={st} type="button" role="radio" aria-checked={step === st} className={step === st ? 'is-on' : ''}
                      onClick={() => setStep(st)}>{Math.round(st * 100)} см</button>
                  ))}
                </div>
                <div className="screens-panel__offset" data-testid="scr-offset">↔ {cm(offX)} · ↕ {cm(offY)}</div>
              </div>
            </div>
            <div className="screens-panel__zoom">
              <span>Размер экрана:</span>
              <button type="button" className="btn btn--sm scr-zoom-out" aria-label="Уменьшить экран" onClick={() => setZoom(zoom - 0.1)}>−</button>
              <b data-testid="scr-zoom">{Math.round(zoom * 100)} %</b>
              <button type="button" className="btn btn--sm scr-zoom-in" aria-label="Увеличить экран" onClick={() => setZoom(zoom + 0.1)}>+</button>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={resetPlace}>Вернуть как было</button>
          </>
        )}
      </fieldset>


      <fieldset className="screens-panel__group">
        <legend>Что показывать</legend>
        {CONTENT.map((c) => (
          <label key={c.id} className="screens-panel__radio">
            <input type="radio" name="scr-content" value={c.id} checked={scr.content === c.id} onChange={() => save({ content: c.id })} />
            {c.label}
          </label>
        ))}
        <label className="screens-panel__radio">
          <input id="scr-title" type="checkbox" checked={scr.showTitle} onChange={(e) => save({ showTitle: e.target.checked })} />
          Название и позиция
        </label>
      </fieldset>

      <fieldset className="screens-panel__group">
        <legend>Размер всех прикреплённых экранов</legend>
        <div className="seg seg--full" role="radiogroup" aria-label="Размер экранов">
          {SIZES.map((z) => (
            <button key={z.id} type="button" role="radio" aria-checked={scr.size === z.id} className={scr.size === z.id ? 'is-on' : ''}
              onClick={() => save({ size: z.id })}>{z.label}</button>
          ))}
        </div>
      </fieldset>

      <p className="screens-panel__legend">
        Цвет экрана — по состоянию: <i className="sw sw--run" /> всё в порядке, <i className="sw sw--warn" /> предупреждение,
        {' '}<i className="sw sw--alarm" /> авария (мигает), <i className="sw sw--stop" /> остановлено.
      </p>

    </FloatingPanel>
  );
}

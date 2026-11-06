import { EQUIPMENT_BY_ID } from '../domain/config';
import { axisRef, nearestRoom, roomTitle } from '../domain/layout';
import { commitPose, getPose, setPlaceMode, setPose } from '../services/telemetryHub';
import { useApp } from '../store/appStore';
import { findCollision, reportBlocked, useCollision } from '../services/collision';
import { FloatingPanel } from './FloatingPanel';
import { planCoordinates } from '../services/serverHub';

/** Панель режима «Расстановка»: координаты, привязка к осям, поворот. */
export function PlacementPanel() {
  const placeMode = useApp((s) => s.placeMode);
  const selected = useApp((s) => s.selected);
  useApp((s) => s.settings?.layout); // перерисовка при перемещении
  const blocked = useCollision((s) => s.blocked);
  if (!placeMode) return null;
  const eq = selected ? EQUIPMENT_BY_ID[selected] : null;
  const p = selected ? getPose(selected) : null;
  const room = p ? nearestRoom(p.x, p.z) : null;
  const plan = selected ? planCoordinates(selected) : null;
  const rotate = (deg: number) => {
    if (!selected || !p) return;
    const r = p.rotY - (deg * Math.PI) / 180; // deg > 0 — по часовой стрелке (вид сверху)
    const next = { ...p, rotY: Math.atan2(Math.sin(r), Math.cos(r)) };
    // Наложение только показываем, но не запрещаем: станки в базе уже могут стоять вплотную
    reportBlocked(selected, null);
    setPose(selected, next);
    commitPose(selected);
  };
  return (
    <FloatingPanel
      id="placement"
      title="Расстановка"
      className="place-panel"
      ariaLabel="Расстановка оборудования"
      actions={<button type="button" className="btn btn--primary btn--sm" onClick={() => setPlaceMode(false)}>Готово</button>}
      more={<p className="place-panel__hint">Шаг перемещения 0,1 м. Положение сохраняется на сервере, когда вы отпускаете модель.</p>}
    >
      {!eq || !p ? (
        <p className="place-panel__hint">Выберите оборудование и перетащите модель по плану.</p>
      ) : (
        <>
          <p className="place-panel__eq">{eq.name} <span>{eq.id}</span></p>
          {/* Координаты те же, что в базе и админке Django; оси и помещение — по чертежу двойника */}
          <dl>
            <dt>Координаты</dt>
            <dd>X {plan?.pos_x} · Z {plan?.pos_z} м</dd>
            <dt>Оси</dt>
            <dd>{axisRef(p.x, p.z)}</dd>
            <dt>Помещение</dt>
            <dd>{room ? roomTitle(room.id) : 'вне помещений'}</dd>
          </dl>
          {(() => {
            const b = blocked?.id === eq.id ? blocked.hit : null;
            const overlap = !b ? findCollision(eq.id, p, getPose) : null;
            if (b) return <p className="place-panel__block" role="status">⛔ Упирается: {b.label}</p>;
            if (overlap) return <p className="place-panel__block" role="status">⚠ Пересекается: {overlap.label}. Отодвиньте.</p>;
            return null;
          })()}
          <div className="place-panel__rot">
            <button type="button" className="btn btn--sm" onClick={() => rotate(-90)} aria-label="Повернуть на 90° против часовой">⟲ 90°</button>
            <button type="button" className="btn btn--sm" onClick={() => rotate(-15)}>⟲ 15°</button>
            <span className="place-panel__deg" title="Поворот как в базе: против часовой">{plan?.rotation_deg}°</span>
            <button type="button" className="btn btn--sm" onClick={() => rotate(15)}>⟳ 15°</button>
            <button type="button" className="btn btn--sm" onClick={() => rotate(90)} aria-label="Повернуть на 90° по часовой">⟳ 90°</button>
          </div>
        </>
      )}
    </FloatingPanel>
  );
}

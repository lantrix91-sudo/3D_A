import { useState } from 'react';
import { EQUIPMENT_BY_ID, useRegistry } from '../../domain/config';
import { effectiveModel, useModelErrors, useModels } from '../../services/models3d';
import { ConfirmModal } from '../common/Modal';
import { ServerEquipmentForm } from '../ServerEquipmentForm';
import { planCoordinates } from '../../services/serverHub';
import { CONDITION_LABELS } from '../../services/planMapper';
import { useServer } from '../../store/serverStore';
import { axisRef, nearestRoom, roomTitle } from '../../domain/layout';
import { deleteEquipment, getPose, requestOverview, selectEquipment } from '../../services/telemetryHub';
import { useApp, useClock } from '../../store/appStore';
import { formatAgo, formatDateTimeSec } from '../../utils/time';
import { StatePill } from '../common/StatePill';
import { useDisplayStates } from '../common/useDerived';
import { PprTab } from './PprTab';
import { SensorsTab } from './SensorsTab';

type Tab = 'sensors' | 'ppr';

export function EquipmentCard() {
  const selected = useApp((s) => s.selected);
  const live = useApp((s) => s.live);
  const states = useDisplayStates();
  const now = useClock((s) => s.now);
  const [tab, setTab] = useState<Tab>('sensors');
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  useRegistry((s) => s.version);
  useModels((s) => s.byId);
  const modelErrors = useModelErrors((s) => s.byId);
  const canEdit = useServer((s) => s.canEdit);
  const zones = useServer((s) => s.zones);

  if (!selected) {
    return (
      <aside className="card panel card--empty" aria-label="Карточка оборудования">
        <h2 className="panel__title">Карточка оборудования</h2>
        <p>Выберите оборудование в списке или нажмите на модель в 3D-сцене, чтобы увидеть показания и графики.</p>
      </aside>
    );
  }

  const eq = EQUIPMENT_BY_ID[selected];
  if (!eq) {
    return (
      <aside className="card panel card--empty" aria-label="Карточка оборудования">
        <h2 className="panel__title">Карточка оборудования</h2>
        <p>Оборудование {selected} удалено.</p>
      </aside>
    );
  }
  const l = live?.equipment[selected];
  const model3d = effectiveModel(eq);
  const modelError = modelErrors[selected];
  const pose = getPose(selected);
  const near = nearestRoom(pose.x, pose.z);
  const planPos = planCoordinates(selected);

  return (
    <aside className="card panel" aria-label={`Карточка: ${eq.name} ${eq.id}`}>
      <header className="card__head">
        <div className="card__title">
          <span className="card__id">{eq.id}</span>
          <h2>{eq.name}</h2>
          <button type="button" className="card__close" aria-label="Закрыть карточку" onClick={() => { selectEquipment(null, { focus: false }); requestOverview(); }}>×</button>
        </div>
        <div className="card__state">
          <StatePill state={states[selected]} size="lg" />
        </div>
        <dl className="card__passport">
          {eq.server && (
            <>
              <div><dt>Тип</dt><dd>{eq.server.type}</dd></div>
              <div><dt>Техсостояние</dt><dd>{CONDITION_LABELS[l?.condition ?? ''] ?? l?.condition ?? '—'}</dd></div>
              <div><dt>Зона</dt><dd>{zones.find((z) => z.code === eq.server!.zone)?.name ?? eq.server.zone}</dd></div>
              {/* device_id сервер отдаёт только пользователям с is_staff */}
              {eq.server.deviceId !== undefined && <div><dt>Устройство</dt><dd>{eq.server.deviceId ?? <span className="muted">не привязано</span>}</dd></div>}
            </>
          )}
          <div>
            <dt>3D-модель</dt>
            <dd>
              {model3d ? <>{model3d.fileName} · {model3d.dims.map((d) => d.toFixed(2)).join(' × ')} м</> : <span className="muted">условная</span>}
              {modelError && <span className="card__model-error" role="alert">Не загрузилась: {modelError}</span>}
            </dd>
          </div>
        </dl>
        {eq.kind !== 'generic' && (
        <dl className="card__facts">
          <div>
            <dt>Работа</dt>
            <dd>{l?.runState === 'running' ? 'В работе' : l?.runState === 'stopped' ? 'Остановлено' : 'Неизвестно'}
              {l?.comm === 'lost' && l.runState !== 'unknown' ? <small> (последнее известное)</small> : null}
            </dd>
          </div>
          <div>
            <dt>Связь</dt>
            <dd className={l?.comm === 'lost' ? 'is-bad' : ''}>
              {l?.comm === 'ok' ? 'Есть' : l?.comm === 'lost' ? `Нет с ${formatDateTimeSec(l.commSince)}` : 'Ожидание данных'}
            </dd>
          </div>
          <div>
            <dt>Последнее измерение</dt>
            <dd title={formatDateTimeSec(l?.lastGoodTs)}>{l?.lastGoodTs ? formatAgo(l.lastGoodTs, now) : '—'}</dd>
          </div>
        </dl>
        )}
        {/* Координаты как в базе; оси и ближайшее помещение определяются по чертежу двойника */}
        {planPos && (
          <p className="card__room">
            Положение: <b>X {planPos.pos_x} м, Z {planPos.pos_z} м</b>, поворот {planPos.rotation_deg}°
            <br />
            <span>{axisRef(pose.x, pose.z)}{near ? ` · рядом с ${roomTitle(near.id)}` : ''}</span>
          </p>
        )}
        <div className="card__actions">
          {/* Правка и удаление — только для admin. Сервер проверяет права и сам */}
          {canEdit && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>✎ Данные</button>
              <button type="button" className="btn btn--ghost btn--sm btn--danger-text" onClick={() => setConfirmDel(true)}>В архив</button>
            </>
          )}
        </div>
        {editing && <ServerEquipmentForm editId={eq.id} onClose={() => setEditing(false)} />}
        {confirmDel && (
          <ConfirmModal
            title={`Отправить ${eq.name} ${eq.id} в архив?`}
            danger
            confirmLabel="В архив"
            onClose={() => setConfirmDel(false)}
            onConfirm={async () => { setConfirmDel(false); await deleteEquipment(eq.id); }}
            text={
              // DELETE архивирует; история сохраняется
              <>
                <p>Оборудование исчезнет с активного плана и из текущих обходов. Его можно вернуть из архива.</p>
                <p>История показаний, осмотры, события состояния и шаги маршрутов сохранятся.</p>
              </>
            }
          />
        )}
      </header>

      {/* Вкладка «Поломки» появится вместе с эндпоинтами на бэкенде: компонент BreakdownsTab сохранён */}
      <div className="tabs" role="tablist" aria-label="Разделы карточки">
        {([
          ['sensors', 'Датчики'],
          ['ppr', 'ППР'],
        ] as const).map(([k, label]) => (
          <button key={k} id={`tab-${k}`} type="button" role="tab" aria-selected={tab === k} aria-controls={`tabpanel-${k}`}
            className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="card__body" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'sensors' && <SensorsTab equipmentId={selected} />}
        {tab === 'ppr' && <PprTab equipmentId={selected} />}
      </div>
    </aside>
  );
}

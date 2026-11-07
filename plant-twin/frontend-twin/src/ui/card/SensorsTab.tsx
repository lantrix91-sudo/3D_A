import { EQUIPMENT_BY_ID, sensorsOf } from '../../domain/config';
import { isConnectionDegraded } from '../../services/connectionAlert';
import { useConnectionAlert } from '../common/useConnectionAlert';
import type { EquipmentId } from '../../domain/types';
import { PERIOD_LABEL, type Period } from '../../services/history';
import { setUi } from '../../services/telemetryHub';
import { useApp, useClock } from '../../store/appStore';
import { formatAgo, formatDateTimeSec } from '../../utils/time';
import { SensorChart } from './SensorChart';

export function SensorsTab({ equipmentId }: { equipmentId: EquipmentId }) {
  const live = useApp((s) => s.live);
  const period = useApp((s) => s.settings?.ui.period ?? '15m');
  const now = useClock((s) => s.now);
  const degraded = isConnectionDegraded(useConnectionAlert());
  const sensors = sensorsOf(equipmentId);
  // Устройство не привязано или у типа нет сигналов. Подключают это в админке, а не здесь
  if ((!sensors.length || !EQUIPMENT_BY_ID[equipmentId]?.server?.hasTelemetry)) {
    return (
      <div className="sensors">
        <p className="notice">
          Показаний нет: к этому оборудованию не привязано устройство. Устройство (device_id) и сигналы типа настраиваются в админке Django.
        </p>
      </div>
    );
  }

  return (
    <div className="sensors">
      {degraded && (
        <p className="notice">Нет связи с сервером: показаны последние полученные значения.</p>
      )}
      <div className="readings">
        {sensors.map((s) => {
          const v = live?.sensors[s.id];
          // У сигналов state и bool значение текстовое (lastValue у них пуст)
          const ok = !!v?.hasData && (v.lastValue != null || v.text != null);
          const lvl = v?.level ?? 'normal';
                    return (
            <div key={s.id} className={`reading reading--${ok ? lvl : 'nodata'}`}>
              <span className="reading__label">{s.label}</span>
              <span className="reading__value">
                {ok ? (
                  v!.text != null ? v!.text : (
                    <>
                      {v!.lastValue!.toFixed(s.precision)}
                      <small>{s.unit}</small>
                    </>
                  )
                ) : (
                  <span className="reading__nodata">Нет данных</span>
                )}
              </span>
              <span className="reading__loc">{s.location}</span>
              <span className="reading__status">
                {ok ? (
                  // Порогов на сервере пока нет, поэтому оценку «Норма» здесь не показываем
                  ''
                ) : v?.fault ? (
                  'Ошибка датчика'
                ) : v?.lastGoodTs ? (
                  <>
                    Последнее измерение: {v.text ?? `${v.lastValue?.toFixed(s.precision)} ${s.unit}`}
                    <br />
                    {formatDateTimeSec(v.lastGoodTs)}
                  </>
                ) : (
                  'Измерений ещё не было'
                )}
              </span>
              <span className="reading__time" title={v?.lastGoodTs ? formatDateTimeSec(v.lastGoodTs) : ''}>
                {ok && v?.lastGoodTs ? `Обновлено: ${formatDateTimeSec(v.lastGoodTs)} · ${formatAgo(v.lastGoodTs, now)}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="chart-bar">
        <div className="seg" role="tablist" aria-label="Период графиков">
          {(['15m', '1h', '24h'] as Period[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={period === p} className={period === p ? 'is-on' : ''} onClick={() => setUi({ period: p })}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">Среднее за минуту по данным сервера.</p>

      {/* График имеет смысл только для числовых сигналов */}
      {sensors.filter((s) => !s.valueType || s.valueType === 'number').map((s) => (
        <SensorChart key={`${s.id}-${period}`} sensor={s} period={period} />
      ))}
    </div>
  );
}

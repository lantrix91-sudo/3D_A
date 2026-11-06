import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Sensor } from '../../domain/types';
import { loadSeries, PERIOD_LABEL, PERIOD_MS, type Period, type SeriesResult } from '../../services/history';
import { useApp } from '../../store/appStore';
import { formatDateTimeSec, formatTime } from '../../utils/time';

export function SensorChart({ sensor, period }: { sensor: Sensor; period: Period }) {
  const dataVersion = useApp((s) => s.dataVersion);
  const [res, setRes] = useState<SeriesResult | null>(null);
  const [now, setNow] = useState(Date.now());
  // 24 ч обновляем раз в ~30 с, короткие периоды — с каждым пакетом
  const bucket = period === '24h' ? Math.floor(dataVersion / 15) : period === '1h' ? Math.floor(dataVersion / 2) : dataVersion;

  useEffect(() => {
    let alive = true;
    const t = Date.now();
    loadSeries(sensor.id, period, t)
      .then((r) => {
        if (alive) {
          setRes(r);
          setNow(t);
        }
      })
      .catch((e) => {
        console.error('[chart]', e);
        // Сервер не ответил: показываем причину вместо бесконечной «Загрузки…»
        if (alive) setRes({ points: [], hasLive: false, error: String((e as Error)?.message ?? e) });
      });
    return () => {
      alive = false;
    };
  }, [sensor.id, period, bucket]);

  const from = now - PERIOD_MS[period];
  const yDomain = useMemo((): [number, number] => {
    let lo = sensor.axis[0];
    let hi = sensor.axis[1];
    for (const p of res?.points ?? []) {
      if (p.live == null) continue;
      lo = Math.min(lo, p.live);
      hi = Math.max(hi, p.live);
    }
    return [Math.floor(lo), Math.ceil(hi)];
  }, [res, sensor.axis]);

  const ticks = useMemo(() => {
    const step = period === '15m' ? 3 * 60000 : period === '1h' ? 10 * 60000 : 4 * 3600000;
    const out: number[] = [];
    for (let t = Math.ceil(from / step) * step; t <= now; t += step) out.push(t);
    return out;
  }, [from, now, period]);

  const empty = res && !res.hasLive;
  const emptyText = res?.error
    ? `Не удалось загрузить историю: ${res.error}`
    : `Нет данных за последние ${PERIOD_LABEL[period]}. Устройство ещё не присылало показания.`;

  return (
    <figure className="chart">
      <figcaption className="chart__cap">
        <span>
          {sensor.label}, {sensor.unit}
        </span>
        <small>{sensor.location}</small>
      </figcaption>
      <div className="chart__plot">
        {!res ? (
          <p className="chart__empty">Загрузка…</p>
        ) : empty ? (
          <p className="chart__empty">{emptyText}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={res.points} margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={[from, now]}
                ticks={ticks}
                tickFormatter={(t: number) => formatTime(t)}
                stroke="var(--fg-muted)"
                tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                label={{ value: 'Время (Алматы)', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--fg-muted)' }}
                allowDataOverflow
              />
              <YAxis
                domain={yDomain}
                width={44}
                stroke="var(--fg-muted)"
                tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                label={{ value: sensor.unit, angle: -90, position: 'insideLeft', offset: 12, fontSize: 11, fill: 'var(--fg-muted)' }}
                allowDataOverflow
              />
              <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as unknown as TipEntry[]} label={p.label as number} sensor={sensor} />} isAnimationActive={false} />
              <Line type="monotone" dataKey="live" name="Измерения" stroke="var(--chart-line)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </figure>
  );
}

interface TipEntry { value?: number | null }
function ChartTip({ active, payload, label, sensor }: { active?: boolean; payload?: TipEntry[]; label?: number; sensor: Sensor }) {
  if (!active || !payload?.length) return null;
  const p = payload.find((x) => x.value != null);
  return (
    <div className="chart-tip">
      <div>{formatDateTimeSec(label ?? null)}</div>
      {p ? (
        <b>
          {Number(p.value).toFixed(sensor.precision)} {sensor.unit}
        </b>
      ) : (
        <b>Нет данных</b>
      )}
    </div>
  );
}

import { loadServerSeries } from './serverHub';

export type Period = '15m' | '1h' | '24h';
export const PERIOD_MS: Record<Period, number> = { '15m': 15 * 60000, '1h': 60 * 60000, '24h': 24 * 60 * 60000 };
export const PERIOD_LABEL: Record<Period, string> = { '15m': '15 минут', '1h': '1 час', '24h': '24 часа' };

export interface SeriesPoint {
  ts: number;
  /** Измерения с сервера. null — разрыв линии: данных не было */
  live: number | null;
}

export interface SeriesResult {
  points: SeriesPoint[];
  hasLive: boolean;
  /** Текст ошибки, если историю не удалось получить с сервера */
  error?: string;
}

/** Точка до расстановки разрывов */
export interface RawPoint {
  ts: number;
  v: number | null;
  step: number;
}

/** История для графика лежит в базе на бэкенде. Разрывы показываются разрывом линии, без подстановки нулей */
export function loadSeries(sensorId: string, period: Period, now = Date.now()): Promise<SeriesResult> {
  return loadServerSeries(sensorId, period, now);
}

/** Собрать ряд для графика */
export function buildSeries(pts: RawPoint[]): SeriesResult {
  pts.sort((a, b) => a.ts - b.ts);

  // вставляем разрывы, если между точками пропуск больше трёх шагов
  const out: SeriesPoint[] = [];
  let prev: RawPoint | null = null;
  for (const p of pts) {
    if (prev && p.ts - prev.ts > Math.max(p.step, prev.step) * 3.2) {
      out.push({ ts: prev.ts + 1, live: null });
    }
    out.push({ ts: p.ts, live: p.v });
    prev = p;
  }

  return { points: out, hasLive: pts.some((p) => p.v != null) };
}

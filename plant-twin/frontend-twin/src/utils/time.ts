/** Время хранится в UTC (мс), отображается в часовом поясе цеха. */
export const PLANT_TZ = 'Asia/Almaty';

const fmtDateTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PLANT_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtDateTimeSec = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PLANT_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const fmtTimeSec = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PLANT_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const fmtTime = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PLANT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: PLANT_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
});
const fmtParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLANT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export const formatDateTime = (ts: number | null | undefined) => (ts == null ? '—' : fmtDateTime.format(ts));
export const formatDateTimeSec = (ts: number | null | undefined) => (ts == null ? '—' : fmtDateTimeSec.format(ts));
export const formatTimeSec = (ts: number | null | undefined) => (ts == null ? '—' : fmtTimeSec.format(ts));
export const formatTime = (ts: number | null | undefined) => (ts == null ? '—' : fmtTime.format(ts));
export const formatDate = (ts: number | null | undefined) => (ts == null ? '—' : fmtDate.format(ts));

/** Смещение пояса цеха относительно UTC в мс для момента ts (без жёсткой привязки к +05:00). */
function tzOffsetMs(ts: number): number {
  const p = Object.fromEntries(fmtParts.formatToParts(ts).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute));
  return asUtc - Math.floor(ts / 60000) * 60000;
}

/** UTC-мс → строка для <input type="datetime-local"> в поясе цеха */
export function toLocalInput(ts: number | null | undefined): string {
  if (ts == null) return '';
  const d = new Date(ts + tzOffsetMs(ts));
  return d.toISOString().slice(0, 16);
}

/** Строка из <input type="datetime-local"> (пояс цеха) → UTC-мс */
export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // два прохода на случай перехода смещения
  let ts = naive - tzOffsetMs(naive);
  ts = naive - tzOffsetMs(ts);
  return ts;
}

/** Строка для <input type="date"> */
export function toDateInput(ts: number | null | undefined): string {
  return toLocalInput(ts).slice(0, 10);
}
/** <input type="date"> → UTC-мс полудня этого дня по поясу цеха (без сдвига даты) */
export function fromDateInput(v: string): number | null {
  if (!v) return null;
  return fromLocalInput(`${v}T12:00`);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return '—';
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} сут`);
  if (h) parts.push(`${h} ч`);
  if (m || parts.length === 0) parts.push(`${m} мин`);
  return parts.join(' ');
}

export function formatAgo(ts: number | null | undefined, now: number): string {
  if (ts == null) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s} с назад`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ч назад`;
  return `${Math.round(h / 24)} сут назад`;
}

export const DAY_MS = 86400000;

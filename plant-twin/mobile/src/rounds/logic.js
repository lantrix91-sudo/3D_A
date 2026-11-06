// Логика обхода без DOM. Перенесено из frontend: ui/roundPanel.js (mergeRound, localDay, overallResult)
// и rounds/routeLogic.js (chooseRoute). Кнопки формы осмотра — в rounds/stepFlow.js.

export const RESULT_LABELS = { ok: 'Норма', remark: 'Замечание', fault: 'Неисправность' };
export const COLORS = {
  working: '#299f79', idle: '#dbad4e', faulty: '#d23c3c', maintenance: '#3f7fd1', repair: '#e07b28',
  decommissioned: '#4f565c', unknown: '#888888',
};
export const RESULT_COLORS = { ok: COLORS.working, remark: COLORS.idle, fault: COLORS.faulty };
export const CONDITION_LABELS = {
  working: 'Работает', idle: 'Простой', faulty: 'Неисправно', maintenance: 'На ТО', repair: 'В ремонте', decommissioned: 'Выведено',
};
const SEVERITY = { ok: 0, remark: 1, fault: 2 };

// Итог осмотра — худший ответ чек-листа.
export function overallResult(answers, fallback = 'ok') {
  return [fallback, ...answers.map((answer) => answer.result)].reduce((worst, result) => (SEVERITY[result] > SEVERITY[worst] ? result : worst));
}

// День осмотра YYYY-MM-DD в поясе цеха (как на сервере); без пояса — в поясе телефона.
export function localDay(seconds, timeZone) {
  const date = new Date(seconds * 1000);
  try { return date.toLocaleDateString('sv-SE', timeZone ? { timeZone } : {}); } catch { return date.toLocaleDateString('sv-SE'); }
}

// Маршрут сервера + неотправленные осмотры телефона: осмотренное офлайн уже считается сделанным.
export function mergeRound(today, pending) {
  const queued = new Map();
  for (const entry of pending) {
    if (!today || localDay(entry.inspected_at, today.time_zone) === today.date) queued.set(entry.equipment, entry);
  }
  const stops = (today?.stops || []).map((stop) => {
    const entry = queued.get(stop.equipment);
    const state = entry ? (entry.error ? 'error' : 'pending') : stop.inspection ? 'done' : 'todo';
    return { ...stop, state, result: entry?.result || stop.inspection?.result || null,
      at: entry?.inspected_at || stop.inspection?.inspected_at || null, error: entry?.error || null };
  });
  return { stops, total: stops.length, done: stops.filter((stop) => stop.state !== 'todo').length };
}

// Какой маршрут открыть: сохранённый, если он ещё существует и активен; иначе первый активный.
export function chooseRoute(routes, savedId) {
  const active = routes.filter((route) => route.is_active);
  return active.find((route) => route.id === savedId) || active[0] || null;
}

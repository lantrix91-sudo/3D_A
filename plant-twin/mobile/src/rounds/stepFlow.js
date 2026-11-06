// Кнопки внизу формы осмотра: «← Назад», «Далее →» / «Сохранить и завершить», «Пропустить станок».
// Логика без DOM, чтобы сценарии проверялись тестами (stepFlow.test.js).
import { localDay } from './logic.js';

// Ответы окна «Сохранить изменения?»: сохранить и перейти, перейти без записи, остаться на шаге.
export const SAVE = 'save';
export const DISCARD = 'discard';
export const STAY = 'stay';

// Соседние шаги по порядку маршрута.
export function stepPosition(stops, code) {
  const index = stops.findIndex((stop) => stop.equipment === code);
  return { index, prev: stops[index - 1] || null, next: index >= 0 ? stops[index + 1] || null : null, last: index === stops.length - 1 };
}

// Сегодня на этом шаге осмотр уже есть: отправлен или ждёт сети. Отклонённый сервером не считается.
export const savedToday = (stop) => stop?.state === 'done' || stop?.state === 'pending';

// Последний сегодняшний осмотр станка: сначала неотправленный с телефона, затем с сервера.
export function savedInspection(today, pending, code) {
  const queued = pending.filter((entry) => entry.equipment === code && !entry.error
    && (!today || localDay(entry.inspected_at, today.time_zone) === today.date));
  if (queued.length) return { pending: true, ...queued[queued.length - 1] };
  return today?.stops.find((stop) => stop.equipment === code)?.inspection || null;
}

// Ответы сохранённого осмотра → значения формы (по строкам чек-листа; без чек-листа — одна строка).
export function formValues(rows, saved) {
  if (!saved) return { checks: rows.map(() => ({ value: 'ok', note: '' })), comment: '' };
  if (rows.length === 1 && rows[0].id === null) {
    return { checks: [{ value: saved.result || 'ok', note: '' }], comment: saved.comment || '' };
  }
  const checks = rows.map((row) => {
    const answer = (saved.answers || []).find((item) => item.item === row.id) || (saved.answers || []).find((item) => item.text === row.text);
    return { value: answer?.result || 'ok', note: answer?.note || '' };
  });
  return { checks, comment: saved.comment || '' };
}

// Отпечаток формы: менял ли пользователь ответы. Примечание к «Норме» скрыто и не считается.
export function formSignature({ checks, comment, photos = [] }) {
  return JSON.stringify({
    checks: checks.map(({ value, note }) => [value, value === 'ok' ? '' : (note || '').trim()]),
    comment: (comment || '').trim(),
    photos: photos.length,
  });
}

/**
 * stops() — шаги маршрута (mergeRound), changed() — изменены ли ответы,
 * ask() — окно «Сохранить изменения?», отвечает SAVE, DISCARD или STAY (может быть Promise),
 * save() — сохранить осмотр в очередь, discard() — забыть несохранённый ввод,
 * leave() — можно ли уйти без сохранения (сам переспросит), open(code, { saved }) — шаг, finish({ saved }) — к списку.
 */
export function createStepFlow({ code, stops, changed, ask, save, discard, leave, open, finish }) {
  const position = () => stepPosition(stops(), code);
  const go = (target, saved) => (target ? open(target.equipment, { saved }) : finish({ saved }));
  return {
    // Главная кнопка: нет осмотра — сохраняем; уже сохранён сегодня — без дубля, а если ответы изменили — спрашиваем.
    async next() {
      const stop = stops().find((candidate) => candidate.equipment === code);
      let needSave = !savedToday(stop);
      if (!needSave && changed()) {
        const choice = await ask();
        if (choice !== SAVE && choice !== DISCARD) return 'stayed'; // «Остаться» или окно закрыли
        needSave = choice === SAVE;
      }
      const { next } = position();
      if (needSave) await save();
      else discard();
      go(next, needSave);
      return needSave ? 'saved' : 'moved';
    },
    // Только переход на предыдущий шаг, без записи.
    back() {
      const { prev } = position();
      if (!prev || !leave()) return false;
      open(prev.equipment, { saved: false });
      return true;
    },
    // Перейти дальше без записи осмотра.
    skip() {
      if (!leave()) return false;
      go(position().next, false);
      return true;
    },
  };
}

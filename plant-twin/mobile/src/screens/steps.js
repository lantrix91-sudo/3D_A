// Экран «Шаги»: маршрут дня по порядку с прогрессом. Список перенесён из frontend/src/ui/roundPanel.js.
import { CONDITION_LABELS, mergeRound } from '../rounds/logic.js';
import { button, day, element, equipmentImage, resultBadge, syncLine, time, topBar } from '../ui.js';

export function renderSteps(root, ctx) {
  function render() {
    const { state } = ctx;
    const { today } = state;
    const merged = mergeRound(today, state.pending);
    const title = today?.route?.name || (state.routeId ? 'Маршрут' : 'Всё оборудование');
    const subtitle = today ? `${day.format(new Date(`${today.date}T12:00:00`))}${state.offline ? ' · без сети' : ''}` : 'Загрузка…';
    root.replaceChildren(topBar({ title, subtitle, onBack: ctx.back }));
    const body = element('main', 'screen-body');
    const progress = element('div', 'progress');
    const bar = element('div', 'progress-bar');
    const fill = element('span');
    fill.style.width = merged.total ? `${(merged.done / merged.total) * 100}%` : '0';
    bar.append(fill);
    progress.append(bar, element('strong', '', `${merged.done} / ${merged.total}`));
    body.append(progress, syncLine(state));

    const list = element('ol', 'stop-list');
    // Колонка миниатюр — только если картинка есть хоть у одного станка.
    const withImages = merged.stops.some((stop) => stop.image);
    list.classList.toggle('with-images', withImages);
    list.append(...merged.stops.map((stop, index) => {
      const item = element('li', `stop stop-${stop.state}`);
      const open = button('', 'stop-button', () => ctx.openStep(stop.equipment));
      const text = element('span', 'stop-text');
      text.append(element('strong', '', stop.name), element('small', '', `${stop.equipment} · ${stop.zone} · ${CONDITION_LABELS[stop.condition] || ''}`));
      const status = element('span', 'stop-status');
      if (stop.state === 'todo') status.append(element('span', 'muted', 'не осмотрено'));
      else {
        status.append(resultBadge(stop.result));
        status.append(element('small', 'muted', stop.state === 'pending' ? '⏳ ждёт отправки' : stop.state === 'error' ? 'отклонено' : time.format(new Date(stop.at * 1000))));
      }
      open.append(element('span', 'stop-number', String(index + 1)));
      if (withImages) open.append(equipmentImage(ctx, stop, 'stop-image'));
      open.append(text, status);
      item.append(open);
      if (stop.state === 'error') {
        const entry = state.pending.find((candidate) => candidate.equipment === stop.equipment && candidate.error);
        item.append(element('p', 'message', stop.error));
        item.lastChild.dataset.state = 'error';
        if (entry) item.append(button('Удалить неотправленный осмотр', 'link', () => ctx.discard(entry.client_id)));
      }
      return item;
    }));
    if (today && !merged.stops.length) list.append(element('li', 'muted', 'Маршрут пуст: инженер добавляет станки в веб-версии, панель «Маршруты».'));
    body.append(list);
    const next = merged.stops.find((stop) => stop.state === 'todo');
    const footer = element('footer', 'bottom-bar');
    if (next) footer.append(button(`Осмотреть: шаг ${merged.stops.indexOf(next) + 1}`, 'big primary', () => ctx.openStep(next.equipment)));
    else if (merged.total) footer.append(element('p', 'done-note', 'Все станки маршрута осмотрены ✓'));
    footer.append(button('Обновить', 'big secondary', ctx.reload));
    root.append(body, footer);
  }
  render();
  return { update: render };
}

// Экран «Станок»: состояние, последние осмотры и история состояния. Без сети — последняя сохранённая копия.
// Строки истории повторяют renderEvent/renderInspection из frontend/src/ui/equipmentCard.js.
import { RESULT_LABELS } from '../rounds/logic.js';
import { button, conditionBadge, dateTime, element, photoStrip, resultBadge, topBar } from '../ui.js';

function eventRow(event) {
  const item = element('li', 'event');
  const source = { round: ' · обход', maintenance: ' · ТО' }[event.source] || '';
  item.append(element('div', 'event-meta', `${dateTime.format(new Date(event.created_at * 1000))} · ${event.actor || 'система'}${source}`));
  const change = element('div', 'event-change');
  if (event.previous && event.previous !== event.condition) change.append(conditionBadge(event.previous), element('span', '', '→'));
  change.append(conditionBadge(event.condition));
  item.append(change);
  if (event.comment) item.append(element('p', 'event-comment', event.comment));
  if (event.photos?.length) item.append(photoStrip(event.photos, 'Фото к изменению состояния'));
  return item;
}

function inspectionRow(inspection) {
  const item = element('li', 'event');
  item.append(element('div', 'event-meta', `${dateTime.format(new Date(inspection.inspected_at * 1000))} · ${inspection.inspector || '—'}`));
  item.append(resultBadge(inspection.result));
  const remarks = (inspection.answers || []).filter((answer) => answer.result !== 'ok');
  if (remarks.length) {
    const list = element('ul', 'remarks');
    list.append(...remarks.map((answer) => element('li', '', `${RESULT_LABELS[answer.result]}: ${answer.text}${answer.note ? ` — ${answer.note}` : ''}`)));
    item.append(list);
  }
  if (inspection.comment) item.append(element('p', 'event-comment', inspection.comment));
  if (inspection.photos?.length) item.append(photoStrip(inspection.photos, 'Фото осмотра'));
  return item;
}

export function renderEquipment(root, ctx, { code }) {
  let tab = 'rounds';
  let data = null;
  const body = element('main', 'screen-body');
  root.replaceChildren(topBar({ title: code, subtitle: 'История станка', onBack: ctx.back }), body);

  function render() {
    body.replaceChildren();
    if (!data) { body.append(element('p', 'muted', 'Загрузка…')); return; }
    const { card, inspections, conditions, offline, savedAt } = data;
    root.querySelector('.top-title').textContent = card.name;
    const head = element('section', 'equipment-head');
    head.append(element('p', 'muted', `${card.code} · ${card.zone.name} · ${card.type.name}`));
    const condition = element('p', 'condition-line');
    condition.append(element('span', '', 'Состояние: '), conditionBadge(card.condition));
    if (card.condition_changed_at) condition.append(element('small', 'muted', ` с ${dateTime.format(new Date(card.condition_changed_at * 1000))}`));
    head.append(condition);
    if (offline) head.append(element('p', 'message', `Нет связи — копия от ${dateTime.format(new Date(savedAt))}`));
    const tabs = element('nav', 'tabs');
    for (const [key, label] of [['rounds', 'Осмотры'], ['conditions', 'Состояние']]) {
      const item = button(label, `tab${tab === key ? ' active' : ''}`, () => { tab = key; render(); });
      item.setAttribute('aria-pressed', String(tab === key));
      tabs.append(item);
    }
    const list = element('ol', 'event-list');
    const items = tab === 'rounds' ? inspections.map(inspectionRow) : conditions.map(eventRow);
    list.append(...(items.length ? items : [element('li', 'muted', tab === 'rounds' ? 'Осмотров ещё не было.' : 'Изменений состояния нет.')]));
    body.append(head, tabs, list);
  }

  render();
  ctx.equipmentHistory(code).then((result) => { data = result; render(); }).catch((error) => {
    body.replaceChildren(element('p', 'message', error.message));
    body.firstChild.dataset.state = 'error';
  });
  return {};
}

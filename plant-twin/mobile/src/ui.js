// Мелкие помощники интерфейса. Данные пользователей выводятся только через textContent.
import { COLORS, CONDITION_LABELS, RESULT_COLORS, RESULT_LABELS } from './rounds/logic.js';

export const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const button = (text, className, onClick) => {
  const node = element('button', className, text);
  node.type = 'button';
  node.onclick = onClick;
  return node;
};

export const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
export const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
export const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

export function badge(text, color) {
  const node = element('span', 'badge', text);
  node.style.setProperty('--badge', color);
  return node;
}

export const resultBadge = (result) => badge(RESULT_LABELS[result] || result, RESULT_COLORS[result] || COLORS.unknown);
export const conditionBadge = (condition) => badge(CONDITION_LABELS[condition] || condition || '—', COLORS[condition] || COLORS.unknown);

// Верхняя панель экрана: «←» назад, заголовок, подзаголовок, кнопки справа.
export function topBar({ title, subtitle = '', onBack = null, actions = [] }) {
  const bar = element('header', 'top-bar');
  if (onBack) {
    const back = button('←', 'top-back', onBack);
    back.setAttribute('aria-label', 'Назад');
    bar.append(back);
  }
  const text = element('div', 'top-text');
  text.append(element('h1', 'top-title', title));
  if (subtitle) text.append(element('p', 'top-subtitle', subtitle));
  bar.append(text, ...actions);
  return bar;
}

// Строка состояния отправки: сколько осмотров ждут сети, сколько отклонил сервер.
export function syncLine(state) {
  const waiting = state.pending.filter((entry) => !entry.error).length;
  const failed = state.pending.filter((entry) => entry.error).length;
  const node = element('p', 'sync-line');
  node.setAttribute('role', 'status');
  node.dataset.state = failed ? 'error' : waiting ? 'pending' : state.offline ? 'offline' : 'ok';
  node.textContent = [
    waiting ? `⏳ Ожидают отправки: ${waiting}` : state.offline ? 'Нет связи — показаны сохранённые данные' : 'Все осмотры отправлены',
    failed ? `Отклонено сервером: ${failed}` : '',
  ].filter(Boolean).join(' · ');
  return node;
}

// Картинка станка (снимок 3D-модели или фото) из копии на телефоне; нет картинки — пустая рамка.
export function equipmentImage(ctx, stop, className) {
  const src = ctx.image(stop);
  if (!src) return element('span', `${className} empty`);
  const image = element('img', className);
  image.src = src;
  image.alt = stop.image_source === 'photo' ? `Фото: ${stop.name}` : `Снимок 3D-модели: ${stop.name}`;
  image.decoding = 'async';
  image.onerror = () => image.replaceWith(element('span', `${className} empty`)); // нет сети и копии
  return image;
}

// Своё окно с несколькими кнопками (системный confirm умеет только две и выглядит по-разному на телефонах).
// Возвращает value нажатой кнопки; фон, Escape или системная «Назад» (dismissDialog) — cancel.
let closeOpenDialog = null;

export function choiceDialog({ title, text = '', choices, cancel = null }) {
  closeOpenDialog?.(); // второе окно поверх первого не открываем
  return new Promise((resolve) => {
    const backdrop = element('div', 'dialog-backdrop');
    const box = element('div', 'dialog');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const heading = element('h2', 'dialog-title', title);
    heading.id = 'dialog-title';
    box.setAttribute('aria-labelledby', heading.id);
    box.append(heading);
    if (text) box.append(element('p', 'dialog-text', text));
    const close = (value) => {
      closeOpenDialog = null;
      removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(cancel); };
    const buttons = element('div', 'dialog-buttons');
    buttons.append(...choices.map(({ label, value, className }) => button(label, className, () => close(value))));
    box.append(buttons);
    backdrop.append(box);
    backdrop.onclick = (event) => { if (event.target === backdrop) close(cancel); };
    addEventListener('keydown', onKey);
    closeOpenDialog = (value = cancel) => close(value);
    document.body.append(backdrop);
    buttons.querySelector('button')?.focus();
  });
}

// true — окно было открыто и закрыто (кнопка «Назад» телефона в этот раз только закрывает окно).
export function dismissDialog() {
  if (!closeOpenDialog) return false;
  closeOpenDialog();
  return true;
}

// Фото на весь экран внутри приложения (внешняя ссылка увела бы WebView из приложения).
export function showPhoto(url) {
  const overlay = element('div', 'photo-viewer');
  const image = element('img');
  image.src = url;
  image.alt = 'Фото';
  overlay.append(image, element('p', 'muted', 'Нажмите, чтобы закрыть'));
  overlay.onclick = () => overlay.remove();
  document.body.append(overlay);
}

export function photoStrip(urls, alt = 'Фото') {
  const strip = element('div', 'photo-strip');
  for (const url of urls) {
    const image = element('img');
    image.src = url;
    image.alt = alt;
    image.loading = 'lazy';
    image.onclick = () => showPhoto(url);
    strip.append(image);
  }
  return strip;
}

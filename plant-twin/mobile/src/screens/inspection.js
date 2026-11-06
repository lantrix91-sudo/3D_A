// Экран «Осмотр»: картинка станка, чек-лист, комментарий, фото, «Шаг N из M».
// Внизу: «Пропустить станок», узкая «← Назад» и главная «Далее →» / «Сохранить и завершить» (rounds/stepFlow.js).
// Перенесено из frontend/src/ui/roundPanel.js (форма осмотра и её отправка в офлайн-очередь);
// добавлены камера телефона и черновик, который переживает перезапуск приложения.
import { uuid } from '../offline/queue.js';
import { mergeRound, overallResult, RESULT_COLORS, RESULT_LABELS } from '../rounds/logic.js';
import { createStepFlow, DISCARD, formSignature, formValues, SAVE, savedInspection, STAY, stepPosition } from '../rounds/stepFlow.js';
import { isNative, pickPhotos, takePhoto } from '../camera.js';
import { button, choiceDialog, element, equipmentImage, showPhoto, topBar } from '../ui.js';

export const MAX_PHOTOS = 5;

function choice(name, value, checked) {
  const label = element('label', 'segment');
  const input = element('input');
  input.type = 'radio';
  input.name = name;
  input.value = value;
  input.checked = checked;
  label.append(input, element('span', '', RESULT_LABELS[value]));
  label.style.setProperty('--badge', RESULT_COLORS[value]);
  return label;
}

export function renderInspection(root, ctx, { code, note = '' }) {
  const stops = () => mergeRound(ctx.state.today, ctx.state.pending).stops;
  const stop = stops().find((candidate) => candidate.equipment === code);
  let photos = [];
  let urls = [];
  let settled = false; // сохранили или осознанно бросили ввод — уход со шага больше не спрашиваем
  let busy = false;
  if (!stop) {
    root.replaceChildren(topBar({ title: 'Осмотр', onBack: ctx.back }), element('p', 'screen-body muted', `Станка ${code} нет в выбранном маршруте.`));
    return {};
  }
  // Сегодня станок уже осматривали — форма открывается с теми ответами, чтобы было видно, что изменилось.
  const saved = savedInspection(ctx.state.today, ctx.state.pending, code);

  const header = topBar({ title: '', onBack: () => ctx.back() });
  const body = element('main', 'screen-body inspection');
  const message = element('p', 'message');
  message.setAttribute('role', 'status');
  message.dataset.state = 'ok';
  message.textContent = note || (saved ? 'Сегодня уже осмотрен. Измените ответы, если нужно, или нажмите «Далее».' : '');

  // Шапка: крупная картинка станка рядом с названием.
  const hero = element('section', 'inspection-hero');
  let picture = null;
  const heroText = element('div', 'inspection-hero-text');
  const title = element('h2', 'inspection-title', stop.name);
  const meta = element('p', 'muted', `${stop.equipment} · ${stop.zone} · ${stop.type}`);
  const history = button('История станка', 'link', () => ctx.openEquipment(stop.equipment));
  heroText.append(title, meta, history);
  if (ctx.canChangeImage()) {
    const stationPhoto = button('📷 Сделать фото станка', 'link station-photo', async () => {
      stationPhoto.disabled = true;
      try {
        const replaced = await ctx.changeImage(stop.equipment);
        if (replaced) { showPicture(); showMessage('ok', 'Фото станка обновлено.'); }
      } catch (error) {
        showMessage('error', `Фото станка: ${error.message}`);
      } finally {
        stationPhoto.disabled = false;
      }
    });
    heroText.append(stationPhoto);
  }
  hero.append(heroText);

  let pictureSrc;
  function showPicture() {
    const current = stops().find((candidate) => candidate.equipment === code) || stop;
    if (picture && ctx.image(current) === pictureSrc) return; // экран перерисовывается часто — картинку не трогаем
    pictureSrc = ctx.image(current);
    const next = equipmentImage(ctx, current, 'inspection-image');
    if (next.tagName === 'IMG') next.onclick = () => showPhoto(next.src);
    if (picture) picture.replaceWith(next); else hero.prepend(next);
    picture = next;
    hero.classList.toggle('no-image', next.tagName !== 'IMG');
  }

  const form = element('form', 'inspection-form');
  const checklist = element('fieldset', 'checklist');
  checklist.append(element('legend', '', stop.checklist.length ? 'Чек-лист' : 'Результат осмотра'));
  const rows = stop.checklist.length ? stop.checklist : [{ id: null, text: 'Общее состояние' }];
  rows.forEach((row, index) => {
    const block = element('div', 'check-row');
    block.dataset.item = row.id ?? '';
    block.dataset.text = row.text;
    const segments = element('div', 'segments');
    for (const value of ['ok', 'remark', 'fault']) segments.append(choice(`check-${index}`, value, value === 'ok'));
    const detail = element('input', 'check-note');
    detail.placeholder = 'Что именно';
    detail.maxLength = 500;
    detail.hidden = true;
    segments.onchange = () => { detail.hidden = block.querySelector('input:checked').value === 'ok'; };
    block.append(element('span', 'check-text', row.text), segments, detail);
    checklist.append(block);
  });
  const commentLabel = element('label', 'field', 'Комментарий');
  const comment = element('textarea');
  comment.name = 'comment';
  comment.rows = 3;
  comment.maxLength = 2000;
  comment.placeholder = 'Что заметили';
  commentLabel.append(comment);

  const photoBlock = element('section', 'photos');
  const thumbs = element('div', 'photo-strip');
  const camera = button('📷 Сфотографировать', 'big secondary', () => addPhotos(() => takePhoto()));
  const gallery = button('Из галереи', 'big secondary', () => addPhotos(() => pickPhotos(MAX_PHOTOS - photos.length)));
  const photoButtons = element('div', 'photo-buttons');
  photoButtons.append(camera, gallery);
  photoBlock.append(element('h3', '', `Фото к осмотру, до ${MAX_PHOTOS}`), thumbs, photoButtons);
  form.append(checklist, commentLabel, photoBlock);
  // Enter в поле не должен сохранять и листать шаги — только кнопки внизу.
  form.onsubmit = (event) => event.preventDefault();
  body.append(hero, message, form);

  const footer = element('footer', 'bottom-bar inspection-bar');
  const skip = button('Пропустить станок', 'link skip-step', () => run(() => flow.skip()));
  const prev = button('← Назад', 'big secondary step-back', () => run(() => flow.back()));
  const next = button('Далее →', 'big primary step-next', () => run(() => flow.next()));
  const row = element('div', 'step-buttons');
  row.append(prev, next);
  footer.append(skip, row);
  root.replaceChildren(header, body, footer);

  // Всё, что введено, сразу пишется в черновик (IndexedDB) — переживёт закрытие приложения.
  const collect = () => ({
    equipment: stop.equipment,
    checks: [...form.querySelectorAll('.check-row')].map((block) => ({
      value: block.querySelector('input:checked').value, note: block.querySelector('.check-note').value,
    })),
    comment: comment.value,
    photos,
  });
  const persist = () => { settled = false; ctx.drafts.save(collect()); };
  form.addEventListener('input', persist);
  form.addEventListener('change', persist);

  function showMessage(state, text) {
    message.dataset.state = state;
    message.textContent = text;
  }

  function renderPhotos() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = photos.map((photo) => URL.createObjectURL(photo.blob));
    thumbs.replaceChildren(...photos.map((photo, index) => {
      const item = element('div', 'photo-thumb');
      const image = element('img');
      image.src = urls[index];
      image.alt = `Фото ${index + 1}`;
      const remove = button('✕', 'photo-remove', () => { photos = photos.filter((_, position) => position !== index); renderPhotos(); persist(); });
      remove.setAttribute('aria-label', `Убрать фото ${index + 1}`);
      item.append(image, remove);
      return item;
    }));
    camera.disabled = gallery.disabled = photos.length >= MAX_PHOTOS;
  }

  async function addPhotos(source) {
    if (photos.length >= MAX_PHOTOS) return;
    // До открытия камеры: Android может выгрузить приложение. В браузере не ждём — Safari открывает
    // выбор фото только сразу после нажатия, а черновик и так сохраняется при каждом вводе.
    const draft = ctx.drafts.save(collect());
    if (isNative()) await draft;
    try {
      const added = await source();
      if (!added.length) return;
      photos = [...photos, ...added].slice(0, MAX_PHOTOS);
      renderPhotos();
      persist();
    } catch (error) {
      showMessage('error', `Камера: ${error.message}`);
    }
  }

  function fillForm(values) {
    form.querySelectorAll('.check-row').forEach((block, index) => {
      const value = values.checks?.[index];
      if (!value) return;
      const input = block.querySelector(`input[value="${value.value}"]`);
      if (input) input.checked = true;
      block.querySelector('.check-note').value = value.note || '';
      block.querySelector('.check-note').hidden = value.value === 'ok';
    });
    comment.value = values.comment || '';
  }

  fillForm(formValues(rows, saved));
  const baseline = formSignature(collect()); // ответы при открытии — с ними сравнивает «Далее»
  const changed = () => formSignature(collect()) !== baseline;

  function restore(draft) {
    fillForm(draft);
    photos = draft.photos || [];
    renderPhotos();
    settled = false;
    if (!note) showMessage('ok', 'Восстановлен несохранённый осмотр.');
  }

  function renderStep() {
    const list = stops();
    const { index, last } = stepPosition(list, code);
    header.querySelector('.top-title').textContent = `Шаг ${index + 1} из ${list.length}`;
    let subtitle = header.querySelector('.top-subtitle');
    if (!subtitle) { subtitle = element('p', 'top-subtitle'); header.querySelector('.top-text').append(subtitle); }
    subtitle.textContent = ctx.state.today?.route?.name || 'Всё оборудование';
    prev.disabled = busy || index <= 0;
    next.disabled = skip.disabled = busy;
    next.textContent = last ? 'Сохранить и завершить' : 'Далее →';
    showPicture();
  }

  // Уход без сохранения (← в шапке, «← Назад», «Пропустить»): изменённый ввод — переспросим, черновик удалим.
  function canLeave() {
    if (settled || !changed()) return true;
    // eslint-disable-next-line no-alert -- короткое подтверждение, чтобы не потерять заполненный осмотр
    if (!confirm('Осмотр не сохранён. Выйти без сохранения?')) return false;
    discard();
    return true;
  }

  function discard() {
    settled = true;
    ctx.drafts.clear();
  }

  async function save() {
    const blocks = [...form.querySelectorAll('.check-row')];
    const answers = stop.checklist.length ? blocks.map((block) => ({
      item: Number(block.dataset.item), text: block.dataset.text,
      result: block.querySelector('input:checked').value, note: block.querySelector('.check-note').value.trim(),
    })) : [];
    const result = stop.checklist.length ? overallResult(answers) : blocks[0].querySelector('input:checked').value;
    const text = [comment.value.trim(), !stop.checklist.length && blocks[0].querySelector('.check-note').value.trim()]
      .filter(Boolean).join('\n');
    showMessage('', 'Сохранение…');
    try {
      await ctx.save({
        client_id: uuid(), equipment: stop.equipment, inspected_at: Date.now() / 1000,
        result, answers, comment: text, photos,
      });
    } catch (error) {
      showMessage('error', `Не удалось сохранить на телефоне: ${error.message}`);
      throw error;
    }
    // Исправили ещё не отправленный осмотр — старый из очереди убираем, чтобы на сервер ушёл один.
    if (saved?.pending) await ctx.discard(saved.client_id);
    settled = true;
    await ctx.drafts.clear();
  }

  const done = () => `Осмотр «${stop.name}» сохранён${ctx.state.offline ? ' на телефоне, уйдёт при появлении сети' : ''}.`;
  const flow = createStepFlow({
    code, stops, changed,
    // Своё окно с тремя кнопками; закрыли фоном или «Назад» телефона — то же, что «Остаться».
    ask: () => choiceDialog({
      title: 'Сохранить изменения?',
      text: 'Сегодня этот станок уже осмотрен, а ответы изменены.',
      choices: [
        { label: 'Сохранить', value: SAVE, className: 'big primary' },
        { label: 'Не сохранять', value: DISCARD, className: 'big secondary' },
        { label: 'Остаться', value: STAY, className: 'link' },
      ],
      cancel: STAY,
    }),
    save, discard, leave: canLeave,
    open: (target, { saved: wasSaved }) => ctx.openStep(target, { replace: true, note: wasSaved ? done() : '' }),
    finish: ({ saved: wasSaved }) => ctx.back(wasSaved ? { note: done() } : {}),
  });

  async function run(action) {
    if (busy) return;
    busy = true;
    renderStep();
    try {
      await action();
    } catch {
      // Сообщение уже на экране (save); остаёмся на шаге.
    } finally {
      busy = false;
      if (root.contains(footer)) renderStep();
    }
  }

  renderStep();
  renderPhotos();
  ctx.drafts.get().then((draft) => { if (draft?.equipment === stop.equipment) restore(draft); });

  return {
    update: renderStep,
    canLeave,
    // Фото, пришедшее после перезапуска приложения (камера выгрузила приложение из памяти).
    restored(draft) { if (draft?.equipment === stop.equipment) restore(draft); },
    dispose() { urls.forEach((url) => URL.revokeObjectURL(url)); },
  };
}

// Экран «Настройки»: адрес backend и проверка связи (GET /health/).
import { BUILD_SERVER, checkServer, getServer, normalizeServer, saveServer } from '../api/server.js';
import { button, element, topBar } from '../ui.js';

export function renderSettings(root, ctx) {
  const firstRun = !ctx.hasServer();
  root.replaceChildren(topBar({
    title: 'Настройки', subtitle: firstRun ? 'Укажите адрес сервера' : 'Адрес сервера Plant Twin',
    onBack: firstRun ? null : ctx.back,
  }));
  const body = element('main', 'screen-body');
  const label = element('label', 'field', 'Адрес backend');
  const input = element('input');
  input.type = 'url';
  input.inputMode = 'url';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.value = getServer();
  input.placeholder = 'http://192.168.3.103:8000';
  label.append(input);
  // Сборка для облака (VITE_API_URL) — подсказываем её сервер; иначе — компьютер в сети цеха.
  const hint = element('p', 'muted', BUILD_SERVER
    ? `Сервер по умолчанию: ${BUILD_SERVER}. Меняйте адрес, только если вас попросил администратор.`
    : 'Адрес компьютера с Django в сети цеха, например http://192.168.3.103:8000. '
      + 'Django должен быть запущен командой runserver 0.0.0.0:8000.');
  const message = element('p', 'message');
  message.setAttribute('role', 'status');
  const check = button('Проверить связь', 'big secondary', async () => {
    check.disabled = true;
    message.dataset.state = '';
    message.textContent = 'Проверка…';
    const result = await checkServer(input.value);
    message.textContent = result.message;
    message.dataset.state = result.ok ? 'ok' : 'error';
    check.disabled = false;
  });
  const save = button('Сохранить', 'big primary', () => {
    const server = normalizeServer(input.value);
    if (!server) { message.textContent = 'Неверный адрес. Пример: http://192.168.3.103:8000'; message.dataset.state = 'error'; return; }
    const changed = server !== getServer() || firstRun;
    // Другой сервер — другие пользователи и маршруты: сеанс и сохранённые копии сбрасываем.
    if (changed && ctx.signedIn() && !ctx.confirmServerChange()) return;
    saveServer(server);
    ctx.serverSaved(changed);
  });
  const pending = ctx.pendingCount();
  body.append(label, hint, check, message, save);
  if (pending) body.append(element('p', 'warning', `На телефоне ${pending} неотправленных осмотров. Они уйдут на сервер, указанный здесь.`));
  body.append(element('p', 'muted version', `Обход ${ctx.version}`));
  root.append(body);
  return {};
}

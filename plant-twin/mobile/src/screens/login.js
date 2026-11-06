// Экран «Вход». Перенесено из frontend/src/ui/login.js: та же форма и обработка ошибок,
// без описания 3D-плана; показывает адрес сервера и ведёт в «Настройки».
import { getServer } from '../api/server.js';
import { button, element } from '../ui.js';

export function renderLogin(root, ctx, { message = '' } = {}) {
  root.innerHTML = `
    <main class="login-page">
      <div class="login-brand"><img src="/icon.svg" alt="" class="login-icon"><h1>Обход</h1>
        <p class="muted">Ежедневный обход оборудования</p></div>
      <form class="login-card">
        <label class="field">Имя пользователя<input name="username" autocomplete="username" autocapitalize="off" required></label>
        <label class="field">Пароль<input name="password" type="password" autocomplete="current-password" required></label>
        <p class="message" data-state="error" role="alert"></p>
        <button type="submit" class="big primary">Войти</button>
      </form>
      <p class="login-server muted"></p>
    </main>`;
  const form = root.querySelector('form');
  const error = form.querySelector('[role="alert"]');
  error.textContent = message;
  root.querySelector('.login-server').append(element('span', '', `Сервер: ${getServer()} `), button('Изменить', 'link', ctx.openSettings));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    submit.textContent = 'Вход…';
    error.textContent = '';
    try {
      await ctx.login(form.elements.username.value.trim(), form.elements.password.value);
    } catch (failure) {
      error.textContent = failure.message;
      form.elements.password.value = '';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });
  return {};
}

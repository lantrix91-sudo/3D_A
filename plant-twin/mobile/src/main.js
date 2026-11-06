// Приложение «Обход»: экраны Настройки → Вход → Маршруты → Шаги → Осмотр → Станок.
// Здесь навигация между экранами, загрузка данных (с копиями на телефоне) и офлайн-очередь осмотров.
import './style.css';
import { App } from '@capacitor/app';
import { api } from './api/client.js';
import { hasSavedServer } from './api/server.js';
import { isNative, restoredPhotos, takePhoto } from './camera.js';
import { createDrafts } from './offline/drafts.js';
import { createImageCache } from './offline/images.js';
import { compressImage } from './offline/photos.js';
import { createQueue, inspectionForm } from './offline/queue.js';
import { registerServiceWorker } from './pwa/register.js';
import { chooseRoute } from './rounds/logic.js';
import { renderEquipment } from './screens/equipment.js';
import { MAX_PHOTOS, renderInspection } from './screens/inspection.js';
import { renderLogin } from './screens/login.js';
import { renderRoutes } from './screens/routes.js';
import { renderSettings } from './screens/settings.js';
import { renderSteps } from './screens/steps.js';
import { dismissDialog, element } from './ui.js';

const root = document.querySelector('#app');
const SCREENS = { settings: renderSettings, login: renderLogin, routes: renderRoutes, steps: renderSteps, inspection: renderInspection, equipment: renderEquipment };

// Копии на телефоне (localStorage): выбранный маршрут, список маршрутов, маршрут дня, история станков.
const ROUTE_KEY = 'obhod:route';
const ROUTES_CACHE = 'obhod:routes';
const USER_KEY = 'obhod:user';
const roundCacheKey = (routeId) => `obhod:round:${routeId || 'all'}`;
const historyKey = (code) => `obhod:equipment:${code}`;
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* хранилище недоступно */ } },
  clearCaches() {
    try { Object.keys(localStorage).filter((key) => key.startsWith('obhod:') && key !== 'obhod:server').forEach((key) => localStorage.removeItem(key)); } catch { /* нет хранилища */ }
  },
};

const state = { routes: [], routeId: null, today: null, pending: [], offline: false, loaded: false, signedIn: false };
const drafts = createDrafts();
const images = createImageCache();
let queue = null;
let stack = []; // экраны «под» текущим: кнопка ← и системная «Назад» возвращают к ним
let current = null; // { name, params, view }
let reloadTimer = null;
let historyGuard = false; // PWA: лишняя запись в истории браузера, чтобы системная «Назад» не закрывала приложение

// ── Навигация ──
function show(name, params = {}) {
  current?.view?.dispose?.();
  root.replaceChildren();
  current = { name, params, view: SCREENS[name](root, ctx, params) || {} };
  window.scrollTo(0, 0);
}

function go(name, params = {}, { replace = false } = {}) {
  if (current && replace && current.view.canLeave && !current.view.canLeave()) return;
  if (current && !replace) stack.push({ name: current.name, params: current.params });
  show(name, params);
  guardHistory();
}

// В браузере (PWA на Android) системная «Назад» листает историю страницы. Держим одну запись-«заглушку»,
// пока есть куда вернуться: её снятие (popstate) работает как наша кнопка ←.
function guardHistory() {
  if (isNative() || historyGuard || !stack.length) return;
  history.pushState({ obhod: true }, '');
  historyGuard = true;
}

function back(options = {}) {
  if (dismissDialog()) return; // открыто окно — «Назад» закрывает только его
  if (current?.view.canLeave && !current.view.canLeave()) return;
  const previous = stack.pop();
  if (!previous) { if (isNative()) App.minimizeApp(); return; }
  show(previous.name, previous.params);
  if (options.note) toast(options.note);
}

function reset(name, params = {}) {
  stack = [];
  current?.view?.dispose?.();
  current = null;
  show(name, params);
}

function update() { current?.view.update?.(); }

function toast(text) {
  const node = element('div', 'toast', text);
  node.setAttribute('role', 'status');
  document.body.append(node);
  setTimeout(() => node.remove(), 4000);
}

// ── Данные ──
// Маршруты и маршрут дня с сервера; без сети — последние сохранённые на телефоне копии.
async function loadRound() {
  let offline = false;
  try {
    state.routes = await api.getRoutes();
    storage.set(ROUTES_CACHE, state.routes);
  } catch (error) {
    if (error.status === 401) return;
    if (error.status) toast(`Маршруты недоступны: ${error.message}`);
    state.routes = storage.get(ROUTES_CACHE) || state.routes;
    offline = true;
  }
  // Выбранный маршрут запоминается; если его удалили или выключили — первый активный.
  const route = chooseRoute(state.routes, storage.get(ROUTE_KEY));
  state.routeId = route?.id ?? null;
  if (route) storage.set(ROUTE_KEY, route.id);
  try {
    state.today = await api.getRoundToday(route?.id);
    storage.set(roundCacheKey(route?.id), state.today);
  } catch (error) {
    if (error.status === 401) return;
    if (error.status && error.status !== 404) toast(`Обход недоступен: ${error.message}`);
    state.today = storage.get(roundCacheKey(route?.id)) || null;
    offline = true;
  }
  state.offline = offline;
  state.loaded = true;
  await refreshPending();
  // Картинки станков маршрута — на телефон, чтобы были и без сети. Список перерисуем, когда скачаются.
  if (state.today) images.prefetch(state.today.stops).then((changed) => { if (changed) update(); });
}

// «Сделать фото станка»: камера → 800 px JPEG → сервер; копия сразу на телефоне.
// takePhoto вызывается первым, без await перед ним: Safari открывает камеру только сразу после нажатия.
async function changeImage(code) {
  const [photo] = await takePhoto();
  if (!photo) return null;
  const small = await compressImage(new File([photo.blob], photo.name, { type: photo.blob.type || 'image/jpeg' }), 800, 0.82);
  const form = new FormData();
  form.append('image', small.blob, small.name);
  form.append('source', 'photo');
  let saved;
  try {
    saved = await api.setImage(code, form);
  } catch (error) {
    throw new Error(error.status === 0 ? 'нет связи. Фото станка меняется только при связи с сервером.' : error.message);
  }
  await images.put(code, saved.image, small.blob);
  for (const stop of state.today?.stops || []) {
    if (stop.equipment === code) Object.assign(stop, { image: saved.image, image_source: saved.image_source, image_updated_at: saved.image_updated_at });
  }
  if (state.today) storage.set(roundCacheKey(state.routeId), state.today);
  return saved;
}

async function refreshPending() {
  if (queue) state.pending = await queue.list();
  update();
}

function scheduleReload(delay = 0) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(loadRound, delay);
}

async function equipmentHistory(code) {
  try {
    const [card, inspections, conditions] = await Promise.all([api.getCard(code), api.getInspections(code), api.getConditions(code)]);
    const data = { card, inspections, conditions, savedAt: Date.now() };
    storage.set(historyKey(code), data);
    return data;
  } catch (error) {
    const saved = storage.get(historyKey(code));
    if (error.status === 0 && saved) return { ...saved, offline: true };
    throw new Error(error.status === 0 ? 'Нет связи, а сохранённой истории этого станка на телефоне нет.' : error.message);
  }
}

// ── Сеанс ──
function startQueue() {
  if (queue) return;
  queue = createQueue({
    send: (entry) => api.postInspection(inspectionForm(entry)),
    // Отправили что-то — перечитываем маршрут (отметки с сервера), иначе только счётчик ⏳.
    onChange: (sent) => (sent.length ? loadRound() : refreshPending()),
  });
}

async function enterApp() {
  state.signedIn = true;
  startQueue();
  const remembered = storage.get(ROUTE_KEY) !== null; // маршрут уже выбирали — сразу к его шагам
  reset('routes');
  await loadRound();
  queue.sync().catch(() => {}); // осмотры, оставшиеся с прошлого раза без сети
  if (remembered || !state.routes.some((route) => route.is_active)) go('steps');
  // Приложение закрылось посреди осмотра (или его выгрузила камера) — открываем тот же станок.
  const draft = await drafts.get();
  if (draft && state.today?.stops.some((stop) => stop.equipment === draft.equipment)) {
    if (current?.name !== 'steps') go('steps');
    go('inspection', { code: draft.equipment });
  }
}

function showLogin(message = '') {
  state.signedIn = false;
  reset('login', { message });
}

const ctx = {
  state,
  drafts,
  version: __APP_VERSION__,
  back,
  hasServer: () => hasSavedServer(),
  signedIn: () => state.signedIn,
  pendingCount: () => state.pending.length,
  userLine: () => storage.get(USER_KEY) || '',
  openSettings: () => go('settings'),
  confirmServerChange: () => confirm('Сменить сервер? Потребуется войти заново.'), // eslint-disable-line no-alert
  serverSaved(changed) {
    if (!changed) { back(); return; }
    api.logout();
    storage.clearCaches();
    images.clear(); // картинки другого сервера не нужны
    Object.assign(state, { routes: [], routeId: null, today: null, offline: false, loaded: false });
    showLogin();
  },
  async login(username, password) {
    await api.login(username, password);
    storage.set(USER_KEY, username);
    await enterApp();
  },
  logout() {
    const waiting = state.pending.length;
    // eslint-disable-next-line no-alert
    if (waiting && !confirm(`На телефоне ${waiting} неотправленных осмотров. Они останутся и уйдут после следующего входа. Выйти?`)) return;
    api.logout();
    showLogin();
  },
  reload: () => loadRound(),
  openRoute(routeId) {
    storage.set(ROUTE_KEY, routeId);
    state.today = storage.get(roundCacheKey(routeId)); // сразу копия, затем свежие данные с сервера
    go('steps');
    loadRound();
  },
  openStep: (code, { replace = false, note = '' } = {}) => go('inspection', { code, note }, { replace }),
  openEquipment: (code) => go('equipment', { code }),
  equipmentHistory,
  save: (entry) => queue.add(entry),
  image: (stop) => images.src(stop.equipment, stop.image),
  canChangeImage: () => Boolean(state.today?.can_change_image),
  changeImage,
  discard: (clientId) => queue.remove(clientId),
};

// ── Телефон: кнопка «Назад», возврат в приложение, фото после перезапуска ──
if (isNative()) {
  App.addListener('backButton', () => back());
  App.addListener('resume', () => { if (state.signedIn) { queue?.sync().catch(() => {}); scheduleReload(); } });
  App.addListener('appRestoredResult', async (event) => {
    const draft = await drafts.addPhotos(await restoredPhotos(event), MAX_PHOTOS);
    if (draft) current?.view.restored?.(draft);
  });
}
addEventListener('popstate', () => {
  historyGuard = false;
  back();
  guardHistory();
});
// PWA: вернулись в приложение из другого (аналог resume в APK) — отправляем очередь и обновляем маршрут.
document.addEventListener('visibilitychange', () => {
  if (isNative() || document.visibilityState !== 'visible' || !state.signedIn) return;
  queue?.sync().catch(() => {});
  scheduleReload();
});
addEventListener('online', () => { if (state.signedIn) scheduleReload(); }); // маршрут могли изменить, пока не было сети
setInterval(() => { if (state.signedIn) loadRound(); }, 5 * 60 * 1000); // смена суток и чужие осмотры
api.onSessionExpired(() => showLogin('Сеанс завершён. Войдите снова.'));

async function start() {
  root.replaceChildren(element('p', 'screen-body muted', 'Запуск…'));
  // Первый запуск APK: сначала адрес сервера.
  if (isNative() && !hasSavedServer()) { reset('settings'); return; }
  state.pending = await startPendingCount();
  const restored = await api.restoreSession();
  if (restored) await enterApp();
  else showLogin();
}

async function startPendingCount() {
  startQueue();
  return queue.list();
}

registerServiceWorker(isNative());
start();

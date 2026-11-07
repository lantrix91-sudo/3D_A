import { ApiError, api, login, logout, onSessionExpired, restoreSession } from '../api/client';
import { connectLive } from '../api/live';
import type { LiveEntry, PlanEquipment, PlanResponse, PlanZone, Profile } from '../api/types';
import { EQUIPMENT, EQUIPMENT_BY_ID, SENSOR_BY_ID, removeEquipment, upsertEquipment } from '../domain/config';
import type { AppEvent, DisplayState, Equipment, EquipmentId } from '../domain/types';
import type { EquipmentLive, SensorLive } from '../engine/alarmEngine';
import { toast, useApp } from '../store/appStore';
import { setConnection, useServer } from '../store/serverStore';
import { newId } from '../utils/id';
import type { Period, SeriesResult } from './history';
import { PERIOD_MS, buildSeries } from './history';
import { registerServerModel } from './models3d';
import { initServerWalls } from './serverWalls';
import {
  clampToZone,
  computeLive,
  equipmentFromPlan,
  liveEntryFromPlan,
  sameSignals,
  sensorsFromSignals,
  statusChangeMessage,
  worldToPlan,
} from './planMapper';
import { clearPoseOverride, commitServerEvent, getPose, logJournalEvent, prepareServerRuntime, selectEquipment, setPlaceMode } from './telemetryHub';

/**
 * Центр приложения: загружает план, держит WebSocket и записывает изменения на бэкенд.
 *
 * Порядок при старте:
 *   bootServerMode → (экран входа, если нет токена) → openPlan:
 *     GET /auth/me/ и GET /plan/ → replaceEquipment (заполнить реестр оборудования)
 *     → prepareServerRuntime (настройки и память интерфейса) → connectLive (WebSocket) → phase: 'ready'.
 *
 * Дальше каждое сообщение WebSocket проходит путь:
 *   handleEntry → computeLive (planMapper) → publishLive → useApp.live → список, карточка, сцена.
 */

// Последняя запись WebSocket по каждому станку. Живёт здесь, потому что из неё пересчитываются
// live-данные — в том числе по таймеру, когда новых сообщений нет (см. checkStale)
const entries = new Map<EquipmentId, LiveEntry>();
const liveEquipment: Record<EquipmentId, EquipmentLive> = {};
const liveSensors: Record<string, SensorLive> = {};

// ---------------------------------------------------------------- вход и загрузка плана

/** Первый шаг при загрузке страницы. Вызывается из telemetryHub.initApp */
export async function bootServerMode() {
  // Refresh-токен отклонён: самый простой и надёжный выход — начать с экрана входа
  onSessionExpired(() => location.reload());
  const session = await restoreSession();
  if (session === 'active') await openPlan();
  else if (session === 'offline') showOffline();
  else useApp.setState({ phase: 'login' });
}

/** Вход уже был, но сервер не отвечает: основной экран с пустыми данными и статусом «Сервер: нет связи» */
function showOffline() {
  prepareServerRuntime(null);
  setConnection('offline');
  publishLive();
  useApp.setState({ phase: 'ready' });
  window.setTimeout(retryConnection, OFFLINE_RETRY_MS);
}

/** Сервер ответил — перезагружаем страницу: так весь запуск проходит заново, и состояние получается чистым */
async function retryConnection() {
  try {
    await api.getMe();
    location.reload();
  } catch (e) {
    if (isServerDown(e as ApiError)) window.setTimeout(retryConnection, OFFLINE_RETRY_MS);
    else location.reload();
  }
}

const OFFLINE_RETRY_MS = 5000;
/** status 0 — ответа нет совсем, 5xx — так отвечает прокси Vite, когда Django не запущен */
const isServerDown = (e: ApiError) => e.status === 0 || e.status >= 500;

/** Кнопка «Войти». Возвращает текст ошибки для формы или null */
export async function signIn(username: string, password: string): Promise<string | null> {
  try {
    await login(username, password);
  } catch (e) {
    // На 401 SimpleJWT отвечает английской фразой, поэтому для пользователя пишем свою
    return (e as ApiError).status === 401 ? 'Неверный логин или пароль' : (e as ApiError).message;
  }
  await openPlan();
  return null;
}

export function signOut() {
  logout();
  location.reload();
}

async function openPlan() {
  useApp.setState({ phase: 'loading', error: null });
  let plan: PlanResponse;
  let me: Profile;
  try {
    const [profile, loaded] = await Promise.all([api.getMe(), api.getPlan()]);
    me = profile;
    plan = loaded;
    useServer.setState({ username: me.username, roles: me.roles, canEdit: plan.can_edit_layout, canEditWalls: plan.can_edit_walls });
  } catch (e) {
    const err = e as ApiError;
    if (err.status === 401) {
      useApp.setState({ phase: 'login' });
      return;
    }
    if (isServerDown(err)) {
      showOffline();
      return;
    }
    useApp.setState({
      phase: 'error',
      error: err.status === 403 ? 'У пользователя нет роли operator, engineer или admin. Роль назначается в админке Django.' : err.message,
    });
    return;
  }

  replaceEquipment(plan);
  prepareServerRuntime(plan.plant?.name ?? null);
  publishLive();
  useApp.setState({ phase: 'ready' });

  // Стены загружаем уже при открытом интерфейсе: сбой этого запроса не должен мешать работе с оборудованием.
  // Редактор один на сцену, поэтому стены относятся к первой показанной зоне
  const wallsZone = visibleZones(plan)[0];
  if (wallsZone) void initServerWalls(wallsZone.id, me.username, plan.can_edit_walls);

  // Каталог моделей нужен только форме оборудования; его сбой не должен мешать работе сцены
  if (plan.can_edit_layout) void api.getAssets().then((assets) => useServer.setState({ assets })).catch((e) => console.warn('[server] каталог ассетов', e));

  connectLive({
    getToken: api.token,
    refreshToken: api.refresh,
    onSnapshot: (items) => {
      for (const item of items) handleEntry(item, false);
      publishLive();
    },
    onUpdate: (item) => {
      handleEntry(item, true);
      publishLive();
    },
    onConnection: setConnection,
  });
  window.setInterval(checkStale, 5000);
}

/** Показываем зоны с visible_by_default. Переключателя зон пока нет — скрытые зоны не выводятся */
function visibleZones(plan: PlanResponse): PlanZone[] {
  return plan.zones.filter((z) => z.visible_by_default);
}

/** Заполнить реестр оборудованием из базы */
function replaceEquipment(plan: PlanResponse) {
  for (const e of [...EQUIPMENT]) removeEquipment(e.id);
  const zones = visibleZones(plan);
  useServer.setState({
    zones: zones.map(({ equipment: _equipment, ...zone }) => zone),
    types: [...new Set(plan.zones.flatMap((z) => z.equipment.map((e) => e.type)))].sort(),
  });
  for (const zone of zones) {
    for (const item of zone.equipment) addFromPlan(item, zone);
  }
}

function addFromPlan(item: PlanEquipment, zone: Omit<PlanZone, 'equipment'>, sensors = EQUIPMENT_BY_ID[item.code]?.server?.sensors ?? []): Equipment {
  registerServerModel(item.asset);
  const eq = equipmentFromPlan(item, zone as PlanZone, sensors);
  upsertEquipment(eq);
  const prev = entries.get(item.code);
  const entry = prev ? { ...prev, status: item.status, condition: item.condition, ts: item.last_seen, last_seen: item.last_seen, offline_seconds: item.offline_seconds } : liveEntryFromPlan(item);
  entries.set(item.code, entry);
  applyEntry(entry, eq);
  return eq;
}

// ---------------------------------------------------------------- живые данные

/** Обработать запись WebSocket. withEvent = false — снимок при подключении, в ленту он не пишется */
function handleEntry(entry: LiveEntry, withEvent: boolean) {
  const eq = EQUIPMENT_BY_ID[entry.equipment];
  if (!eq?.server) return; // оборудование из скрытой зоны или добавленное кем-то после загрузки плана
  entries.set(entry.equipment, entry);
  // Список датчиков приходит только по WebSocket: в /plan/ его нет
  if (!sameSignals(eq.server.sensors, entry.signals)) {
    upsertEquipment({ ...eq, server: { ...eq.server, sensors: sensorsFromSignals(entry.equipment, entry.signals) } });
  }
  const before = liveEquipment[entry.equipment]?.serverState;
  const after = applyEntry(entry, eq);
  if (withEvent && before !== after) logStatusChange(entry.equipment, after);
}

function applyEntry(entry: LiveEntry, eq: Equipment): DisplayState {
  const computed = computeLive(entry, eq.server?.hasTelemetry ?? false, Date.now());
  liveEquipment[entry.equipment] = computed.equipment;
  Object.assign(liveSensors, computed.sensors);
  return computed.equipment.serverState!;
}

/** Передать данные интерфейсу. Новые объекты-обёртки нужны, чтобы React заметил изменение */
function publishLive() {
  useApp.setState((s) => ({
    live: { sensors: { ...liveSensors }, equipment: { ...liveEquipment } },
    dataVersion: s.dataVersion + 1,
  }));
}

/** Раз в 5 с проверяем, не устарели ли данные: при обрыве устройства новых сообщений не будет */
let tick = 0;
function checkStale() {
  let changed = false;
  for (const [code, entry] of entries) {
    const eq = EQUIPMENT_BY_ID[code];
    if (!eq) continue;
    const before = liveEquipment[code]?.serverState;
    const after = applyEntry(entry, eq);
    if (before !== after) {
      changed = true;
      logStatusChange(code, after);
    }
  }
  // Раз в 30 с обновляем и графики (новые минутные точки) — даже если статусы не менялись
  tick += 1;
  if (changed || tick % 6 === 0) publishLive();
}

function logStatusChange(code: EquipmentId, state: DisplayState) {
  const { message, severity } = statusChangeMessage(state);
  const event: AppEvent = {
    id: newId('EVT'),
    ts: Date.now(),
    equipmentId: code,
    type: 'journal',
    severity,
    message,
  };
  void commitServerEvent(event);
}

// ---------------------------------------------------------------- графики

const READINGS_TTL_MS = 30000;
const readingsCache = new Map<string, { at: number; request: ReturnType<typeof api.getReadings> }>();

/**
 * История для графика. Сервер отдаёт сразу все числовые сигналы станка, а на экране один график на
 * сигнал, поэтому общий запрос кэшируем на 30 с: иначе на каждый график уходил бы отдельный запрос.
 */
export async function loadServerSeries(sensorId: string, period: Period, now: number): Promise<SeriesResult> {
  const sensor = SENSOR_BY_ID[sensorId];
  if (!sensor?.signalKey) return buildSeries([]);
  // API принимает только целые часы (1–24), поэтому 15 минут вырезаем из часового ответа
  const hours = period === '24h' ? 24 : 1;
  const key = `${sensor.equipmentId}:${hours}`;
  let cached = readingsCache.get(key);
  if (!cached || now - cached.at > READINGS_TTL_MS) {
    cached = { at: now, request: api.getReadings(sensor.equipmentId, hours) };
    readingsCache.set(key, cached);
    cached.request.catch(() => readingsCache.delete(key)); // ошибку не кэшируем
  }
  const data = await cached.request;
  const from = now - PERIOD_MS[period];
  const series = data.series.find((s) => s.key === sensor.signalKey);
  const points = (series?.points ?? [])
    // x — начало минуты в секундах; точку ставим в середину минуты
    .map((p) => ({ ts: p.x * 1000 + 30000, v: p.y, step: 60000 }))
    .filter((p) => p.ts >= from);
  return buildSeries(points);
}

// ---------------------------------------------------------------- запись: расстановка

function zoneOf(id: EquipmentId) {
  const code = EQUIPMENT_BY_ID[id]?.server?.zone;
  return useServer.getState().zones.find((z) => z.code === code) ?? null;
}

/** Ограничить перетаскивание границами зоны */
export function clampServerPose(id: EquipmentId, x: number, z: number) {
  const zone = zoneOf(id);
  return zone ? clampToZone(zone, { x, z, rotY: getPose(id).rotY }) : { x, z };
}

/** Координаты для показа в панели: как в базе, а не как в Three.js */
export function planCoordinates(id: EquipmentId) {
  const zone = zoneOf(id);
  return zone ? worldToPlan(zone, getPose(id)) : null;
}

const saveQueues = new Map<EquipmentId, Promise<void>>();

/**
 * Сохранить положение после перетаскивания или поворота. Запросы по одному станку идут строго
 * по очереди: при быстрых щелчках «повернуть» более ранний ответ не перезапишет более поздний.
 */
export function commitServerPose(id: EquipmentId) {
  const previous = saveQueues.get(id) ?? Promise.resolve();
  const next = previous.then(() => savePose(id));
  saveQueues.set(id, next);
}

async function savePose(id: EquipmentId) {
  const eq = EQUIPMENT_BY_ID[id];
  const zone = zoneOf(id);
  if (!eq || !zone) return;
  const pose = getPose(id);
  const body = worldToPlan(zone, pose);
  const saved = worldToPlan(zone, { x: eq.position[0], z: eq.position[1], rotY: eq.rotationY });
  // Щелчок без перемещения: на сервер ничего не отправляем, в журнал перемещений строка не попадёт
  if (body.pos_x === saved.pos_x && body.pos_z === saved.pos_z && body.rotation_deg === saved.rotation_deg) {
    clearPoseOverride(id, pose);
    return;
  }
  try {
    const item = await api.patchEquipment(id, body);
    addFromPlan(item, zone);
    clearPoseOverride(id, pose);
    publishLive();
    void logJournalEvent(id, `Положение сохранено на сервере: X ${body.pos_x} м, Z ${body.pos_z} м, поворот ${body.rotation_deg}°`);
  } catch (e) {
    // Сервер не принял: возвращаем станок на последнее сохранённое место
    clearPoseOverride(id, pose);
    toast(`Положение не сохранено: ${(e as ApiError).message}`, 'error', 8000);
  }
}

// ---------------------------------------------------------------- запись: добавление, правка, удаление

export interface ServerEquipmentInput {
  code: string;
  name: string;
  type: string;
  zone: string;
  /** Код ассета; null — модель по умолчанию для типа */
  asset: string | null;
}

/** Добавить оборудование и сразу открыть расстановку. Возвращает текст ошибки или null */
export async function addServerEquipment(input: ServerEquipmentInput): Promise<string | null> {
  const zone = useServer.getState().zones.find((z) => z.code === input.zone);
  if (!zone) return 'Выберите зону';
  // Новое оборудование ставим в центр зоны, дальше администратор перетащит его на место
  const start = { pos_x: round2((zone.size_x ?? 0) / 2), pos_y: 0, pos_z: round2((zone.size_z ?? 0) / 2), rotation_deg: 0 };
  try {
    const item = await api.createEquipment({ ...input, ...start });
    addFromPlan(item, zone);
    rememberType(item.type);
    publishLive();
    void logJournalEvent(item.code, `Добавлено оборудование: ${item.name}`);
    selectEquipment(item.code);
    setPlaceMode(true);
    toast(`${item.name} добавлено. Перетащите его на место`);
    return null;
  } catch (e) {
    return (e as ApiError).message;
  }
}

/** Правка данных: на сервер уходят только изменённые поля */
export async function updateServerEquipment(id: EquipmentId, patch: Partial<Pick<ServerEquipmentInput, 'name' | 'type' | 'asset'>>): Promise<string | null> {
  const zone = zoneOf(id);
  if (!zone) return 'Оборудование не найдено';
  if (!Object.keys(patch).length) return null;
  try {
    const item = await api.patchEquipment(id, patch);
    addFromPlan(item, zone);
    rememberType(item.type);
    publishLive();
    void logJournalEvent(id, 'Данные оборудования сохранены на сервере');
    toast('Данные оборудования сохранены');
    return null;
  } catch (e) {
    return (e as ApiError).message;
  }
}

/** Отправить оборудование в архив и убрать его со сцены. История сохраняется */
export async function deleteServerEquipment(id: EquipmentId): Promise<string | null> {
  const name = EQUIPMENT_BY_ID[id]?.name ?? id;
  try {
    await api.deleteEquipment(id);
  } catch (e) {
    const message = (e as ApiError).message;
    toast(`Не удалось отправить в архив: ${message}`, 'error', 8000);
    return message;
  }
  for (const key of Object.keys(liveSensors)) if (key.startsWith(`${id}.`)) delete liveSensors[key];
  delete liveEquipment[id];
  entries.delete(id);
  if (useApp.getState().selected === id) selectEquipment(null, { focus: false });
  removeEquipment(id);
  publishLive();
  void logJournalEvent(id, `Оборудование отправлено в архив: ${name}`);
  toast(`${name} отправлено в архив`);
  return null;
}

function rememberType(type: string) {
  const { types } = useServer.getState();
  if (!types.includes(type)) useServer.setState({ types: [...types, type].sort() });
}

const round2 = (v: number) => Math.round(v * 100) / 100;

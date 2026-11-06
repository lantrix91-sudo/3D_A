import { EQUIPMENT_BY_ID, RETENTION } from '../domain/config';
import type { AppEvent, EquipmentId } from '../domain/types';
import type { Pose } from '../domain/layout';
import { createMemoryRepository } from '../storage/memoryRepository';
import type { Repository } from '../storage/repository';
import { loadSettings, saveSettings, type AppSettings } from '../storage/settings';
import { useApp } from '../store/appStore';
import { newId } from '../utils/id';
import { setWallEditMode } from './walls';
import { initModels } from './models3d';
import { bootServerMode, commitServerPose, deleteServerEquipment } from './serverHub';

/**
 * Общие части интерфейса: лента событий, настройки, выбор оборудования, положение на сцене.
 * Все данные приходят с бэкенда через serverHub.ts, здесь они не создаются.
 */

let repo: Repository;
let settings: AppSettings;
let initialized = false;
let runtimeReady = false;

export function getRepository() {
  return repo;
}

export async function initApp() {
  if (initialized) return;
  initialized = true;
  await bootServerMode();
}

/**
 * Подготовить интерфейс. Вызывается из serverHub после загрузки плана или, если сервер недоступен,
 * с пустыми данными. Хранилище только в памяти: лента событий живёт до перезагрузки.
 * settings.layout очищается: положение берётся только с сервера, а не из браузера.
 */
export function prepareServerRuntime(plantName: string | null) {
  if (!runtimeReady) {
    runtimeReady = true;
    repo = createMemoryRepository();
    initModels(repo);
    settings = loadSettings();
    settings.layout = {};
    setInterval(() => void repo.trimEvents(RETENTION.maxEvents), RETENTION.cleanupEveryMs);
  }
  if (plantName) settings.ui.plantName = plantName;
  if (settings.ui.selected && !EQUIPMENT_BY_ID[settings.ui.selected]) settings.ui.selected = null;
  useApp.setState({ settings, selected: settings.ui.selected });
  document.title = settings.ui.plantName;
}

/**
 * Убрать временное положение после ответа сервера: дальше станок стоит по данным сервера.
 * Если пока шёл запрос станок успели подвинуть ещё раз, новое положение не трогаем.
 */
export function clearPoseOverride(id: EquipmentId, sent: Pose) {
  const cur = settings.layout[id];
  if (cur && (cur.x !== sent.x || cur.z !== sent.z || cur.rotY !== sent.rotY)) return;
  const layout = { ...settings.layout };
  delete layout[id];
  settings.layout = layout;
  useApp.setState({ settings: { ...settings } });
}

/** Записать событие в ленту (смена статуса с сервера) */
export function commitServerEvent(event: AppEvent) {
  return commitEvents([event]);
}

async function commitEvents(events: AppEvent[]) {
  await repo.addEvents(events);
  await refreshEvents();
}

export async function refreshEvents() {
  const events = await repo.listEvents(200);
  useApp.setState({ events });
}

export function selectEquipment(id: EquipmentId | null, opts: { focus?: boolean } = {}) {
  settings.ui.selected = id;
  saveSettings(settings);
  useApp.setState((s) => ({ selected: id, focusNonce: opts.focus === false ? s.focusNonce : s.focusNonce + 1 }));
}

export function requestOverview() {
  useApp.setState((s) => ({ resetViewNonce: s.resetViewNonce + 1 }));
}

export function requestShopView() {
  useApp.setState((s) => ({ shopViewNonce: s.shopViewNonce + 1 }));
}

export function setPlaceMode(on: boolean) {
  if (on) setWallEditMode(false);
  useApp.setState({ placeMode: on });
}

export function getPose(id: EquipmentId): Pose {
  const eq = EQUIPMENT_BY_ID[id];
  return settings?.layout?.[id] ?? (eq ? { x: eq.position[0], z: eq.position[1], rotY: eq.rotationY } : { x: 0, z: 0, rotY: 0 });
}

/** Временное положение оборудования в режиме «Расстановка», пока оно не сохранено на сервере */
export function setPose(id: EquipmentId, pose: Pose, commit = true) {
  settings.layout = { ...settings.layout, [id]: { x: round2(pose.x), z: round2(pose.z), rotY: pose.rotY } };
  if (commit) saveSettings(settings);
  useApp.setState({ settings: { ...settings } });
}

/** Положение уходит на бэкенд через PATCH /api/v1/equipment/<code>/ */
export function commitPose(id: EquipmentId) {
  commitServerPose(id);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function setUi(patch: Partial<AppSettings['ui']>) {
  settings.ui = { ...settings.ui, ...patch };
  saveSettings(settings);
  useApp.setState({ settings: { ...settings } });
}

// ---------------- журналы ----------------

export async function reloadJournals() {
  const [breakdowns, plans, records] = await Promise.all([repo.listBreakdowns(), repo.listPlans(), repo.listRecords()]);
  useApp.setState({ breakdowns, plans, records });
}

export async function logSystemEvent(message: string) {
  await commitEvents([{ id: newId('EVT'), ts: Date.now(), equipmentId: null, type: 'system', severity: 'info', message }]);
}

export async function logJournalEvent(equipmentId: EquipmentId, message: string) {
  await commitEvents([{ id: newId('EVT'), ts: Date.now(), equipmentId, type: 'journal', severity: 'info', message }]);
}

/** Архивирование всегда идёт через сервер: DELETE /api/v1/equipment/<code>/ */
export async function deleteEquipment(id: EquipmentId): Promise<string | null> {
  return deleteServerEquipment(id);
}

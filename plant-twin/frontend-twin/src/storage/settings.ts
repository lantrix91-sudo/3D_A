import type { PoseMap } from '../domain/layout';
import type { EquipmentId } from '../domain/types';

/** Настройки — в localStorage. Любой доступ обёрнут: при запрете хранилища работаем на значениях по умолчанию. */

const KEY = 'bakery-twin.server-settings.v1';

/** Ключи удалённого демо-режима: без очистки выбор симулятора и его настройки остались бы в браузере навсегда */
const LEGACY_KEYS = ['bakery-twin.mode', 'bakery-twin.settings.v2', 'bakery-twin.engine.v1'];

export function clearLegacyStorage() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    /* хранилище недоступно: очищать нечего */
  }
}

export interface AppSettings {
  ui: {
    period: '15m' | '1h' | '24h';
    selected: EquipmentId | null;
    autoFly: boolean;
    wallMode: 'low' | 'full';
    underlay: boolean;
    /** Название цеха в шапке (меняется пользователем) */
    plantName: string;
    /** Сводка показателей свёрнута в одну строку */
    kpiCollapsed: boolean;
    /** Список оборудования свёрнут в узкую полосу */
    listCollapsed: boolean;
    /** Живые экраны на оборудовании */
    screens: ScreenSettings;
    /** Какие панели показаны рядом со сценой (скрытые открываются кнопками над сценой) */
    panels: PanelsShown;
    /** Наложить на чертёж GLB-модель цеха (zone.model_url), например для проверки привязки */
    showHall: boolean;
  };
  /** Временные положения в режиме «Расстановка», пока сервер не подтвердил сохранение */
  layout: PoseMap;
}

export type ScreenContent = 'main' | 'all' | 'state';
export type ScreenSide = 'front' | 'back' | 'left' | 'right';
export type ScreenSize = 's' | 'm' | 'l';
/** Место прикреплённого экрана: сторона, высота (доля высоты модели), сдвиг вбок, м */
export interface ScreenPlace { side: ScreenSide; height: number; x?: number }
export interface PanelsShown { card: boolean; events: boolean; ppr: boolean }
/** Карточка открыта сразу: там основное содержимое — показания и графики. Остальные панели скрыты, чтобы было больше места для 3D-сцены */
export const defaultPanels = (): PanelsShown => ({ card: true, events: false, ppr: false });
export interface ScreenSettings {
  /** Что показывать: главное показание, все показания или только состояние */
  content: ScreenContent;
  /** Показывать название и позицию */
  showTitle: boolean;
  /** Размер экранов, которые двойник крепит к вашим моделям */
  size: ScreenSize;
  /** Место экрана на вашей модели по оборудованию: сторона и высота (доля высоты модели) */
  place: Record<EquipmentId, ScreenPlace>;
  /** Сдвиг собственного экрана модели, м: x — вправо, y — вверх */
  shift: Record<EquipmentId, { x: number; y: number }>;
  /** Размер экрана конкретного оборудования, множитель (1 — как есть) */
  zoom: Record<EquipmentId, number>;
}
export function defaultScreens(): ScreenSettings {
  return { content: 'main', showTitle: true, size: 'm', place: {}, shift: {}, zoom: {} };
}

export const DEFAULT_PLANT_NAME = 'Хлебопекарный цех';
const PLANT_NAME_MAX = 60;

export function defaultSettings(): AppSettings {
  return {
    ui: { period: '15m', selected: null, autoFly: true, wallMode: 'low', underlay: true, plantName: DEFAULT_PLANT_NAME, kpiCollapsed: false, listCollapsed: false, screens: defaultScreens(), panels: defaultPanels(), showHall: false },
    layout: {},
  };
}

export function loadSettings(): AppSettings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ui: (() => {
        const ui = { ...def.ui, ...(s.ui ?? {}) };
        if (typeof ui.plantName !== 'string' || !ui.plantName.trim()) ui.plantName = DEFAULT_PLANT_NAME;
        ui.plantName = ui.plantName.trim().slice(0, PLANT_NAME_MAX);
        ui.kpiCollapsed = !!ui.kpiCollapsed;
        ui.listCollapsed = !!ui.listCollapsed;
        const pn = { ...defaultPanels(), ...(ui.panels ?? {}) };
        ui.panels = { card: !!pn.card, events: !!pn.events, ppr: !!pn.ppr };
        const sc = { ...defaultScreens(), ...(ui.screens ?? {}) };
        if (!['main', 'all', 'state'].includes(sc.content)) sc.content = 'main';
        if (!['s', 'm', 'l'].includes(sc.size)) sc.size = 'm';
        sc.showTitle = sc.showTitle !== false;
        sc.place = sc.place && typeof sc.place === 'object' ? sc.place : {};
        sc.shift = sc.shift && typeof sc.shift === 'object' ? sc.shift : {};
        sc.zoom = sc.zoom && typeof sc.zoom === 'object' ? sc.zoom : {};
        ui.screens = sc;
        return ui;
      })(),
      layout: s.layout && typeof s.layout === 'object' ? s.layout : {},
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — настройки живут до перезагрузки */
  }
}

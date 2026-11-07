import { create } from 'zustand';
import type { DisplayState } from '../domain/types';

/**
 * Режим подписей оборудования на сцене: только отображение, данные не затрагиваются.
 *  - all      — подписи по расстоянию камеры (см. LABEL_*_DISTANCE); закреплённые — всегда;
 *  - problems — только закреплённые: выбранный станок, авария, нет связи;
 *  - off      — подписей нет.
 * Наведение мыши не добавляет подпись, а только раскрывает уже видимую в полную карточку.
 */
export type LabelMode = 'all' | 'problems' | 'off';

// Пороги видимости подписей по расстоянию от камеры до оборудования, м. Подбирать здесь
/** Ближе — подпись видна полностью */
export const LABEL_SHOW_DISTANCE = 25;
/** Дальше — подпись скрыта; между порогами — плавно проявляется */
export const LABEL_HIDE_DISTANCE = 40;

export const LABEL_MODES: LabelMode[] = ['all', 'problems', 'off'];
export const LABEL_MODE_TEXT: Record<LabelMode, string> = { all: 'все', problems: 'проблемные', off: 'выкл' };

const KEY = 'bakery-twin.scene-labels.v1';
const PROBLEM_STATES: ReadonlySet<DisplayState> = new Set<DisplayState>(['alarm', 'no_comm']);

export function isProblemState(st: DisplayState): boolean {
  return PROBLEM_STATES.has(st);
}

export function parseLabelMode(raw: unknown): LabelMode {
  return LABEL_MODES.includes(raw as LabelMode) ? (raw as LabelMode) : 'all';
}

export function nextLabelMode(m: LabelMode): LabelMode {
  return LABEL_MODES[(LABEL_MODES.indexOf(m) + 1) % LABEL_MODES.length];
}

/** Закреплённая подпись видна на любом расстоянии: выбранный станок, авария, нет связи */
export function isLabelPinned(st: DisplayState, selected: boolean): boolean {
  return selected || isProblemState(st);
}

/** Выводить ли подпись в DOM при этом режиме (расстояние учитывается отдельно, в цикле рендера) */
export function isLabelShown(mode: LabelMode, pinned: boolean): boolean {
  if (mode === 'all') return true;
  if (mode === 'problems') return pinned;
  return false;
}

/** Непрозрачность подписи по расстоянию: 1 ближе SHOW, 0 дальше HIDE, между — линейно */
export function labelOpacity(dist: number, pinned: boolean, show = LABEL_SHOW_DISTANCE, hide = LABEL_HIDE_DISTANCE): number {
  if (pinned || dist <= show) return 1;
  if (dist >= hide || hide <= show) return 0;
  return (hide - dist) / (hide - show);
}

function load(): LabelMode {
  try {
    return parseLabelMode(localStorage.getItem(KEY));
  } catch {
    return 'all'; // хранилище недоступно: режим по умолчанию
  }
}

export const useLabelMode = create<{ mode: LabelMode }>(() => ({ mode: load() }));

export function setLabelMode(mode: LabelMode) {
  useLabelMode.setState({ mode });
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* хранилище недоступно: выбор действует до перезагрузки */
  }
}

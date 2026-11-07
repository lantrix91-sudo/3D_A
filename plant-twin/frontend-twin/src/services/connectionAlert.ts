import type { LiveConnection } from '../api/live';

/**
 * Насколько заметно показывать обрыв WebSocket. Короткий обрыв (перезапуск сервера, смена сети)
 * восстанавливается сам за секунды, поэтому первые 60 с интерфейс ничего не меняет.
 */
export const RECONNECTING_AFTER_MS = 60_000;
export const BANNER_AFTER_MS = 120_000;

export type ConnectionChip = 'ok' | 'connecting' | 'reconnecting' | 'lost' | 'forbidden';

export interface ConnectionAlert {
  chip: ConnectionChip;
  /** Широкое предупреждение под шапкой */
  banner: boolean;
  /** С какого момента нет связи (мс) — для подсказки */
  since: number | null;
}

export const CHIP_LABEL: Record<ConnectionChip, string> = {
  ok: 'на связи',
  connecting: 'подключение…',
  reconnecting: 'переподключение…',
  lost: 'нет связи',
  forbidden: 'нет прав',
};

/**
 * connection — состояние сокета, offlineSince — когда пропала связь (или начался первый запуск),
 * everOnline — была ли связь хоть раз: до первого подключения честнее писать «подключение…».
 */
export function connectionAlert(connection: LiveConnection, offlineSince: number | null, everOnline: boolean, now: number): ConnectionAlert {
  if (connection === 'online') return { chip: 'ok', banner: false, since: null };
  // Нет роли — это не обрыв: переподключение не поможет, сообщаем сразу
  if (connection === 'forbidden') return { chip: 'forbidden', banner: true, since: null };
  const since = offlineSince ?? now;
  const lostFor = now - since;
  if (lostFor < RECONNECTING_AFTER_MS) return { chip: everOnline ? 'ok' : 'connecting', banner: false, since };
  if (lostFor < BANNER_AFTER_MS) return { chip: 'reconnecting', banner: false, since };
  return { chip: 'lost', banner: true, since };
}

/** Показывать ли где-либо, что данные могут быть устаревшими */
export function isConnectionDegraded(alert: ConnectionAlert): boolean {
  return alert.chip === 'reconnecting' || alert.chip === 'lost' || alert.chip === 'forbidden';
}

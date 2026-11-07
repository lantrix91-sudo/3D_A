import { describe, expect, it } from 'vitest';
import { connectionAlert, isConnectionDegraded } from './connectionAlert';

const T = 1_000_000;

describe('индикатор связи', () => {
  it('на связи — ничего не показываем', () => {
    expect(connectionAlert('online', null, true, T)).toEqual({ chip: 'ok', banner: false, since: null });
  });

  it('короткий обрыв до 60 с не виден', () => {
    const a = connectionAlert('offline', T, true, T + 59_000);
    expect(a).toMatchObject({ chip: 'ok', banner: false });
    expect(isConnectionDegraded(a)).toBe(false);
  });

  it('повторное подключение после обновления токена тоже не тревожит', () => {
    expect(connectionAlert('connecting', T, true, T + 5_000).chip).toBe('ok');
  });

  it('от 60 до 120 с — жёлтое «переподключение…» без плашки', () => {
    expect(connectionAlert('offline', T, true, T + 60_000)).toMatchObject({ chip: 'reconnecting', banner: false, since: T });
    expect(connectionAlert('offline', T, true, T + 119_999).banner).toBe(false);
  });

  it('дольше 120 с — красное «нет связи» и плашка', () => {
    const a = connectionAlert('offline', T, true, T + 120_000);
    expect(a).toMatchObject({ chip: 'lost', banner: true, since: T });
    expect(isConnectionDegraded(a)).toBe(true);
  });

  it('до первого подключения пишем «подключение…», а не «на связи»', () => {
    expect(connectionAlert('connecting', T, false, T + 3_000).chip).toBe('connecting');
    expect(connectionAlert('offline', T, false, T + 61_000).chip).toBe('reconnecting');
  });

  it('нет роли — сразу, это не обрыв', () => {
    expect(connectionAlert('forbidden', T, true, T)).toMatchObject({ chip: 'forbidden', banner: true });
  });

  it('связь вернулась — всё убирается', () => {
    expect(connectionAlert('online', T, true, T + 500_000)).toMatchObject({ chip: 'ok', banner: false });
  });
});

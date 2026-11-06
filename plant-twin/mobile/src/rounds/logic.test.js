import { expect, it } from 'vitest';
import { chooseRoute, localDay } from './logic.js';

it('remembers the chosen route while it exists and is active', () => {
  const routes = [{ id: 1, is_active: true }, { id: 2, is_active: true }, { id: 3, is_active: false }];
  expect(chooseRoute(routes, 2).id).toBe(2);
  expect(chooseRoute(routes, 3).id).toBe(1); // неактивный — к первому
  expect(chooseRoute(routes, 99).id).toBe(1); // удалили — к первому
  expect(chooseRoute([], 1)).toBeNull();
});

it('inspection day is counted in the plant time zone, not the phone one', () => {
  const seconds = Date.UTC(2026, 9, 31, 19, 30) / 1000; // 00:30 1 ноября в Кызылорде
  expect(localDay(seconds, 'Asia/Qyzylorda')).toBe('2026-11-01');
  expect(localDay(seconds, 'UTC')).toBe('2026-10-31');
});

import { describe, expect, it, vi } from 'vitest';
import { createQueue, inspectionForm, memoryStore, uuid } from './queue.js';
import { mergeRound, overallResult } from '../rounds/logic.js';

const timers = { setInterval: () => 1, clearInterval: () => {} };
const entry = (id, extra = {}) => ({ client_id: id, equipment: 'o1', inspected_at: 100, result: 'ok', answers: [], comment: '', photos: [], ...extra });
const fail = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('uuid', () => {
  it('builds RFC 4122 v4 ids without crypto.randomUUID', () => {
    const id = uuid((bytes) => bytes.fill(255));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(uuid());
  });
});

describe('createQueue', () => {
  it('sends oldest first and removes delivered entries', async () => {
    const store = memoryStore();
    const sent = [];
    const queue = createQueue({ store, timers, isOnline: () => true, send: async (item) => { sent.push(item.client_id); return item; } });
    await store.put(entry('b', { inspected_at: 200 }));
    await store.put(entry('a', { inspected_at: 100 }));
    expect((await queue.sync()).length).toBe(2);
    expect(sent).toEqual(['a', 'b']);
    expect(await queue.list()).toEqual([]);
  });

  it('keeps entries on network errors and retries later', async () => {
    const store = memoryStore();
    const send = vi.fn().mockRejectedValueOnce(fail(0)).mockResolvedValue({});
    const queue = createQueue({ store, timers, isOnline: () => true, send });
    await store.put(entry('a'));
    await store.put(entry('b', { inspected_at: 200 }));
    expect(await queue.sync()).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1); // остальное не отправляем, пока нет связи
    expect((await queue.list()).length).toBe(2);
    await queue.sync();
    expect(await queue.list()).toEqual([]);
  });

  it('marks rejected entries and skips them, removal on request', async () => {
    const store = memoryStore();
    const send = vi.fn().mockRejectedValueOnce(fail(400)).mockResolvedValue({});
    const onChange = vi.fn();
    const queue = createQueue({ store, timers, isOnline: () => true, send, onChange });
    await store.put(entry('bad'));
    await store.put(entry('good', { inspected_at: 200 }));
    await queue.sync();
    const [left] = await queue.list();
    expect(left.client_id).toBe('bad');
    expect(left.error).toBe('HTTP 400');
    await queue.sync();
    expect(send).toHaveBeenCalledTimes(2);
    await queue.remove('bad');
    expect(await queue.list()).toEqual([]);
    expect(onChange).toHaveBeenCalled();
  });

  it('does not send while offline and add returns before delivery', async () => {
    let online = false;
    const send = vi.fn(async () => ({}));
    const queue = createQueue({ store: memoryStore(), timers, isOnline: () => online, send });
    await queue.add(entry('a'));
    expect(send).not.toHaveBeenCalled();
    expect((await queue.list()).length).toBe(1);
    online = true;
    await queue.sync();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('shares one sync run between concurrent callers', async () => {
    const store = memoryStore();
    let release;
    const send = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const queue = createQueue({ store, timers, isOnline: () => true, send });
    await store.put(entry('a'));
    const first = queue.sync();
    const second = queue.sync();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release({});
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

it('builds multipart body with answers JSON and photos', () => {
  const blob = new Blob(['x'], { type: 'image/jpeg' });
  const form = inspectionForm(entry('a', { answers: [{ item: 1, result: 'remark' }], photos: [{ blob, name: 'p.jpg' }] }));
  expect(form.get('client_id')).toBe('a');
  expect(form.get('inspected_at')).toBe('100');
  expect(JSON.parse(form.get('answers'))).toEqual([{ item: 1, result: 'remark' }]);
  expect(form.getAll('photos')[0].name).toBe('p.jpg');
});

it('overall result is the worst answer', () => {
  expect(overallResult([])).toBe('ok');
  expect(overallResult([{ result: 'ok' }, { result: 'remark' }])).toBe('remark');
  expect(overallResult([{ result: 'fault' }, { result: 'remark' }])).toBe('fault');
});

it('merges server round with offline queue', () => {
  const at = new Date('2026-10-31T09:00:00').getTime() / 1000;
  const today = { date: '2026-10-31', stops: [
    { equipment: 'o1', inspection: { result: 'ok', inspected_at: at } },
    { equipment: 'o2', inspection: null },
    { equipment: 'o3', inspection: null },
    { equipment: 'o4', inspection: null },
  ] };
  const pending = [
    entry('p', { equipment: 'o2', inspected_at: at, result: 'fault' }),
    entry('e', { equipment: 'o3', inspected_at: at, error: 'Оборудование не найдено.' }),
    entry('old', { equipment: 'o4', inspected_at: at - 86400 }), // вчерашний осмотр не закрывает сегодняшний
  ];
  const merged = mergeRound(today, pending);
  expect(merged.stops.map((stop) => stop.state)).toEqual(['done', 'pending', 'error', 'todo']);
  expect(merged.stops[1].result).toBe('fault');
  expect([merged.done, merged.total]).toEqual([3, 4]);
});

describe('error handling by status', () => {
  const setupQueue = async (send) => {
    const store = memoryStore();
    const queue = createQueue({ store, timers, isOnline: () => true, send });
    await store.put(entry('first', { inspected_at: 100 }));
    await store.put(entry('second', { inspected_at: 200 }));
    return queue;
  };

  it('401 (session) keeps everything and stops the run', async () => {
    const send = vi.fn().mockRejectedValue(fail(401));
    const queue = await setupQueue(send);
    await queue.sync();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await queue.list()).every((item) => !item.error)).toBe(true);
  });

  it('5xx keeps this inspection for retry but does not block the next one', async () => {
    const send = vi.fn().mockRejectedValueOnce(fail(500)).mockResolvedValue({});
    const queue = await setupQueue(send);
    await queue.sync();
    const left = await queue.list();
    expect(left.map((item) => [item.client_id, item.error])).toEqual([['first', undefined]]);
  });

  it.each([400, 403, 404])('%i marks the inspection as rejected', async (status) => {
    const send = vi.fn().mockRejectedValueOnce(fail(status)).mockResolvedValue({});
    const queue = await setupQueue(send);
    await queue.sync();
    const [left] = await queue.list();
    expect([left.client_id, Boolean(left.error)]).toEqual(['first', true]);
  });
});

describe('expired refresh token (JWT_REFRESH_DAYS ran out)', () => {
  it('keeps inspections unmarked, asks to log in, sends them after the next login', async () => {
    const { createApiClient } = await import('../api/client.js');
    const response = (status, data = {}) => ({ ok: status < 400, status, json: async () => data });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(200, { access: 'a1', refresh: 'r1' })) // вход
      .mockResolvedValueOnce(response(401))                                   // осмотр: access истёк
      .mockResolvedValueOnce(response(401))                                   // refresh тоже истёк
      .mockResolvedValueOnce(response(200, { access: 'a2', refresh: 'r2' })) // повторный вход
      .mockResolvedValue(response(201, { duplicate: false }));                // досылка
    const client = createApiClient('', fetcher, null);
    await client.login('engineer', 'pass');
    const expired = vi.fn();
    client.onSessionExpired(expired);
    const store = memoryStore();
    await store.put(entry('morning', { inspected_at: 100 }));
    await store.put(entry('noon', { inspected_at: 200 }));
    const send = (item) => client.postInspection(inspectionForm(item));

    const first = createQueue({ store, timers, isOnline: () => true, send });
    expect(await first.sync()).toEqual([]);
    expect(expired).toHaveBeenCalledOnce();               // приложение покажет экран входа
    const kept = await first.list();
    expect(kept.map((item) => item.client_id).sort()).toEqual(['morning', 'noon']);
    expect(kept.every((item) => !item.error)).toBe(true); // не «отклонено»
    first.dispose();                                      // выход: очередь закрыта, хранилище не тронуто

    await client.login('engineer', 'pass');
    const second = createQueue({ store, timers, isOnline: () => true, send }); // новый сеанс, та же IndexedDB
    expect((await second.sync()).length).toBe(2);
    expect(await second.list()).toEqual([]);
    expect(fetcher.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer a2');
  });
});

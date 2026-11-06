import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanWallsResponse, WallsData } from '../api/types';
import { createWallsSync, type WallsCacheRecord, type WallsSyncState } from './wallsSync';

const doc = (seq: number): WallsData => ({ walls: [], columns: [], seq });
const reply = (version: number, data: WallsData | null, updated_by: string | null = 'ivan'): PlanWallsResponse => ({ zone: 1, version, data, updated_by, updated_at: 100 });
const httpError = (status: number, message = `ошибка ${status}`) => Object.assign(new Error(message), { status });

function setup(cached: WallsCacheRecord | null = null) {
  const server = { version: 3, data: doc(3) as WallsData | null };
  const store = { record: cached };
  const applied: (WallsData | null)[] = [];
  const states: WallsSyncState[] = [];
  const get = vi.fn(async () => reply(server.version, server.data));
  const put = vi.fn(async (_z: number, base: number, data: WallsData) => {
    if (base !== server.version) throw httpError(409, 'Стены уже изменил ivan');
    server.version += 1;
    server.data = data;
    return reply(server.version, data);
  });
  const sync = createWallsSync({
    get,
    put,
    cache: {
      load: async () => store.record,
      saveServer: async (_z, version, data) => { store.record = { draft: store.record?.draft ?? null, server: { version, data } }; },
      saveDraft: async (_z, draft) => { store.record = { server: store.record?.server ?? null, draft }; },
      clearDraft: async () => { store.record = { server: store.record?.server ?? null, draft: null }; },
    },
    apply: (d) => applied.push(d),
    publish: (s) => states.push(s),
    debounceMs: 1000,
    retryMs: 5000,
  });
  return { sync, server, store, applied, states, get, put };
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('загрузка', () => {
  it('показывает данные сервера и запоминает версию', async () => {
    const { sync, applied, store } = setup();
    await sync.init(1, 'anna', true);
    expect(applied).toEqual([doc(3)]);
    expect(sync.getState()).toMatchObject({ status: 'idle', loaded: true, version: 3, updatedBy: 'ivan' });
    expect(store.record?.server?.version).toBe(3);
  });

  it('на сервере пусто: стены проекта (data = null), версия 0', async () => {
    const { sync, server, applied } = setup();
    server.version = 0;
    server.data = null;
    await sync.init(1, 'anna', true);
    expect(applied).toEqual([null]);
    expect(sync.getState().version).toBe(0);
  });

  it('нет связи и кэша: редактировать нельзя, повторяет загрузку', async () => {
    const { sync, get, applied } = setup();
    get.mockRejectedValueOnce(httpError(0));
    await sync.init(1, 'anna', true);
    expect(sync.getState()).toMatchObject({ status: 'offline', loaded: false });
    expect(applied).toEqual([]);
    await tick(5000);
    expect(sync.getState()).toMatchObject({ status: 'idle', loaded: true });
    expect(applied).toEqual([doc(3)]);
  });

  it('нет связи, есть кэш: показывает кэш', async () => {
    const { sync, get, applied } = setup({ server: { version: 2, data: doc(2) }, draft: null });
    get.mockRejectedValueOnce(httpError(0));
    await sync.init(1, 'anna', true);
    expect(applied).toEqual([doc(2)]);
    expect(sync.getState()).toMatchObject({ status: 'offline', loaded: true, version: 2 });
  });
});

describe('сохранение', () => {
  it('отправляет через секунду после правки и удаляет черновик', async () => {
    const { sync, put, store } = setup();
    await sync.init(1, 'anna', true);
    sync.edited(doc(10));
    expect(store.record?.draft).toMatchObject({ baseVersion: 3, user: 'anna' });
    await tick(999);
    expect(put).not.toHaveBeenCalled();
    await tick(1);
    expect(put).toHaveBeenCalledWith(1, 3, doc(10));
    expect(sync.getState()).toMatchObject({ status: 'saved', version: 4 });
    expect(store.record?.draft).toBeNull();
    expect(store.record?.server).toEqual({ version: 4, data: doc(10) });
  });

  it('серия правок даёт один запрос с последними данными', async () => {
    const { sync, put } = setup();
    await sync.init(1, 'anna', true);
    for (const seq of [10, 11, 12]) {
      sync.edited(doc(seq));
      await tick(400);
    }
    await tick(1000);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(1, 3, doc(12));
  });

  it('правка во время запроса уходит следующей, с новой версией', async () => {
    const { sync, put, server } = setup();
    await sync.init(1, 'anna', true);
    let release: (r: PlanWallsResponse) => void = () => undefined;
    put.mockImplementationOnce(() => new Promise((res) => { release = res; }));
    sync.edited(doc(10));
    await tick(1000);
    sync.edited(doc(11));
    server.version = 4;
    server.data = doc(10);
    release(reply(4, doc(10)));
    await tick(1000);
    expect(put).toHaveBeenLastCalledWith(1, 4, doc(11));
    expect(sync.getState()).toMatchObject({ status: 'saved', version: 5 });
  });

  it('без права записи ничего не отправляет', async () => {
    const { sync, put, store } = setup();
    await sync.init(1, 'anna', false);
    sync.edited(doc(10));
    await tick(5000);
    expect(put).not.toHaveBeenCalled();
    expect(store.record?.draft ?? null).toBeNull();
  });

  it('при потере связи черновик остаётся, запрос повторяется', async () => {
    const { sync, put, store } = setup();
    await sync.init(1, 'anna', true);
    put.mockRejectedValueOnce(httpError(0));
    sync.edited(doc(10));
    await tick(1000);
    expect(sync.getState().status).toBe('offline');
    expect(store.record?.draft?.data).toEqual(doc(10));
    await tick(5000);
    expect(sync.getState()).toMatchObject({ status: 'saved', version: 4 });
    expect(store.record?.draft).toBeNull();
  });

  it('403 не повторяется', async () => {
    const { sync, put } = setup();
    await sync.init(1, 'anna', true);
    put.mockRejectedValueOnce(httpError(403, 'нет прав'));
    sync.edited(doc(10));
    await tick(1000);
    expect(sync.getState()).toMatchObject({ status: 'error', message: 'нет прав' });
    await tick(30000);
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('конфликт', () => {
  async function conflicted() {
    const ctx = setup();
    await ctx.sync.init(1, 'anna', true);
    ctx.server.version = 7; // другой пользователь сохранил раньше
    ctx.server.data = doc(7);
    ctx.sync.edited(doc(10));
    await tick(1000);
    return ctx;
  }

  it('409: ничего не перезаписывает и не повторяет сам', async () => {
    const { sync, put, server, store } = await conflicted();
    expect(sync.getState()).toMatchObject({ status: 'conflict', message: 'Стены уже изменил ivan' });
    await tick(30000);
    expect(put).toHaveBeenCalledTimes(1);
    expect(server.data).toEqual(doc(7));
    expect(store.record?.draft?.data).toEqual(doc(10));
  });

  it('правки во время конфликта только копятся в черновике', async () => {
    const { sync, put, store } = await conflicted();
    sync.edited(doc(11));
    await tick(5000);
    expect(put).toHaveBeenCalledTimes(1);
    expect(store.record?.draft?.data).toEqual(doc(11));
  });

  it('«оставить мой вариант» записывает поверх актуальной версии', async () => {
    const { sync, put, server, store } = await conflicted();
    await sync.keepMine();
    expect(put).toHaveBeenLastCalledWith(1, 7, doc(10));
    expect(server.version).toBe(8);
    expect(sync.getState()).toMatchObject({ status: 'saved', version: 8 });
    expect(store.record?.draft).toBeNull();
  });

  it('«взять с сервера» показывает чужую версию и удаляет черновик', async () => {
    const { sync, put, applied, store } = await conflicted();
    await sync.useServer();
    expect(applied.at(-1)).toEqual(doc(7));
    expect(put).toHaveBeenCalledTimes(1);
    expect(sync.getState()).toMatchObject({ status: 'idle', version: 7 });
    expect(store.record?.draft).toBeNull();
  });
});

describe('черновик после перезагрузки страницы', () => {
  const draft = (baseVersion: number, user = 'anna') => ({ server: { version: baseVersion, data: doc(baseVersion) }, draft: { baseVersion, data: doc(50), user } });

  it('версия та же: правки восстанавливаются и уходят на сервер', async () => {
    const { sync, put, applied } = setup(draft(3));
    await sync.init(1, 'anna', true);
    expect(applied.at(-1)).toEqual(doc(50));
    expect(sync.getState().message).toContain('восстановлены');
    await tick(1000);
    expect(put).toHaveBeenCalledWith(1, 3, doc(50));
    expect(sync.getState().status).toBe('saved');
  });

  it('версия изменилась: конфликт, сервер не трогаем', async () => {
    const { sync, put, applied } = setup(draft(2));
    await sync.init(1, 'anna', true);
    expect(applied.at(-1)).toEqual(doc(50));
    expect(sync.getState().status).toBe('conflict');
    await tick(5000);
    expect(put).not.toHaveBeenCalled();
  });

  it('чужой черновик не отправляется и удаляется', async () => {
    const { sync, put, applied, store } = setup(draft(3, 'boris'));
    await sync.init(1, 'anna', true);
    await tick(5000);
    expect(put).not.toHaveBeenCalled();
    expect(applied.at(-1)).toEqual(doc(3));
    expect(store.record?.draft).toBeNull();
  });

  it('пользователь без права записи не применяет черновик', async () => {
    const { sync, put, applied } = setup(draft(3));
    await sync.init(1, 'anna', false);
    await tick(5000);
    expect(put).not.toHaveBeenCalled();
    expect(applied.at(-1)).toEqual(doc(3));
  });
});

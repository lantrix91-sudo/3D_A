import { expect, it, vi } from 'vitest';
import { createApiClient, REFRESH_KEY } from './client.js';

const response = (status, data = {}) => ({ ok: status < 400, status, json: async () => data });
const storage = () => { const values = new Map(); return { values, getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }; };
const form = () => new FormData();

async function loggedIn(...responses) {
  const fetcher = vi.fn().mockResolvedValueOnce(response(200, { access: 'a1', refresh: 'r1' }));
  for (const item of responses) {
    if (item instanceof Error) fetcher.mockRejectedValueOnce(item); else fetcher.mockResolvedValueOnce(item);
  }
  const saved = storage();
  const client = createApiClient('', fetcher, saved);
  await client.login('engineer', 'pass');
  const expired = vi.fn();
  client.onSessionExpired(expired);
  return { client, fetcher, saved, expired };
}

it('expired access: refreshes the token and resends the inspection once', async () => {
  const { client, fetcher } = await loggedIn(response(401), response(200, { access: 'a2' }), response(201, { duplicate: false }));
  await expect(client.postInspection(form())).resolves.toEqual({ duplicate: false });
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
    '/api/v1/auth/login/', '/api/v1/rounds/inspections/', '/api/v1/auth/refresh/', '/api/v1/rounds/inspections/']);
  expect(fetcher.mock.calls[3][1].headers.Authorization).toBe('Bearer a2');
  expect(fetcher.mock.calls[3][1].headers['Content-Type']).toBeUndefined(); // multipart: границу ставит браузер
});

it('no network during refresh: error status 0, session and refresh token kept', async () => {
  const { client, saved, expired } = await loggedIn(response(401), new TypeError('Failed to fetch'));
  await expect(client.postInspection(form())).rejects.toMatchObject({ status: 0 });
  expect(expired).not.toHaveBeenCalled();
  expect(client.token()).toBe('a1');
  expect(saved.values.size).toBe(1);
});

it('refresh rejected with 400 surfaces as 401 so the queue keeps the inspection', async () => {
  const { client, expired } = await loggedIn(response(401), response(400, { error: { message: 'bad' } }));
  await expect(client.postInspection(form())).rejects.toMatchObject({ status: 401 });
  expect(expired).toHaveBeenCalledOnce();
});

it('server 5xx during refresh keeps the session', async () => {
  const { client, expired } = await loggedIn(response(401), response(502));
  await expect(client.postInspection(form())).rejects.toMatchObject({ status: 401 });
  expect(expired).not.toHaveBeenCalled();
});

it('offline start keeps the session; first request online refreshes the token', async () => {
  const saved = storage();
  saved.setItem(REFRESH_KEY, 'r1');
  const fetcher = vi.fn()
    .mockRejectedValueOnce(new TypeError('Failed to fetch')) // refresh при запуске: сети нет
    .mockResolvedValueOnce(response(401))                    // сеть есть, access ещё нет
    .mockResolvedValueOnce(response(200, { access: 'a2' }))  // refresh
    .mockResolvedValueOnce(response(200, []));
  const client = createApiClient('', fetcher, saved);
  const expired = vi.fn();
  client.onSessionExpired(expired);
  expect(await client.restoreSession()).toBe('offline');
  expect(saved.getItem(REFRESH_KEY)).toBe('r1');
  expect(expired).not.toHaveBeenCalled();
  await expect(client.getRoutes()).resolves.toEqual([]);
  expect(client.token()).toBe('a2');
});

it('without a stored session restoreSession is still false', async () => {
  const client = createApiClient('', vi.fn(), storage());
  expect(await client.restoreSession()).toBe(false);
});

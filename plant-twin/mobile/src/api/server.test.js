import { expect, it, vi } from 'vitest';
import { checkServer, DEFAULT_SERVER, getServer, hasSavedServer, normalizeServer, saveServer } from './server.js';

const storage = () => { const values = new Map(); return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }; };
const response = (status, data) => ({ ok: status < 400, status, json: async () => data });

it('normalizes what an engineer types on the phone', () => {
  expect(normalizeServer('192.168.3.103:8000')).toBe('http://192.168.3.103:8000');
  expect(normalizeServer(' http://192.168.3.103:8000/ ')).toBe('http://192.168.3.103:8000');
  expect(normalizeServer('https://plant.example.com')).toBe('https://plant.example.com');
  expect(normalizeServer('')).toBeNull();
  expect(normalizeServer('http://')).toBeNull();
  expect(normalizeServer('http://host:8000/?x=1')).toBeNull();
});

it('keeps the address on the phone; default is the LAN server', () => {
  const saved = storage();
  expect(getServer(saved)).toBe(DEFAULT_SERVER);
  expect(hasSavedServer(saved)).toBe(false);
  expect(saveServer('10.0.0.5:8000', saved)).toBe('http://10.0.0.5:8000');
  expect(getServer(saved)).toBe('http://10.0.0.5:8000');
  expect(hasSavedServer(saved)).toBe(true);
  expect(() => saveServer('', saved)).toThrow('Неверный адрес');
});

it('connection check calls /health/ and explains failures', async () => {
  const ok = vi.fn().mockResolvedValue(response(200, { status: 'ok' }));
  await expect(checkServer('192.168.3.103:8000', { fetcher: ok })).resolves.toMatchObject({ ok: true });
  expect(ok.mock.calls[0][0]).toBe('http://192.168.3.103:8000/health/');
  const other = vi.fn().mockResolvedValue(response(404, null));
  await expect(checkServer('h:1', { fetcher: other })).resolves.toMatchObject({ ok: false, message: expect.stringContaining('404') });
  const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(checkServer('h:1', { fetcher: down })).resolves.toMatchObject({ ok: false, message: expect.stringContaining('0.0.0.0:8000') });
  const slow = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await expect(checkServer('h:1', { fetcher: slow, timeout: 10 })).resolves.toMatchObject({ message: expect.stringContaining('не ответил') });
  await expect(checkServer('', { fetcher: ok })).resolves.toMatchObject({ ok: false });
});

it('PWA over https warns about an http server instead of a silent mixed-content failure', async () => {
  const fetcher = vi.fn();
  await expect(checkServer('192.168.3.103:8000', { fetcher, pageProtocol: 'https:' }))
    .resolves.toMatchObject({ ok: false, message: expect.stringContaining('https://') });
  expect(fetcher).not.toHaveBeenCalled();
  const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(checkServer('https://api.example.com', { fetcher: down, pageProtocol: 'https:' }))
    .resolves.toMatchObject({ message: expect.stringContaining('интернет') });
});

it('requests go to the saved server', async () => {
  const { createApiClient } = await import('./client.js');
  let server = 'http://a:8000';
  const fetcher = vi.fn().mockResolvedValue(response(200, []));
  const client = createApiClient(() => server, fetcher, storage());
  await client.getRoutes().catch(() => {});
  server = 'http://b:8000';
  await client.getRoutes().catch(() => {});
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['http://a:8000/api/v1/rounds/routes/', 'http://b:8000/api/v1/rounds/routes/']);
});

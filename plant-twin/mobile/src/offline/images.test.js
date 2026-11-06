import { expect, it, vi } from 'vitest';
import { createImageCache, imageKey } from './images.js';
import { memoryStore } from './queue.js';

function setup(responses = {}) {
  const store = memoryStore();
  const fetcher = vi.fn(async (url) => {
    const body = responses[imageKey(url)];
    if (body === undefined) throw new TypeError('Failed to fetch');
    return { ok: true, blob: async () => body };
  });
  let counter = 0;
  const revoked = [];
  const cache = createImageCache({ store, fetcher, createUrl: (blob) => `blob:${blob}#${(counter += 1)}`, revokeUrl: (url) => revoked.push(url) });
  return { store, fetcher, cache, revoked };
}

const signed = (path, signature) => `https://bucket.example/${path}?X-Amz-Signature=${signature}`;

it('signed bucket links of the same file share one copy', async () => {
  expect(imageKey(signed('a.jpg', 1))).toBe(imageKey(signed('a.jpg', 2)));
  const { cache, fetcher } = setup({ 'https://bucket.example/a.jpg': 'A' });
  expect(cache.src('M1', signed('a.jpg', 1))).toBe(signed('a.jpg', 1)); // до загрузки — по сети
  expect(await cache.prefetch([{ equipment: 'M1', image: signed('a.jpg', 1) }])).toBe(true);
  expect(cache.src('M1', signed('a.jpg', 2))).toBe('blob:A#1');
  expect(await cache.prefetch([{ equipment: 'M1', image: signed('a.jpg', 3) }])).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1); // подпись сменилась, файл тот же — не качаем снова
});

it('works offline from the stored copy after a restart', async () => {
  const first = setup({ 'https://bucket.example/a.jpg': 'A' });
  await first.cache.prefetch([{ equipment: 'M1', image: signed('a.jpg', 1) }]);
  // «Перезапуск»: новый кэш в памяти, то же хранилище, сети нет.
  const offline = createImageCache({ store: first.store, fetcher: async () => { throw new TypeError('offline'); }, createUrl: (blob) => `blob:${blob}` });
  await offline.prefetch([{ equipment: 'M1', image: signed('a.jpg', 9) }]);
  expect(offline.src('M1', signed('a.jpg', 9))).toBe('blob:A');
  // Картинку заменили на сервере, а сети нет — показываем старую копию.
  await offline.prefetch([{ equipment: 'M1', image: signed('b.jpg', 1) }]);
  expect(offline.src('M1', signed('b.jpg', 1))).toBe('blob:A');
});

it('replaced and removed images free the old copy', async () => {
  const { cache, store, revoked } = setup({ 'https://bucket.example/a.jpg': 'A', 'https://bucket.example/b.jpg': 'B' });
  await cache.prefetch([{ equipment: 'M1', image: signed('a.jpg', 1) }]);
  await cache.prefetch([{ equipment: 'M1', image: signed('b.jpg', 1) }]);
  expect(cache.src('M1', signed('b.jpg', 2))).toBe('blob:B#2');
  expect(revoked).toEqual(['blob:A#1']);
  await cache.put('M2', signed('own.jpg', 1), 'PHOTO'); // фото, только что снятое на телефоне
  expect(cache.src('M2', signed('own.jpg', 5))).toBe('blob:PHOTO#3');
  await cache.prefetch([{ equipment: 'M1', image: null }]);
  expect(cache.src('M1', null)).toBeNull();
  expect((await store.all()).map((item) => item.client_id)).toEqual(['M2']);
});

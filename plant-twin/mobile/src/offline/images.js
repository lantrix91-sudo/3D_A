// Картинки станков (снимок 3D-модели или фото) на телефоне — чтобы были видны и без сети.
// Хранятся в IndexedDB по коду станка: одна картинка на станок, старая заменяется новой.
// Ссылка на bucket подписана и меняется при каждом запросе, а имя файла — только при замене картинки,
// поэтому сравниваем адрес без query-строки.
import { defaultStore } from './queue.js';

export const imageKey = (url) => (url ? String(url).split('?')[0] : null);

export function createImageCache({
  store = defaultStore('plant-twin-images', 'images'), fetcher = (...args) => fetch(...args),
  createUrl = (blob) => URL.createObjectURL(blob), revokeUrl = (url) => URL.revokeObjectURL(url),
} = {}) {
  const shown = new Map(); // код → { key, url } — адрес для <img> из сохранённой копии

  function remember(code, key, blob) {
    const previous = shown.get(code);
    if (previous?.key === key) return;
    if (previous) revokeUrl(previous.url);
    shown.set(code, { key, url: createUrl(blob) });
  }

  function forget(code) {
    const previous = shown.get(code);
    if (previous) revokeUrl(previous.url);
    shown.delete(code);
  }

  // Ключи записей хранилища — client_id (так устроены хранилища очереди).
  async function stored() {
    try { return new Map((await store.all()).map((item) => [item.client_id, item])); } catch { return new Map(); }
  }

  async function put(code, url, blob) {
    try { await store.put({ client_id: code, key: imageKey(url), blob }); } catch { /* нет места — покажем по сети */ }
    remember(code, imageKey(url), blob);
  }

  return {
    // Для <img>: копия с телефона, а если её ещё нет — адрес сервера (сработает при связи).
    // Копия может быть старее (картинку заменили, а сети нет) — это лучше пустого места; prefetch её обновит.
    src(code, url) {
      if (!url) return null;
      return shown.get(code)?.url || url;
    },
    put,
    // Скачивает новые и изменившиеся картинки шагов маршрута. Без сети — остаются старые копии.
    async prefetch(stops) {
      const saved = await stored();
      let changed = false;
      for (const { equipment: code, image } of stops) {
        const key = imageKey(image);
        const copy = saved.get(code);
        if (!key) {
          if (copy) { try { await store.delete(code); } catch { /* ничего */ } }
          if (shown.has(code)) { forget(code); changed = true; }
          continue;
        }
        if (copy?.key === key) {
          if (shown.get(code)?.key !== key) { remember(code, key, copy.blob); changed = true; }
          continue;
        }
        try {
          const response = await fetcher(image);
          if (!response.ok) throw new Error(String(response.status));
          await put(code, image, await response.blob());
          changed = true;
        } catch {
          // Нет сети или bucket не отдал файл: старая копия лучше, чем ничего.
          if (copy && !shown.has(code)) { remember(code, copy.key, copy.blob); changed = true; }
        }
      }
      return changed;
    },
    async clear() {
      for (const code of [...shown.keys()]) forget(code);
      const saved = await stored();
      for (const code of saved.keys()) { try { await store.delete(code); } catch { /* ничего */ } }
    },
  };
}

// Черновик осмотра, который ещё не сохранён: ответы, комментарий и фото.
// Хранится в IndexedDB, чтобы пережить выгрузку приложения системой, пока открыта камера,
// или случайное закрытие. Черновик один — осмотр заполняется по одному станку.
import { defaultStore } from './queue.js';

const KEY = 'current';

export function createDrafts(store = defaultStore('plant-twin-draft', 'drafts')) {
  return {
    async get() {
      try { return (await store.all()).find((item) => item.client_id === KEY) || null; } catch { return null; }
    },
    async save(draft) {
      try { await store.put({ ...draft, client_id: KEY, saved_at: Date.now() / 1000 }); } catch { /* без хранилища черновик живёт только в памяти */ }
    },
    async clear() {
      try { await store.delete(KEY); } catch { /* нечего удалять */ }
    },
    // Фото, пришедшее после перезапуска приложения, добавляется к черновику.
    async addPhotos(photos, max) {
      const draft = await this.get();
      if (!draft || !photos.length) return null;
      const next = { ...draft, photos: [...(draft.photos || []), ...photos].slice(0, max) };
      await this.save(next);
      return next;
    },
  };
}

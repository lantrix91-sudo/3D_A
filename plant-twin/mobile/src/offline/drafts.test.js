import { expect, it } from 'vitest';
import { createDrafts } from './drafts.js';
import { memoryStore } from './queue.js';

it('keeps one unsaved inspection and adds photos that arrive after a restart', async () => {
  const drafts = createDrafts(memoryStore());
  expect(await drafts.get()).toBeNull();
  expect(await drafts.addPhotos([{ name: 'x.jpg' }], 5)).toBeNull(); // без черновика фото некуда деть
  await drafts.save({ equipment: 'Owen-1', comment: 'дверь', photos: [{ name: 'a.jpg' }] });
  const draft = await drafts.addPhotos([{ name: 'b.jpg' }, { name: 'c.jpg' }], 2);
  expect(draft.photos.map((photo) => photo.name)).toEqual(['a.jpg', 'b.jpg']);
  expect((await drafts.get()).comment).toBe('дверь');
  await drafts.clear();
  expect(await drafts.get()).toBeNull();
});

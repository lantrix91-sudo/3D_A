// Фото к осмотру. В APK — плагин @capacitor/camera: родная камера Android, уменьшение до 1600 px
// и поворот по ориентации делает сам телефон (быстро и без нехватки памяти в WebView).
// В браузере и PWA — обычный <input type="file" capture> и сжатие из offline/photos.js.
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { compressImage } from './offline/photos.js';

export const isNative = () => Capacitor.isNativePlatform();
const SIZE = { quality: 80, targetWidth: 1600, targetHeight: 1600 };
// Пользователь закрыл камеру или галерею, ничего не выбрав, — это не ошибка.
const cancelled = (error) => /cancel/i.test(`${error?.message || ''} ${error?.code || ''}`);

// Результат плагина (MediaResult) → { blob, name } — тот же формат, что хранит офлайн-очередь.
export async function mediaToPhoto(media, index = 0) {
  const response = await fetch(media.webPath);
  return { blob: await response.blob(), name: `photo-${Date.now()}-${index}.jpg` };
}

// Браузер и PWA (в том числе Safari на iPhone): capture="environment" сразу открывает заднюю камеру.
// Поле кладём в документ: Safari может не прислать change для поля, которого нет на странице.
function pickFiles(capture) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    if (capture) input.capture = 'environment'; else input.multiple = true;
    const done = (files) => { input.remove(); resolve(files); };
    input.onchange = () => done([...input.files]);
    input.oncancel = () => done([]);
    document.body.append(input);
    input.click();
  });
}

export async function takePhoto() {
  if (!isNative()) return Promise.all((await pickFiles(true)).map((file) => compressImage(file)));
  try {
    return [await mediaToPhoto(await Camera.takePhoto({ ...SIZE, correctOrientation: true }))];
  } catch (error) {
    if (cancelled(error)) return [];
    throw error;
  }
}

export async function pickPhotos(limit) {
  if (!isNative()) return Promise.all((await pickFiles(false)).slice(0, limit).map((file) => compressImage(file)));
  try {
    const { results } = await Camera.chooseFromGallery({ ...SIZE, allowMultipleSelection: limit > 1, limit });
    return Promise.all(results.slice(0, limit).map(mediaToPhoto));
  } catch (error) {
    if (cancelled(error)) return [];
    throw error;
  }
}

// Android мог выгрузить приложение, пока открыта камера (мало памяти). После перезапуска плагин App
// присылает событие appRestoredResult с фото — превращаем его в те же { blob, name }.
export async function restoredPhotos(event) {
  if (event?.pluginId !== 'Camera' || !event.success || !event.data) return [];
  const items = event.data.results || [event.data];
  return Promise.all(items.filter((item) => item?.webPath).map(mediaToPhoto));
}

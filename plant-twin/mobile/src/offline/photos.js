// Фото с телефона 4–8 МБ: уменьшаем до 1600 px JPEG, чтобы очередь и отправка по слабой сети были быстрыми.
// Если браузер не умеет декодировать формат (HEIC в Chrome), отправляем оригинал.
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bitmap.close?.(); return { blob: file, name: file.name }; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name };
    return { blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg` };
  } catch {
    return { blob: file, name: file.name };
  }
}

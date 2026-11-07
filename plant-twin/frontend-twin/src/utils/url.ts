/**
 * Ссылки на файлы в bucket подписаны: в параметрах запроса лежит подпись доступа.
 * Такая ссылка нужна только для загрузки файла, в интерфейсе и журналах показываем имя файла.
 */
export function fileNameFromUrl(url: string, fallback = ''): string {
  const path = url.split(/[?#]/, 1)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  const name = path.split('/').pop() ?? '';
  if (!name) return fallback;
  try {
    return decodeURIComponent(name);
  } catch {
    return name; // В имени есть символ %, который не является кодом
  }
}

/** Заменяет все ссылки в тексте именами файлов: загрузчик подставляет полный адрес в сообщение об ошибке */
export function hideUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'`<>)]+/g, (url) => fileNameFromUrl(url, 'файл'));
}

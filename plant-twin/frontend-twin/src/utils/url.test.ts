import { describe, expect, it } from 'vitest';
import { fileNameFromUrl, hideUrls } from './url';

const SIGNED = 'https://storage.example.com/bucket/assets/miwe-roll-in-e-plus.glb?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123';

describe('fileNameFromUrl', () => {
  it('убирает параметры presigned-ссылки', () => {
    expect(fileNameFromUrl(SIGNED)).toBe('miwe-roll-in-e-plus.glb');
  });

  it('понимает относительные пути и декодирует имя', () => {
    expect(fileNameFromUrl('/media/assets/%D0%BF%D0%B5%D1%87%D1%8C.glb?v=1')).toBe('печь.glb');
    expect(fileNameFromUrl('oven.glb#node')).toBe('oven.glb');
  });

  it('не падает на битом кодировании и возвращает запасное имя, если имени нет', () => {
    expect(fileNameFromUrl('/media/100%.glb')).toBe('100%.glb');
    expect(fileNameFromUrl('https://example.com/', 'oven')).toBe('oven');
    expect(fileNameFromUrl('', 'oven')).toBe('oven');
  });
});

describe('hideUrls', () => {
  it('заменяет ссылку в сообщении об ошибке именем файла', () => {
    const text = hideUrls(`Error: fetch for "${SIGNED}" responded with 403: Forbidden`);
    expect(text).toBe('Error: fetch for "miwe-roll-in-e-plus.glb" responded with 403: Forbidden');
    expect(text).not.toContain('X-Amz');
  });

  it('текст без ссылок не меняется', () => {
    expect(hideUrls('Файл не является GLB')).toBe('Файл не является GLB');
  });
});

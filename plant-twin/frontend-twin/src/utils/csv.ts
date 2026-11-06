/**
 * CSV для Excel с кириллицей: UTF-8 с BOM, разделитель «;», CRLF.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

type DownloadsNs = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

/**
 * Внутри опубликованного артефакта claude.ai обычные ссылки на скачивание заблокированы,
 * поэтому, если среда предоставляет возможность `downloads`, используем её. В обычном браузере —
 * стандартная загрузка через Blob.
 */
let downloadsNs: Promise<DownloadsNs | null> | null = null;
function hostDownloads(): Promise<DownloadsNs | null> {
  if (!downloadsNs) {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    downloadsNs = host?.use
      ? (host.use('downloads') as Promise<DownloadsNs | null>).catch(() => null)
      : Promise.resolve(null);
  }
  return downloadsNs;
}

export async function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8'): Promise<boolean> {
  const blob = new Blob([content], { type: mime });
  const ns = await hostDownloads();
  if (ns) {
    try {
      await ns.save({ filename, data: blob });
      return true;
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return false;
      // иначе пробуем обычный способ
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

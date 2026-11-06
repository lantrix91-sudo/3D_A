import { useEffect, useState } from 'react';

/** Текущая тема: явный data-theme на <html> либо системная настройка */
export function useThemeMode(): 'dark' | 'light' {
  const get = (): 'dark' | 'light' => {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };
  const [mode, setMode] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const upd = () => setMode(get());
    mq?.addEventListener?.('change', upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener?.('change', upd);
      mo.disconnect();
    };
  }, []);
  return mode;
}

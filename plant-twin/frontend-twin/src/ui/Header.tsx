import { useState } from 'react';
import { signOut } from '../services/serverHub';
import { useServer } from '../store/serverStore';
import { DEFAULT_PLANT_NAME } from '../storage/settings';
import { useApp, useClock } from '../store/appStore';
import { formatDate, formatTimeSec } from '../utils/time';
import { CHIP_LABEL } from '../services/connectionAlert';
import { useConnectionAlert } from './common/useConnectionAlert';

const THEME_KEY = 'bakery-twin.theme';
type ThemeChoice = 'system' | 'dark' | 'light';

function applyTheme(t: ThemeChoice) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
export function initTheme() {
  try {
    const t = (localStorage.getItem(THEME_KEY) as ThemeChoice) || 'system';
    applyTheme(t);
  } catch {
    /* ignore */
  }
}

export function Header() {
  const now = useClock((s) => s.now);
  const plantName = useApp((s) => s.settings?.ui.plantName ?? DEFAULT_PLANT_NAME);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as ThemeChoice) || 'system';
    } catch {
      return 'system';
    }
  });

  const link = useConnectionAlert();
  const username = useServer((s) => s.username);
  const canEdit = useServer((s) => s.canEdit);
  const canEditWalls = useServer((s) => s.canEditWalls);

  const cycleTheme = () => {
    const next: ThemeChoice = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          {/* Название завода приходит из плана и меняется в админке Django */}
          <div className="plant-title">
            <h1>{plantName}</h1>
          </div>
          <p>Цифровой двойник</p>
        </div>
      </div>

      {/* Состояние соединения с сервером и пользователь */}
      <div className="server-panel" aria-label="Подключение к серверу">
        {/* Ширина постоянная: смена текста не сдвигает шапку. Короткий обрыв (до 60 с) не показывается */}
        <span className={`server-status is-${link.chip}`} role="status"
          title={link.since && link.chip !== 'ok' ? `Соединение WebSocket /ws/v1/live/ · нет связи с ${formatTimeSec(link.since)}` : 'Соединение WebSocket /ws/v1/live/'}>
          Сервер: {CHIP_LABEL[link.chip]}
        </span>
        {/* Пока сервер недоступен, имя пользователя неизвестно */}
        {username && (
          <span className="user-chip" title={canEdit ? 'Можно менять расстановку, состав оборудования и стены' : canEditWalls ? 'Можно менять стены' : 'Только просмотр'}>
            {username} · {canEdit ? 'админ' : canEditWalls ? 'инженер' : 'просмотр'}
          </span>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>Выйти</button>
      </div>

      <div className="topbar__right">
        <div className="clock" title="Время цеха, Asia/Almaty">
          <b>{formatTimeSec(now)}</b>
          <span>{formatDate(now)} · Алматы</span>
        </div>
        <div className="menu">
          <button type="button" className="btn btn--ghost" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            ☰ Меню
          </button>
          {menu && (
            <div className="menu__list" role="menu" onMouseLeave={() => setMenu(false)}>
              <button role="menuitem" type="button" onClick={() => { cycleTheme(); }}>
                Тема: {theme === 'system' ? 'как в системе' : theme === 'dark' ? 'тёмная' : 'светлая'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

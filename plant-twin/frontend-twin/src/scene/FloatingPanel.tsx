import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Плавающая панель над 3D-сценой: перетаскивается за заголовок, сворачивается до одной строки,
 * редкие действия спрятаны в раздел «Ещё». Положение и свёрнутость запоминаются в этом браузере.
 * Двойной щелчок по заголовку возвращает панель на место по умолчанию (левый верхний угол сцены).
 */
interface Props {
  id: string;
  title: string;
  className: string;
  ariaLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  more?: ReactNode;
}

interface Saved {
  x: number | null;
  y: number | null;
  collapsed: boolean;
}

const KEY = (id: string) => `bakery-twin.panel.${id}`;
const DEFAULT: Saved = { x: null, y: null, collapsed: false };

function load(id: string): Saved {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<Saved>;
    return { x: typeof v.x === 'number' ? v.x : null, y: typeof v.y === 'number' ? v.y : null, collapsed: !!v.collapsed };
  } catch {
    return DEFAULT;
  }
}

function save(id: string, v: Saved) {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(v));
  } catch {
    /* хранилище недоступно — положение просто не запомнится */
  }
}

const MARGIN = 6;

export function FloatingPanel({ id, title, className, ariaLabel, actions, children, more }: Props) {
  const [st, setSt] = useState<Saved>(() => load(id));
  const [moreOpen, setMoreOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number; pid: number } | null>(null);

  const update = useCallback((patch: Partial<Saved>) => {
    setSt((cur) => {
      const next = { ...cur, ...patch };
      save(id, next);
      return next;
    });
  }, [id]);

  /** Удержать панель в пределах сцены */
  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return { x, y };
    const maxX = Math.max(MARGIN, parent.clientWidth - el.offsetWidth - MARGIN);
    const maxY = Math.max(MARGIN, parent.clientHeight - 40);
    return { x: Math.min(Math.max(MARGIN, x), maxX), y: Math.min(Math.max(MARGIN, y), maxY) };
  }, []);

  // после смены размера сцены (поворот планшета, окно) панель не должна уехать за край
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setSt((cur) => {
        if (cur.x == null || cur.y == null) return cur;
        const c = clamp(cur.x, cur.y);
        return c.x === cur.x && c.y === cur.y ? cur : { ...cur, ...c };
      });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a')) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, pid: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!d || d.pid !== e.pointerId || !el || !parent) return;
    const pr = parent.getBoundingClientRect();
    const c = clamp(e.clientX - pr.left - d.dx, e.clientY - pr.top - d.dy);
    setSt((cur) => ({ ...cur, ...c }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pid !== e.pointerId) return;
    drag.current = null;
    ref.current?.classList.remove('is-dragging');
    setSt((cur) => {
      save(id, cur);
      return cur;
    });
  };

  // клавиатура: стрелки на заголовке двигают панель на 20 px
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[e.key];
    if (!step || e.target !== e.currentTarget) return;
    e.preventDefault();
    const el = ref.current;
    const x0 = st.x ?? el?.offsetLeft ?? 10;
    const y0 = st.y ?? el?.offsetTop ?? 30;
    update(clamp(x0 + step[0], y0 + step[1]));
  };

  useEffect(() => {
    if (st.collapsed) setMoreOpen(false);
  }, [st.collapsed]);

  const style = st.x != null && st.y != null ? { left: st.x, top: st.y } : undefined;

  return (
    <div ref={ref} className={`fpanel ${className}${st.collapsed ? ' is-collapsed' : ''}`} style={style} role="region" aria-label={ariaLabel}>
      <div
        className="fpanel__head"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          update({ x: null, y: null });
        }}
        onKeyDown={onKeyDown}
        tabIndex={0}
        title="Перетащите, чтобы передвинуть панель. Двойной щелчок — вернуть на место"
        aria-label={`${title}: перетащите или двигайте стрелками`}
      >
        <span className="fpanel__grip" aria-hidden>⠿</span>
        <b>{title}</b>
        <button
          type="button"
          className="fpanel__icon"
          onClick={() => update({ collapsed: !st.collapsed })}
          aria-expanded={!st.collapsed}
          title={st.collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          aria-label={st.collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        >
          {st.collapsed ? '▾' : '▴'}
        </button>
        {actions}
      </div>
      {!st.collapsed && (
        <div className="fpanel__body">
          {children}
          {more && (
            <>
              <button type="button" className="fpanel__more-btn" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
                {moreOpen ? 'Скрыть' : 'Ещё'} {moreOpen ? '▴' : '▾'}
              </button>
              {moreOpen && <div className="fpanel__more">{more}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

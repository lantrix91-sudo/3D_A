import type { DisplayState } from '../../domain/types';
import { STATE_META } from './stateMeta';

export function StatePill({ state, size = 'md' }: { state: DisplayState; size?: 'sm' | 'md' | 'lg' }) {
  const m = STATE_META[state];
  return (
    <span className={`pill pill--${size} pill--${state}`} style={{ ['--c' as string]: `var(${m.cssVar})` }}>
      <i aria-hidden="true">{m.glyph}</i>
      {m.label}
    </span>
  );
}

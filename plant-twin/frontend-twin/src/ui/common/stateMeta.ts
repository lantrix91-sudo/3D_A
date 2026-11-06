import type { AlarmLevel, DisplayState } from '../../domain/types';

/** Подписи и цвета состояний. Цвет всегда дублируется текстом и формой значка. */
export const STATE_META: Record<DisplayState, { label: string; color: string; cssVar: string; glyph: string }> = {
  running: { label: 'Работает', color: '#3fb67e', cssVar: '--st-run', glyph: '●' },
  stopped: { label: 'Остановлено', color: '#8a959e', cssVar: '--st-stop', glyph: '■' },
  warning: { label: 'Предупреждение', color: '#f0b429', cssVar: '--st-warn', glyph: '▲' },
  alarm: { label: 'Авария', color: '#ef4444', cssVar: '--st-alarm', glyph: '◆' },
  maintenance: { label: 'На обслуживании', color: '#8b7cf6', cssVar: '--st-maint', glyph: '⚒' },
  no_comm: { label: 'Нет связи', color: '#d65db1', cssVar: '--st-nocomm', glyph: '⊘' },
  no_sensors: { label: 'Без датчиков', color: '#6f8796', cssVar: '--st-none', glyph: '○' },
  // Только режим сервера: Equipment.condition = decommissioned
  decommissioned: { label: 'Выведено из работы', color: '#4f565c', cssVar: '--st-none', glyph: '✕' },
};

export const LEVEL_META: Record<AlarmLevel, { label: string; cssVar: string }> = {
  normal: { label: 'Норма', cssVar: '--fg-muted' },
  warning: { label: 'Предупреждение', cssVar: '--st-warn' },
  alarm: { label: 'Авария', cssVar: '--st-alarm' },
};

export const ACCENT_3D = '#7aa7d1';

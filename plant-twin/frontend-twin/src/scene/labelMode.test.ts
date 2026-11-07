import { describe, expect, it } from 'vitest';
import {
  LABEL_HIDE_DISTANCE,
  LABEL_SHOW_DISTANCE,
  isLabelPinned,
  isLabelShown,
  isProblemState,
  labelOpacity,
  nextLabelMode,
  parseLabelMode,
} from './labelMode';

describe('режим подписей на сцене', () => {
  it('неизвестное или пустое значение — «все»', () => {
    expect(parseLabelMode(null)).toBe('all');
    expect(parseLabelMode('xxx')).toBe('all');
    expect(parseLabelMode('problems')).toBe('problems');
    expect(parseLabelMode('off')).toBe('off');
  });

  it('кнопка перебирает все → проблемные → выкл → все', () => {
    expect(nextLabelMode('all')).toBe('problems');
    expect(nextLabelMode('problems')).toBe('off');
    expect(nextLabelMode('off')).toBe('all');
  });

  it('проблемные — только авария и нет связи', () => {
    expect(isProblemState('alarm')).toBe(true);
    expect(isProblemState('no_comm')).toBe(true);
    expect(isProblemState('running')).toBe(false);
    expect(isProblemState('no_sensors')).toBe(false);
    expect(isProblemState('warning')).toBe(false);
  });

  it('закреплены выбранный станок, авария и нет связи', () => {
    expect(isLabelPinned('running', true)).toBe(true);
    expect(isLabelPinned('alarm', false)).toBe(true);
    expect(isLabelPinned('no_comm', false)).toBe(true);
    expect(isLabelPinned('running', false)).toBe(false);
    expect(isLabelPinned('warning', false)).toBe(false);
  });

  it('видимость по режиму', () => {
    expect(isLabelShown('all', false)).toBe(true);
    expect(isLabelShown('all', true)).toBe(true);
    expect(isLabelShown('problems', false)).toBe(false);
    expect(isLabelShown('problems', true)).toBe(true);
    expect(isLabelShown('off', true)).toBe(false);
    expect(isLabelShown('off', false)).toBe(false);
  });

  it('прозрачность по расстоянию', () => {
    expect(labelOpacity(10, false)).toBe(1);
    expect(labelOpacity(LABEL_SHOW_DISTANCE, false)).toBe(1);
    expect(labelOpacity(LABEL_HIDE_DISTANCE, false)).toBe(0);
    expect(labelOpacity(100, false)).toBe(0);
    const mid = (LABEL_SHOW_DISTANCE + LABEL_HIDE_DISTANCE) / 2;
    expect(labelOpacity(mid, false)).toBeCloseTo(0.5);
  });

  it('закреплённая подпись видна на любом расстоянии', () => {
    expect(labelOpacity(500, true)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import type { LiveEntry, PlanEquipment, PlanZone } from '../api/types';
import { clampToZone, computeLive, equipmentFromPlan, planToWorld, sameSignals, sensorsFromSignals, statusToDisplay, worldToPlan } from './planMapper';

const plainZone = { offset: { x: 0, z: 0 }, rotation_deg: 0 };

describe('координаты', () => {
  it('север плана — это минус Z в сцене (docs/COORDINATES.md)', () => {
    const p = planToWorld(plainZone, 32.5, 60.85, 270);
    expect(p.x).toBeCloseTo(32.5);
    expect(p.z).toBeCloseTo(-60.85);
    expect(p.rotY).toBeCloseTo((270 * Math.PI) / 180);
  });

  it('сцена → план → сцена даёт то же самое, в том числе в смещённой и повёрнутой зоне', () => {
    for (const zone of [plainZone, { offset: { x: 5, z: -3 }, rotation_deg: 30 }]) {
      const world = planToWorld(zone, 12.34, 56.78, 90);
      expect(worldToPlan(zone, world)).toEqual({ pos_x: 12.34, pos_z: 56.78, rotation_deg: 90 });
    }
  });

  it('угол для сервера всегда в диапазоне [0, 360)', () => {
    expect(worldToPlan(plainZone, { x: 0, z: 0, rotY: -Math.PI / 2 }).rotation_deg).toBe(270);
    expect(worldToPlan(plainZone, { x: 0, z: 0, rotY: 2 * Math.PI - 1e-6 }).rotation_deg).toBe(0);
  });

  it('оборудование не выходит за границы зоны', () => {
    const zone = { ...plainZone, size_x: 10, size_z: 20 };
    const p = clampToZone(zone, { x: 15, z: 5, rotY: 1 }); // z > 0 в сцене — это юг от начала плана
    expect(worldToPlan(zone, p)).toMatchObject({ pos_x: 10, pos_z: 0 });
    expect(p.rotY).toBe(1);
  });
});

describe('привязка зоны к чертежу двойника', () => {
  // Измеренные значения Koktal_1: нуль зоны на чертеже — 0,68 м к западу от оси 1 и 6,07 м к югу от оси А
  const koktal = { offset: { x: 0, z: 0 }, rotation_deg: 0, plan_offset: { x: -0.68, z: -6.07 }, plan_rotation_deg: 0 };

  it('позиция из базы попадает на чертёж со смещением зоны', () => {
    const p = planToWorld(koktal, 32.5, 60.85, 270);
    expect(p.x).toBeCloseTo(31.82);
    expect(p.z).toBeCloseTo(-54.78);
    expect(p.rotY).toBeCloseTo((270 * Math.PI) / 180);
  });

  it('при сохранении на сервер уходят те же координаты, что были в базе', () => {
    expect(worldToPlan(koktal, planToWorld(koktal, 32.5, 60.85, 270))).toEqual({ pos_x: 32.5, pos_z: 60.85, rotation_deg: 270 });
  });

  it('цепочка с поворотом зоны и поворотом чертежа обратима', () => {
    const zone = { offset: { x: 5, z: -3 }, rotation_deg: 30, plan_offset: { x: -2.5, z: 7 }, plan_rotation_deg: 15 };
    const world = planToWorld(zone, 12.34, 56.78, 90);
    expect(world.rotY).toBeCloseTo((135 * Math.PI) / 180);
    expect(worldToPlan(zone, world)).toEqual({ pos_x: 12.34, pos_z: 56.78, rotation_deg: 90 });
  });

  it('поворот на 90° переводит север зоны на запад чертежа', () => {
    const zone = { offset: { x: 0, z: 0 }, rotation_deg: 0, plan_offset: { x: 0, z: 0 }, plan_rotation_deg: 90 };
    const p = planToWorld(zone, 0, 10, 0);
    expect(p.x).toBeCloseTo(-10);
    expect(p.z).toBeCloseTo(0);
  });

  it('граница зоны считается в координатах сервера, а не чертежа', () => {
    const zone = { ...koktal, size_x: 89.14, size_z: 77.94 };
    const inside = planToWorld(zone, 0, 0, 0);
    const out = clampToZone(zone, { x: inside.x - 5, z: inside.z + 5, rotY: 0 });
    expect(worldToPlan(zone, out)).toMatchObject({ pos_x: 0, pos_z: 0 });
  });
});

describe('статусы', () => {
  it('таблица соответствия из README', () => {
    expect(statusToDisplay('run', true)).toBe('running');
    expect(statusToDisplay('stop', true)).toBe('stopped');
    expect(statusToDisplay('alarm', true)).toBe('alarm');
    expect(statusToDisplay('offline', true)).toBe('no_comm');
    expect(statusToDisplay('unknown', true)).toBe('no_comm');
    expect(statusToDisplay('unknown', false)).toBe('no_sensors');
  });
});

const entry = (over: Partial<LiveEntry> = {}): LiveEntry => ({
  equipment: 'oven-1',
  status: 'run',
  ts: 1000, last_seen: 1000, offline_seconds: 120,
  values: { state: 'run', temperature: 212.4, power: 41.7 },
  faults: [],
  signals: {
    state: { name: 'Состояние', unit: '', kind: 'state' },
    temperature: { name: 'Температура', unit: '°C', kind: 'number' },
    power: { name: 'Мощность', unit: 'кВт', kind: 'number' },
  },
  ...over,
});

describe('живые данные', () => {
  it('использует таймаут типа с сервера, а не прежние 120 секунд', () => {
    expect(computeLive(entry({ offline_seconds: 300 }), true, 1181_000).equipment.serverState).toBe('running');
    expect(computeLive(entry({ offline_seconds: 30 }), true, 1031_000).equipment.serverState).toBe('no_comm');
    expect(computeLive(entry({ offline_seconds: 30 }), true, 1030_000).equipment.serverState).toBe('running');
  });

  it('считает срок от last_seen и не отменяет серверный offline', () => {
    expect(computeLive(entry({ ts: 9999, last_seen: 1000, offline_seconds: 30 }), true, 1031_000).equipment.serverState).toBe('no_comm');
    expect(computeLive(entry({ status: 'offline' }), true, 1000_000).equipment.serverState).toBe('no_comm');
    expect(computeLive(entry({ status: 'unknown', last_seen: 1000, offline_seconds: 30 }), true, 1031_000).equipment.serverState).toBe('no_comm');
  });

  describe('статус unknown при свежих данных (тип без правил статуса)', () => {
    const fridge = (over: Partial<LiveEntry> = {}) => entry({
      equipment: 'Miwe_1', status: 'unknown', offline_seconds: 180,
      values: { t1: 22.4, t2: 28 },
      signals: { t1: { name: 'T1', unit: '°C', kind: 'number' }, t2: { name: 'T2', unit: '°C', kind: 'number' } },
      ...over,
    });

    it('связь есть, значения показываются, работа неизвестна', () => {
      const live = computeLive(fridge(), true, 1009_000);
      expect(live.equipment.serverState).toBe('data_only');
      expect(live.equipment.comm).toBe('ok');
      expect(live.equipment.commSince).toBeNull();
      expect(live.equipment.runState).toBe('unknown');
      expect(live.sensors['Miwe_1.t1']).toMatchObject({ hasData: true, lastValue: 22.4 });
    });

    it('после таймаута — снова «Нет связи» и нет свежих значений', () => {
      const live = computeLive(fridge(), true, 1181_000);
      expect(live.equipment.serverState).toBe('no_comm');
      expect(live.equipment.comm).toBe('lost');
      expect(live.equipment.commSince).toBe(1000_000);
      expect(live.sensors['Miwe_1.t1'].hasData).toBe(false);
    });

    it('без единого пакета — ожидание данных, а не потеря связи', () => {
      const live = computeLive(fridge({ ts: null, last_seen: null, values: {} }), true, 1009_000);
      expect(live.equipment.serverState).toBe('no_comm');
      expect(live.equipment.comm).toBe('unknown');
      expect(live.equipment.commSince).toBeNull();
    });

    it('серверный offline не отменяется, даже если время ещё не вышло', () => {
      const live = computeLive(fridge({ status: 'offline' }), true, 1009_000);
      expect(live.equipment.serverState).toBe('no_comm');
      expect(live.equipment.comm).toBe('lost');
      expect(live.sensors['Miwe_1.t1'].hasData).toBe(false);
    });

    it('без привязанного устройства остаётся «Без датчиков»', () => {
      expect(computeLive(fridge(), false, 1009_000).equipment.serverState).toBe('no_sensors');
    });
  });

  it('показания и статус попадают в формат интерфейса', () => {
    const live = computeLive(entry(), true, 1000_000 + 1000);
    expect(live.equipment.serverState).toBe('running');
    expect(live.equipment.runState).toBe('running');
    expect(live.sensors['oven-1.temperature'].lastValue).toBe(212.4);
    expect(live.sensors['oven-1.state'].text).toBe('run');
  });

  it('неисправный датчик не считается данными', () => {
    const live = computeLive(entry({ faults: ['temperature'] }), true, 1000_000);
    expect(live.sensors['oven-1.temperature'].hasData).toBe(false);
    expect(live.sensors['oven-1.temperature'].fault).toBe(true);
    expect(live.sensors['oven-1.power'].hasData).toBe(true);
  });

  it('устаревшие данные показываются как «Нет связи», последнее значение сохраняется', () => {
    const live = computeLive(entry(), true, 1000_000 + 121_000);
    expect(live.equipment.serverState).toBe('no_comm');
    expect(live.sensors['oven-1.temperature'].hasData).toBe(false);
    expect(live.sensors['oven-1.temperature'].lastValue).toBe(212.4);
  });

  it('набор сигналов сравнивается, чтобы не перерисовывать карточку зря', () => {
    const e = entry();
    const sensors = sensorsFromSignals('oven-1', e.signals);
    expect(sameSignals(sensors, e.signals)).toBe(true);
    expect(sameSignals(sensors, { ...e.signals, door: { name: 'Дверь', unit: '', kind: 'bool' } })).toBe(false);
  });
});

describe('техническое состояние', () => {
  it('ремонт и ТО важнее телеметрии, а связь остаётся видна отдельно', () => {
    const live = computeLive(entry({ condition: 'repair' }), true, 1000_000 + 1000);
    expect(live.equipment.serverState).toBe('maintenance');
    expect(live.equipment.comm).toBe('ok');
    expect(live.equipment.runState).toBe('unknown');
  });

  it('станок без устройства в ремонте — «На обслуживании», а не «Без датчиков»', () => {
    const live = computeLive(entry({ condition: 'maintenance', status: 'unknown', ts: null, last_seen: null }), false, 1000_000);
    expect(live.equipment.serverState).toBe('maintenance');
  });

  it('неисправный станок показывается как авария, выведенный — отдельно', () => {
    expect(computeLive(entry({ condition: 'faulty' }), true, 1000_000).equipment.serverState).toBe('alarm');
    expect(computeLive(entry({ condition: 'decommissioned' }), false, 1000_000).equipment.serverState).toBe('decommissioned');
  });

  it('working и idle ничего не перекрывают', () => {
    expect(computeLive(entry({ condition: 'working' }), true, 1000_000 + 1000).equipment.serverState).toBe('running');
    expect(computeLive(entry({ condition: 'idle', status: 'unknown', ts: null, last_seen: null }), false, 1000_000).equipment.serverState).toBe('no_sensors');
  });
});

describe('оборудование из плана', () => {
  const zone: PlanZone = { ...plainZone, id: 1, code: 'K_1', name: 'Цех', size_x: 89, size_z: 78, model_url: null, model_rotation_deg: 0, plan_offset: { x: 0, z: 0 }, plan_rotation_deg: 0, visible_by_default: true, equipment: [] };
  const item: PlanEquipment = {
    code: 'kemper', name: 'Тестомес', type: 'kemper', zone: 'K_1', key_signals: [],
    asset: { code: 'kemper', url: 'http://localhost/media/k.glb', led_node_name: 'led', rotation_speed_deg_s: 0, animation_node_name: '', size: { x: 1, y: 1, z: 1 } },
    pos: { x: 1.1, y: 0, z: 56.25 }, size: { x: 1, y: 1, z: 1 }, rotation_deg: 180, status: 'unknown', last_seen: null, offline_seconds: 180,
    is_active: true, condition: 'working', has_telemetry: false,
  };

  it('координаты и модель берутся из плана', () => {
    const eq = equipmentFromPlan(item, zone);
    expect(eq.id).toBe('kemper');
    expect(eq.position[0]).toBeCloseTo(1.1);
    expect(eq.position[1]).toBeCloseTo(-56.25);
    expect(eq.modelAsset).toBe('asset:kemper');
    expect(eq.kind).toBe('generic'); // устройство не привязано
  });

  it('если файла модели нет, 3D-модель не назначается', () => {
    const eq = equipmentFromPlan({ ...item, asset: { ...item.asset!, url: null } }, zone);
    expect(eq.modelAsset).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createStepFlow, DISCARD, formSignature, formValues, SAVE, savedInspection, STAY, stepPosition } from './stepFlow.js';

const route = (states) => states.map((state, index) => ({ equipment: `M${index + 1}`, state }));

// Форма осмотра на шаге code: всё, что делает экран, — шпионы.
function setup({ code = 'M2', states = ['todo', 'todo', 'todo'], changed = false, answer = SAVE, leave = true } = {}) {
  const calls = [];
  const spies = {
    stops: () => route(states),
    changed: () => changed,
    ask: vi.fn(async () => answer), // своё окно отвечает асинхронно
    save: vi.fn(async () => { calls.push('save'); }),
    discard: vi.fn(() => calls.push('discard')),
    leave: vi.fn(() => leave),
    open: vi.fn((target, options) => calls.push(`open ${target}${options.saved ? ' saved' : ''}`)),
    finish: vi.fn((options) => calls.push(`finish${options.saved ? ' saved' : ''}`)),
  };
  return { flow: createStepFlow({ code, ...spies }), calls, spies };
}

describe('«Далее →»', () => {
  it('сохраняет новый осмотр и открывает следующий шаг', async () => {
    const { flow, calls, spies } = setup();
    expect(await flow.next()).toBe('saved');
    expect(calls).toEqual(['save', 'open M3 saved']);
    expect(spies.ask).not.toHaveBeenCalled();
  });

  it('на последнем шаге — «Сохранить и завершить»: сохраняет и возвращает к списку', async () => {
    const { flow, calls } = setup({ code: 'M3' });
    await flow.next();
    expect(calls).toEqual(['save', 'finish saved']);
  });

  it.each(['done', 'pending'])('осмотр уже сохранён сегодня (%s) и не менялся — без дубля, просто переход', async (state) => {
    const { flow, calls, spies } = setup({ states: ['todo', state, 'todo'] });
    expect(await flow.next()).toBe('moved');
    expect(spies.save).not.toHaveBeenCalled();
    expect(spies.ask).not.toHaveBeenCalled();
    expect(calls).toEqual(['discard', 'open M3']);
  });

  it('ответы изменили — окно «Сохранить изменения?», «Сохранить» — сохраняет и переходит', async () => {
    const { flow, calls, spies } = setup({ states: ['todo', 'done', 'todo'], changed: true, answer: SAVE });
    expect(await flow.next()).toBe('saved');
    expect(spies.ask).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['save', 'open M3 saved']);
  });

  it('«Не сохранять» — переход без записи и без второго вопроса', async () => {
    const { flow, calls, spies } = setup({ states: ['todo', 'pending', 'todo'], changed: true, answer: DISCARD });
    expect(await flow.next()).toBe('moved');
    expect(spies.save).not.toHaveBeenCalled();
    expect(spies.leave).not.toHaveBeenCalled();
    expect(calls).toEqual(['discard', 'open M3']);
  });

  it.each([STAY, null])('«Остаться» (или окно закрыли: %s) — остаёмся на шаге, ввод не теряется', async (answer) => {
    const { flow, calls, spies } = setup({ states: ['todo', 'done', 'todo'], changed: true, answer });
    expect(await flow.next()).toBe('stayed');
    expect(calls).toEqual([]);
    expect(spies.discard).not.toHaveBeenCalled();
  });

  it('«Сохранить и завершить» на последнем изменённом шаге — сохраняет и к списку', async () => {
    const { flow, calls } = setup({ code: 'M3', states: ['todo', 'todo', 'done'], changed: true, answer: SAVE });
    await flow.next();
    expect(calls).toEqual(['save', 'finish saved']);
  });

  it('отклонённый сервером осмотр сохраняется заново', async () => {
    const { flow, spies } = setup({ states: ['todo', 'error', 'todo'] });
    await flow.next();
    expect(spies.save).toHaveBeenCalledTimes(1);
  });

  it('ошибка сохранения — остаёмся на шаге', async () => {
    const { flow, spies } = setup();
    spies.save.mockRejectedValueOnce(new Error('нет места'));
    await expect(flow.next()).rejects.toThrow('нет места');
    expect(spies.open).not.toHaveBeenCalled();
  });
});

describe('«← Назад» и «Пропустить станок»', () => {
  it('«Назад» только переходит на предыдущий шаг, без записи', () => {
    const { flow, calls, spies } = setup();
    expect(flow.back()).toBe(true);
    expect(calls).toEqual(['open M1']);
    expect(spies.save).not.toHaveBeenCalled();
  });

  it('на первом шаге «Назад» некуда', () => {
    const { flow, spies } = setup({ code: 'M1' });
    expect(flow.back()).toBe(false);
    expect(spies.open).not.toHaveBeenCalled();
  });

  it('«Назад» с несохранённым вводом: пользователь передумал уходить', () => {
    const { flow, spies } = setup({ leave: false });
    expect(flow.back()).toBe(false);
    expect(spies.open).not.toHaveBeenCalled();
  });

  it('«Пропустить станок» — следующий шаг без записи осмотра', () => {
    const { flow, calls, spies } = setup();
    expect(flow.skip()).toBe(true);
    expect(calls).toEqual(['open M3']);
    expect(spies.save).not.toHaveBeenCalled();
  });

  it('«Пропустить» на последнем шаге — к списку шагов', () => {
    const { flow, calls } = setup({ code: 'M3' });
    flow.skip();
    expect(calls).toEqual(['finish']);
  });
});

describe('форма уже сохранённого осмотра', () => {
  const rows = [{ id: 1, text: 'Шум' }, { id: 2, text: 'Течь' }];
  const today = { date: '2026-11-02', time_zone: 'UTC', stops: [{ equipment: 'M1', inspection: {
    result: 'remark', comment: 'с сервера', answers: [{ item: 2, text: 'Течь', result: 'remark', note: 'капает' }] } }] };

  it('неотправленный осмотр с телефона важнее серверного', () => {
    const pending = [{ equipment: 'M1', inspected_at: Date.UTC(2026, 10, 2, 9) / 1000, comment: 'с телефона', answers: [] }];
    expect(savedInspection(today, pending, 'M1').comment).toBe('с телефона');
    expect(savedInspection(today, [], 'M1').comment).toBe('с сервера');
    expect(savedInspection(today, [{ ...pending[0], inspected_at: Date.UTC(2026, 10, 1, 9) / 1000 }], 'M1').comment).toBe('с сервера');
    expect(savedInspection(today, [], 'M2')).toBeNull();
  });

  it('ответы раскладываются по строкам чек-листа; без изменений отпечаток тот же', () => {
    const values = formValues(rows, today.stops[0].inspection);
    expect(values).toEqual({ checks: [{ value: 'ok', note: '' }, { value: 'remark', note: 'капает' }], comment: 'с сервера' });
    const before = formSignature({ ...values, photos: [] });
    expect(formSignature({ ...values, comment: 'с сервера  ' })).toBe(before);
    expect(formSignature({ ...values, checks: [{ value: 'ok', note: 'скрыто' }, values.checks[1]] })).toBe(before);
    expect(formSignature({ ...values, checks: [values.checks[0], { value: 'fault', note: 'капает' }] })).not.toBe(before);
    expect(formSignature({ ...values, photos: [{}] })).not.toBe(before);
  });

  it('без чек-листа — итог и комментарий', () => {
    expect(formValues([{ id: null, text: 'Общее состояние' }], { result: 'fault', comment: 'стук' }))
      .toEqual({ checks: [{ value: 'fault', note: '' }], comment: 'стук' });
    expect(formValues(rows, null).checks).toHaveLength(2);
  });

  it('соседние шаги', () => {
    expect(stepPosition(route(['todo', 'todo']), 'M2')).toMatchObject({ index: 1, next: null, last: true });
    expect(stepPosition(route(['todo', 'todo']), 'M1').next.equipment).toBe('M2');
  });
});

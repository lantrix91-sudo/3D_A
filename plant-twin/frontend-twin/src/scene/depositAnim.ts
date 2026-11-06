/**
 * Анимация дозатора-депозитора: лист шагает под насадками (по колонке за раз), каждая колонка наполняется
 * кремом; заполненный лист едет к краю конвейера, там формочки пустеют, и лист возвращается к началу.
 * Параметры хода берутся из userData.conv узла anim-tray модели.
 */
export interface ConveyorParams {
  /** Ось насадок вдоль ленты, м (в координатах модели) */
  nozzleX: number;
  /** Колонок формочек на листе (вдоль ленты) */
  cols: number;
  /** Шаг колонок, м */
  pitch: number;
  /** Положение листа в начале ленты и у края, м */
  startX: number;
  endX: number;
}

const APPROACH = 1.2;
const INDEX = 0.35;
const DEPOSIT = 0.6;
const TRAVEL = 2.6;
const EMPTY = 0.7;
const RETURN = 2.2;

export function depositorPeriod(p: ConveyorParams) {
  return APPROACH + p.cols * DEPOSIT + (p.cols - 1) * INDEX + TRAVEL + EMPTY + RETURN;
}

const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export interface DepositorState {
  /** Положение листа вдоль ленты, м */
  x: number;
  /** Наполненность каждой колонки, 0…1 */
  fill: number[];
  /** Ход дозирования (поршень, струйка), 0…1 */
  dose: number;
}

/** Состояние цикла через t секунд от начала */
export function depositorState(t: number, p: ConveyorParams): DepositorState {
  const C = Math.max(1, Math.round(p.cols));
  const cx = (c: number) => (c - (C - 1) / 2) * p.pitch;
  const fillX = (c: number) => p.nozzleX - cx(c); // колонка c под насадками
  const fill = new Array<number>(C).fill(0);
  let s = ((t % depositorPeriod(p)) + depositorPeriod(p)) % depositorPeriod(p);
  if (s < APPROACH) return { x: lerp(p.startX, fillX(C - 1), ease(s / APPROACH)), fill, dose: 0 };
  s -= APPROACH;
  // наполнение: первая колонка — ведущая (ближняя к краю), затем лист шагает вперёд
  for (let k = 0; k < C; k++) {
    const c = C - 1 - k;
    if (k > 0) {
      if (s < INDEX) return { x: lerp(fillX(c + 1), fillX(c), ease(s / INDEX)), fill, dose: 0 };
      s -= INDEX;
    }
    if (s < DEPOSIT) {
      const u = s / DEPOSIT;
      fill[c] = ease(Math.min(1, u * 1.15));
      return { x: fillX(c), fill, dose: Math.sin(Math.PI * u) };
    }
    fill[c] = 1;
    s -= DEPOSIT;
  }
  if (s < TRAVEL) return { x: lerp(fillX(0), p.endX, ease(s / TRAVEL)), fill, dose: 0 };
  s -= TRAVEL;
  if (s < EMPTY) {
    fill.fill(1 - ease(s / EMPTY)); // у края изделия снимают — формочки пустеют
    return { x: p.endX, fill, dose: 0 };
  }
  s -= EMPTY;
  fill.fill(0);
  return { x: lerp(p.endX, p.startX, ease(s / RETURN)), fill, dose: 0 };
}

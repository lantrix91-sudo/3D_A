/**
 * Простой блочный шрифт для надписей на моделях (без внешних файлов шрифтов).
 * Буквы строятся из контуров: высота заглавных = 1, строчных = 0,62; затем масштабируются.
 * Есть: A B C D E F G I K L M N O P R S T U V W Y Q Z, 0 2 4, a c e i k l m n o p r t u x, точка, Ö, дефис, пробел.
 */
export function makeLabel(THREE, text, h, material, opts = {}) {
  const t = opts.stroke ?? 0.19; // толщина штриха в долях высоты
  const lt = opts.lowerStroke ?? t * 0.8; // строчные — тоньше
  const X = 0.62; // высота строчных
  const rect = (x0, y0, x1, y1) => {
    const s = new THREE.Shape();
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    return s;
  };
  // наклонный штрих: верх [a0..a1] на высоте yt, низ [b0..b1] на высоте yb
  const quad = (a0, a1, yt, b0, b1, yb) => {
    const s = new THREE.Shape();
    s.moveTo(b0, yb); s.lineTo(b1, yb); s.lineTo(a1, yt); s.lineTo(a0, yt); s.closePath();
    return s;
  };
  const dBowl = (x0, y0, x1, y1, asShape = false) => {
    const r = (y1 - y0) / 2;
    const s = asShape ? new THREE.Shape() : new THREE.Path();
    s.moveTo(x0, y0); s.lineTo(x1 - r, y0);
    s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(x0, y1); s.closePath();
    return s;
  };
  // сектор кольца от a0 до a1 (рад, против часовой)
  const ring = (cx, cy, R, r, a0, a1) => {
    const s = new THREE.Shape();
    s.absarc(cx, cy, R, a0, a1, false);
    s.lineTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    s.absarc(cx, cy, r, a1, a0, true);
    s.closePath();
    return s;
  };
  const G = {
    A: { w: 0.8, s: () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(0.2, 0); s.lineTo(0.27, 0.22); s.lineTo(0.53, 0.22); s.lineTo(0.6, 0); s.lineTo(0.8, 0);
      s.lineTo(0.5, 1); s.lineTo(0.3, 1); s.closePath();
      const hole = new THREE.Path();
      hole.moveTo(0.32, 0.38); hole.lineTo(0.48, 0.38); hole.lineTo(0.4, 0.68); hole.closePath();
      s.holes.push(hole);
      return [s];
    } },
    B: { w: 0.74, s: () => {
      const lo = dBowl(0, 0, 0.74, 0.54, true); lo.holes.push(dBowl(t, t, 0.74 - t, 0.54 - t * 0.8));
      const hi = dBowl(0, 0.46, 0.68, 1, true); hi.holes.push(dBowl(t, 0.46 + t * 0.8, 0.68 - t, 1 - t));
      return [lo, hi];
    } },
    C: { w: 0.84, s: () => [ring(0.5, 0.5, 0.5, 0.5 - t, 0.62, Math.PI * 2 - 0.62)] },
    D: { w: 0.78, s: () => { const s = dBowl(0, 0, 0.78, 1, true); s.holes.push(dBowl(t, t, 0.78 - t, 1 - t)); return [s]; } },
    E: { w: 0.62, s: () => [rect(0, 0, t, 1), rect(0, 0, 0.62, t), rect(0, 0.5 - t / 2, 0.56, 0.5 + t / 2), rect(0, 1 - t, 0.62, 1)] },
    F: { w: 0.6, s: () => [rect(0, 0, t, 1), rect(0, 1 - t, 0.6, 1), rect(0, 0.5 - t / 2, 0.52, 0.5 + t / 2)] },
    '0': { w: 0.62, s: () => {
      const s = new THREE.Shape();
      s.absellipse(0.31, 0.5, 0.31, 0.5, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absellipse(0.31, 0.5, 0.31 - t, 0.5 - t * 0.9, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s];
    } },
    '4': { w: 0.68, s: () => [rect(0.68 - t * 1.6, 0, 0.68 - t * 0.6, 1), rect(0, 0.28, 0.68, 0.28 + t), quad(0.68 - t * 1.6, 0.68 - t * 0.4, 1, 0, t * 1.3, 0.28 + t)] },
    '2': { w: 0.66, s: () => {
      // верхняя дуга, наклонный штрих к левому нижнему углу, нижняя планка
      const R = 0.3;
      const cy = 1 - R;
      const a0 = -0.62;
      const ex = 0.33 + R * Math.cos(a0);
      const ey = cy + R * Math.sin(a0);
      const ix = 0.33 + (R - t) * Math.cos(a0);
      const iy = cy + (R - t) * Math.sin(a0);
      const diag = new THREE.Shape();
      diag.moveTo(ix, iy); diag.lineTo(ex, ey); diag.lineTo(t * 1.3, t); diag.lineTo(0, t); diag.closePath();
      return [ring(0.33, cy, R, R - t, a0, Math.PI * 0.97), diag, rect(0, 0, 0.66, t)];
    } },
    K: { w: 0.72, s: () => [
      rect(0, 0, t, 1),
      quad(0.72 - t * 1.3, 0.72, 1, t * 0.6, t * 0.6 + t * 1.3, 0.38),
      quad(t * 0.9 + 0.12, t * 0.9 + 0.12 + t * 1.3, 0.56, 0.72 - t * 1.3, 0.72, 0),
    ] },
    N: { w: 0.78, s: () => [rect(0, 0, t, 1), rect(0.78 - t, 0, 0.78, 1), quad(0, t * 1.35, 1, 0.78 - t * 1.35, 0.78, 0)] },
    S: { w: 0.6, s: () => {
      const R = 0.27;
      return [ring(0.3, 1 - R, R, R - t, 0.35, Math.PI * 1.5 + 0.02), ring(0.3, R, R, R - t, -Math.PI + 0.35, Math.PI * 0.5 + 0.02)];
    } },
    O: { w: 0.9, s: () => {
      const s = new THREE.Shape(); s.absarc(0.45, 0.5, 0.48, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.45, 0.5, 0.48 - t, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s];
    } },
    'Ö': { w: 0.9, s: () => {
      const s = new THREE.Shape(); s.absarc(0.45, 0.5, 0.48, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.45, 0.5, 0.48 - t, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s, rect(0.22, 1.08, 0.22 + t, 1.08 + t), rect(0.68 - t, 1.08, 0.68, 1.08 + t)];
    } },
    P: { w: 0.68, s: () => {
      const bowl = dBowl(0, 0.42, 0.68, 1, true); bowl.holes.push(dBowl(t, 0.42 + t * 0.85, 0.68 - t, 1 - t));
      return [rect(0, 0, t, 1), bowl];
    } },
    R: { w: 0.72, s: () => {
      const bowl = dBowl(0, 0.44, 0.68, 1, true); bowl.holes.push(dBowl(t, 0.44 + t * 0.85, 0.68 - t, 1 - t));
      return [rect(0, 0, t, 1), bowl, quad(0.28, 0.28 + t * 1.25, 0.46, 0.72 - t * 1.25, 0.72, 0)];
    } },
    Y: { w: 0.78, s: () => [quad(0, t * 1.25, 1, 0.39 - t * 0.6, 0.39 + t * 0.6, 0.45), quad(0.78 - t * 1.25, 0.78, 1, 0.39 - t * 0.6, 0.39 + t * 0.6, 0.45), rect(0.39 - t / 2, 0, 0.39 + t / 2, 0.47)] },
    Q: { w: 0.92, s: () => {
      const s = new THREE.Shape(); s.absarc(0.45, 0.5, 0.48, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.45, 0.5, 0.48 - t, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s, quad(0.5, 0.5 + t * 1.2, 0.32, 0.92 - t * 1.2, 0.92, -0.04)];
    } },
    Z: { w: 0.66, s: () => [rect(0, 1 - t, 0.66, 1), rect(0, 0, 0.66, t), quad(0.66 - t * 1.45, 0.66, 1 - t, 0, t * 1.45, t)] },
    L: { w: 0.58, s: () => [rect(0, 0, t, 1), rect(0, 0, 0.58, t)] },
    U: { w: 0.74, s: () => {
      const R = 0.37;
      return [rect(0, R, t, 1), rect(0.74 - t, R, 0.74, 1), ring(R, R, R, R - t, Math.PI, Math.PI * 2)];
    } },
    T: { w: 0.7, s: () => [rect(0, 1 - t, 0.7, 1), rect(0.35 - t / 2, 0, 0.35 + t / 2, 1 - t)] },
    G: { w: 0.86, s: () => [ring(0.48, 0.5, 0.5, 0.5 - t, 0.55, Math.PI * 2 - 0.12), rect(0.5, 0.42, 0.98, 0.42 + t), rect(0.98 - t, 0.12, 0.98, 0.42 + t)] },
    I: { w: t, s: () => [rect(0, 0, t, 1)] },
    M: { w: 0.92, s: () => [
      rect(0, 0, t, 1), rect(0.92 - t, 0, 0.92, 1),
      quad(0, t * 1.25, 1, 0.46 - t * 0.62, 0.46 + t * 0.62, 0.3),
      quad(0.92 - t * 1.25, 0.92, 1, 0.46 - t * 0.62, 0.46 + t * 0.62, 0.3),
    ] },
    V: { w: 0.8, s: () => [quad(0, t * 1.2, 1, 0.4 - t * 0.6, 0.4 + t * 0.6, 0), quad(0.8 - t * 1.2, 0.8, 1, 0.4 - t * 0.6, 0.4 + t * 0.6, 0)] },
    W: { w: 1.12, s: () => [
      quad(0, t * 1.15, 1, 0.22, 0.22 + t * 1.15, 0),
      quad(0.47, 0.47 + t * 1.15, 0.78, 0.22, 0.22 + t * 1.15, 0),
      quad(0.47, 0.47 + t * 1.15, 0.78, 0.69, 0.69 + t * 1.15, 0),
      quad(1.12 - t * 1.15, 1.12, 1, 0.69, 0.69 + t * 1.15, 0),
    ] },
    r: { w: 0.4, s: () => [rect(0, 0, lt, X), ring(lt, X - 0.24, 0.24, 0.24 - lt, 0.25, Math.PI / 2)] },
    o: { w: 0.62, s: () => {
      const s = new THREE.Shape(); s.absarc(0.31, X / 2, 0.31, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.31, X / 2, 0.31 - lt, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s];
    } },
    a: { w: 0.56, s: () => {
      const s = new THREE.Shape(); s.absarc(0.27, X / 2, 0.27, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.27, X / 2, 0.27 - lt, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [s, rect(0.56 - lt, 0, 0.56, X)];
    } },
    e: { w: 0.6, s: () => [ring(0.3, X / 2, 0.3, 0.3 - lt, 0, Math.PI * 2 - 0.7), rect(0.02, X / 2 - lt / 2, 0.58, X / 2 + lt / 2)] },
    k: { w: 0.52, s: () => [
      rect(0, 0, lt, 1),
      quad(0.52 - lt * 1.3, 0.52, X, lt * 0.7, lt * 0.7 + lt * 1.3, 0.2),
      quad(lt + 0.08, lt + 0.08 + lt * 1.3, 0.36, 0.52 - lt * 1.3, 0.52, 0),
    ] },
    m: { w: 0.86, s: () => [
      rect(0, 0, lt, X), rect(0.43 - lt / 2, 0, 0.43 + lt / 2, X - 0.215), rect(0.86 - lt, 0, 0.86, X - 0.215),
      ring(0.215, X - 0.215, 0.215, 0.215 - lt, 0, Math.PI), ring(0.645, X - 0.215, 0.215, 0.215 - lt, 0, Math.PI),
    ] },
    p: { w: 0.6, s: () => {
      const s = new THREE.Shape(); s.absarc(0.31, X / 2, 0.29, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0.31, X / 2, 0.29 - lt, 0, Math.PI * 2, true);
      s.holes.push(hole);
      return [rect(0, -0.3, lt, X), s];
    } },
    t: { w: 0.36, s: () => [rect(0.09, 0, 0.09 + lt, 0.88), rect(0, X - lt, 0.36, X)] },
    l: { w: lt, s: () => [rect(0, 0, lt, 1)] },
    i: { w: lt, s: () => [rect(0, 0, lt, X), rect(0, X + 0.13, lt, X + 0.13 + lt)] },
    n: { w: 0.56, s: () => [rect(0, 0, lt, X), rect(0.56 - lt, 0, 0.56, X - 0.28), ring(0.28, X - 0.28, 0.28, 0.28 - lt, 0, Math.PI)] },
    u: { w: 0.56, s: () => [rect(0, 0.28, lt, X), rect(0.56 - lt, 0, 0.56, X), ring(0.28, 0.28, 0.28, 0.28 - lt, Math.PI, Math.PI * 2)] },
    x: { w: 0.54, s: () => [quad(0, lt * 1.3, X, 0.54 - lt * 1.3, 0.54, 0), quad(0.54 - lt * 1.3, 0.54, X, 0, lt * 1.3, 0)] },
    c: { w: 0.54, s: () => [ring(0.31, X / 2, 0.31, 0.31 - lt, 0.7, Math.PI * 2 - 0.7)] },
    '.': { w: lt, s: () => [rect(0, 0, lt, lt)] },
    '-': { w: 0.32, s: () => [rect(0, 0.3, 0.32, 0.3 + lt)] },
  };
  const g = new THREE.Group();
  let x = 0;
  const gap = opts.gap ?? 0.13;
  const depth = (opts.depth ?? 0.004) / h;
  for (const ch of text) {
    if (ch === ' ') { x += 0.32; continue; }
    const glyph = G[ch];
    if (!glyph) throw new Error(`В шрифте нет символа «${ch}»`);
    const geo = new THREE.ExtrudeGeometry(glyph.s(), { depth, bevelEnabled: false, curveSegments: 10 });
    const m = new THREE.Mesh(geo, material);
    m.position.x = x;
    g.add(m);
    x += glyph.w + gap;
  }
  g.scale.set(h, h, h);
  g.userData.width = (x - gap) * h;
  return g;
}

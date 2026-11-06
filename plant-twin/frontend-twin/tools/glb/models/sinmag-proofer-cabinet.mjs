/**
 * Расстоечный шкаф SINMAG (под тележку) — модель по фотографии заказчика.
 * Габариты по данным заказчика: ширина 1200 мм, длина (глубина) 1900 мм, высота корпуса 2085 мм,
 * с блоком управления на крыше — 2330 мм.
 * Упрощённая геометрия: корпус из нержавеющей стали; на лицевой стороне — верхняя планка с табличкой «IV»,
 * рама и распашная дверь (петли слева, защёлка справа), лист-предупреждение; на крыше — блок управления
 * из нержавейки с панелью SINMAG (живой экран вместо красных цифр, цветные кнопки), датчик снизу блока,
 * кабель назад; сзади на крыше — отвод пара.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-steam   — точка выхода пара (отвод на крыше): пока шкаф работает, идёт пар;
 *   info-screen  — живой экран на панели блока управления (одной строкой: позиция, показание, состояние);
 *   anim-status  — индикатор на панели окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Расстоечный шкаф SINMAG',
  units: 'm',
  note: 'По фото заказчика; 1200 × 1900 × 2085 мм (с блоком управления 2330 мм)',
};

export function build({ THREE, mat, box, cyl, rodX, rodZ, group, label, infoScreen }) {
  const W = 1.2;
  const D = 1.9;
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;
  const H = 2.085; // корпус
  const HC = 2.33; // верх блока управления

  const inox = mat.color('#dde2e5', 0.55, 0.26);
  // шлифованная нержавейка: светлый металл с полосами отражений (цвет по вершинам, как блики на фото)
  const steel = new THREE.MeshStandardMaterial({ color: '#d4d9dd', metalness: 0.78, roughness: 0.3, vertexColors: true });
  const steelBox = (w, h, d, x, y0, z, name, seed = 0) => {
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 0.04)), Math.max(1, Math.round(h / 0.04)), Math.max(1, Math.round(d / 0.08)));
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + x, py = pos.getY(i) + y0 + h / 2, pz = pos.getZ(i) + z;
      // диагональные широкие блики + тонкие вертикальные риски шлифовки
      const band = 0.16 * Math.sin(px * 5.5 + py * 2.2 + pz * 1.7 + seed) + 0.08 * Math.sin(py * 7.5 - px * 2.0 + seed * 1.7);
      const brush = 0.025 * Math.sin(px * 160 + pz * 160);
      const v = Math.min(1, Math.max(0.5, 0.8 + band + brush));
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = Math.min(1, v * 1.02);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, steel);
    m.position.set(x, y0 + h / 2, z);
    if (name) m.name = name;
    return m;
  };
  const inoxDark = mat.color('#a9afb4', 0.5, 0.38);
  const seam = mat.color('#868c91', 0.5, 0.42);
  const white = mat.color('#f3f3f0', 0.02, 0.6);
  const black = mat.color('#121416', 0.1, 0.6);
  const panelBlack = mat.color('#0e1012', 0.1, 0.4);
  const cable = mat.color('#1b1d1f', 0.05, 0.7);
  const btnYellow = mat.color('#e7b62a', 0.05, 0.45);
  const btnPink = mat.color('#d25aa8', 0.05, 0.45);
  const btnBlue = mat.color('#3a6fd8', 0.05, 0.45);
  const red = mat.color('#c83a32', 0.1, 0.45);

  const parts = [];

  // ---- корпус
  const BF = Z1 - 0.07; // лицевая плоскость корпуса; дверь и защёлка выступают до Z1
  parts.push(steelBox(W, H, BF - Z0, 0, 0, (BF + Z0) / 2, 'корпус', 0.3));
  for (const sz of [Z0 + 0.63, Z0 + 1.26]) {
    parts.push(box(0.006, H - 0.02, 0.008, seam, X1 - 0.002, 0.01, sz));
    parts.push(box(0.006, H - 0.02, 0.008, seam, X0 + 0.002, 0.01, sz));
  }
  // верхняя планка над дверью
  parts.push(steelBox(W, 0.2, 0.025, 0, H - 0.2, BF + 0.0125, 'верхняя планка', 1.1));
  parts.push(box(W, 0.006, 0.006, seam, 0, H - 0.2, BF + 0.026));
  // табличка «IV» и паспортная табличка слева
  parts.push(box(0.15, 0.1, 0.003, white, X0 + 0.12, H - 0.17, BF + 0.027, 'табличка'));
  const iv = label('IV', 0.06, black, { stroke: 0.14, gap: 0.04, depth: 0.002 });
  iv.position.set(X0 + 0.12 - iv.userData.width / 2, H - 0.15, BF + 0.029);
  parts.push(iv);
  parts.push(box(0.1, 0.06, 0.003, white, X0 + 0.12, H - 0.06, BF + 0.027, 'паспорт'));

  // ---- рама проёма и дверь
  const FX0 = X0 + 0.08;
  const FX1 = X1 - 0.08;
  parts.push(steelBox(0.09, H - 0.2, 0.03, FX0 + 0.045, 0, BF + 0.015, 'стойка рамы', 2.0));
  parts.push(steelBox(0.09, H - 0.2, 0.03, FX1 - 0.045, 0, BF + 0.015, 'стойка рамы', 2.6));
  parts.push(steelBox(FX1 - FX0, 0.06, 0.03, 0, H - 0.26, BF + 0.015, 'ригель', 0.7));
  const DX0 = FX0 + 0.1;
  const DX1 = FX1 - 0.09;
  const DC = (DX0 + DX1) / 2;
  parts.push(steelBox(DX1 - DX0, H - 0.34, 0.045, DC, 0.03, BF + 0.0225, 'дверь', 1.6));
  parts.push(box(DX1 - DX0 - 0.03, 0.005, 0.004, seam, DC, H - 0.33, BF + 0.046)); // кромка
  // светлая вертикальная планка петель слева
  parts.push(box(0.05, H - 0.38, 0.03, mat.color('#e9ecee', 0.2, 0.4), DX0 - 0.03, 0.05, BF + 0.045, 'петли'));
  // защёлка и нижняя ручка справа
  parts.push(box(0.04, 0.16, 0.025, inoxDark, DX1 - 0.03, 1.15, BF + 0.057, 'защёлка'));
  parts.push(box(0.025, 0.09, 0.02, inox, DX1 - 0.03, 1.2, BF + 0.068));
  parts.push(box(0.025, 0.14, 0.02, inoxDark, DX1 - 0.03, 0.55, BF + 0.055, 'ручка'));
  // лист-предупреждение на двери
  parts.push(box(0.2, 0.28, 0.002, white, DC - 0.22, 1.4, BF + 0.046, 'лист'));
  parts.push(box(0.14, 0.012, 0.002, red, DC - 0.22, 1.65, BF + 0.047));
  parts.push(box(0.12, 0.09, 0.002, seam, DC - 0.22, 1.52, BF + 0.047));

  // ---- блок управления на крыше
  const CX = -0.04;
  const CW = 0.42;
  const CY0 = H - 0.12; // блок свисает на верхнюю планку
  const CZ1 = Z1 - 0.012;
  const CDp = 0.32;
  parts.push(steelBox(CW, HC - CY0, CDp, CX, CY0, CZ1 - CDp / 2, 'блок управления', 0.9));
  parts.push(box(CW + 0.01, 0.008, CDp + 0.01, inoxDark, CX, HC - 0.008, CZ1 - CDp / 2)); // отгиб крышки
  // панель SINMAG: живой экран вместо красных цифр, цветные кнопки
  const PY = CY0 + 0.15;
  parts.push(box(0.3, 0.13, 0.004, panelBlack, CX, PY - 0.065, CZ1 + 0.002, 'панель'));
  parts.push(infoScreen(0.27, 0.055, CX, PY + 0.03, CZ1 + 0.0045)); // живой экран — строка показаний
  const btns = [btnYellow, btnYellow, btnYellow, btnYellow, btnPink, btnBlue, btnBlue, white];
  btns.forEach((m, k) => parts.push(box(0.022, 0.022, 0.004, m, CX - 0.1 + k * 0.029, PY - 0.04, CZ1 + 0.005)));
  const lamp = rodZ(0.006, 0.004, mat.color('#2a6e3a', 0.1, 0.4), CX + 0.13, PY + 0.03, CZ1 + 0.005, 12);
  lamp.name = 'anim-status';
  parts.push(lamp);
  const brand = label('SINMAG', 0.012, mat.color('#9aa3aa', 0.1, 0.4), { stroke: 0.2, gap: 0.12, depth: 0.001 });
  brand.position.set(CX - 0.135, PY - 0.062, CZ1 + 0.004);
  parts.push(brand);
  // датчик под блоком и кабель назад по крыше
  parts.push(cyl(0.018, 0.02, black, CX, CY0 - 0.02, CZ1 - 0.08, 16));
  parts.push(rodX(0.012, 0.3, cable, CX + CW / 2 + 0.15, HC - 0.06, CZ1 - 0.2, 12));
  parts.push(rodZ(0.012, 0.9, cable, CX + CW / 2 + 0.3, H + 0.012, CZ1 - 0.65, 12));

  // ---- отвод пара на крыше сзади
  const SX = 0.25;
  const SZ = Z0 + 0.4;
  parts.push(cyl(0.04, 0.06, inox, SX, H, SZ, 20));
  const steam = new THREE.Object3D();
  steam.name = 'anim-steam';
  steam.position.set(SX, H + 0.06, SZ);
  parts.push(steam);

  return group(parts);
}

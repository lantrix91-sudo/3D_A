/**
 * Вакууматор (вакуумный охладитель) Weber Cooling — модель по фотографии заказчика.
 * Габариты по данным заказчика (Ш × Г × В): 1940 × 2020 × 2260 мм.
 * Упрощённая геометрия: корпус из нержавеющей стали, слева шкаф управления (сенсорный дисплей, кнопки,
 * аварийный стоп, табличка-инструкция, знак запрета), справа дверь камеры с иллюминатором, вертикальной
 * ручкой и синей надписью WEBER (снизу вверх, как на фото); на крыше манометр, рым-болты и патрубки.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-display  — сенсорный дисплей: светится, пока вакууматор работает, и гаснет при остановке;
 *   anim-progress — полоса хода цикла охлаждения на дисплее, заполняется слева направо, пока идёт работа;
 *   anim-status   — светодиод на рамке дисплея окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Вакууматор Weber Cooling',
  units: 'm',
  note: 'По фото заказчика; габариты 1940 × 2020 × 2260 мм (Ш × Г × В)',
};

export function build({ THREE, mat, box, cyl, group, label, infoScreen }) {
  const W = 1.94;
  const D = 2.02;
  const X0 = -W / 2;
  const X1 = W / 2;
  const BODY_H = 2.2; // корпус; рым-болты, манометр и патрубки — до 2,26 м
  const ZF = D / 2;
  const BF = ZF - 0.1; // лицевая плоскость шкафа; дверь, ручка и иллюминатор — до ZF

  const inox = mat.color('#d3d7da', 0.4, 0.38); // нержавейка (умеренная металличность — светлая и без карты отражений)
  const inoxDark = mat.color('#b2b7bb', 0.4, 0.42);
  const seam = mat.color('#7e8489', 0.6, 0.45);
  const dark = mat.color('#1d2125', 0.2, 0.5);
  const bezel = mat.color('#6d7378', 0.4, 0.45);
  const blue = mat.color('#2b3f9e', 0.15, 0.4);
  const red = mat.color('#c8262b', 0.1, 0.4);
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const white = mat.color('#f3f3f0', 0.02, 0.6);
  const glassDark = new THREE.MeshStandardMaterial({ color: '#0f1418', metalness: 0.2, roughness: 0.08 });
  const black = mat.color('#141414', 0.1, 0.7);

  const parts = [];

  // ---- корпус
  parts.push(box(W, BODY_H, BF - (-ZF), inox, 0, 0, (BF - ZF) / 2, 'корпус'));

  // ---- шкаф управления слева: крышка сверху, лицевая панель, нижняя панель
  const CX0 = X0;
  const CX1 = X0 + 0.83;
  const CC = (CX0 + CX1) / 2;
  const CW = CX1 - CX0;
  parts.push(box(CW - 0.02, 0.006, 0.006, seam, CC, 1.93, BF + 0.003)); // стык крышки
  parts.push(box(CW - 0.02, 0.006, 0.006, seam, CC, 0.5, BF + 0.003)); // стык нижней панели
  parts.push(box(0.006, BODY_H - 0.02, 0.006, seam, CX1, 0.01, BF + 0.003)); // край шкафа
  // стойка между шкафом и дверью
  parts.push(box(0.08, BODY_H, 0.02, inoxDark, CX1 + 0.04, 0, BF + 0.01, 'стойка'));

  // сенсорный дисплей (панель оператора) в серой рамке
  const SX = X0 + 0.445;
  const SY = 1.36;
  parts.push(box(0.27, 0.2, 0.04, bezel, SX, SY, BF + 0.02, 'рамка дисплея'));
  parts.push(box(0.03, 0.06, 0.04, dark, SX + 0.15, SY + 0.11, BF + 0.02, 'кабельный ввод'));
  const scrW = 0.225;
  const scrH = 0.15;
  const scrY = SY + 0.025;
  const scrZ = BF + 0.042;
  const display = new THREE.MeshStandardMaterial({ color: '#202820', emissive: '#e9f2d8', emissiveIntensity: 0.9, roughness: 0.35 });
  const scr = box(scrW, scrH, 0.004, display, SX, scrY, scrZ, 'anim-display');
  parts.push(scr);
  // «окна» показаний и шапка интерфейса (как на фото: давление, температура, время)
  const ui = new THREE.MeshStandardMaterial({ color: '#30373c', emissive: '#30373c', emissiveIntensity: 0.2, roughness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#f0a020', emissiveIntensity: 0.5, roughness: 0.4 });
  parts.push(box(0.05, 0.014, 0.002, accent, SX + 0.01, scrY + scrH - 0.03, scrZ + 0.003));
  for (const dx of [-0.07, 0, 0.07]) {
    parts.push(box(0.055, 0.004, 0.002, ui, SX + dx, scrY + 0.085, scrZ + 0.003));
    parts.push(box(0.04, 0.018, 0.002, ui, SX + dx, scrY + 0.05, scrZ + 0.003));
  }
  // полоса хода цикла: точка опоры слева, масштаб по X от 0 до 1
  const barW = 0.19;
  const barY = scrY + 0.018;
  parts.push(box(barW, 0.012, 0.002, ui, SX, barY, scrZ + 0.003, 'шкала цикла'));
  const progress = new THREE.Group();
  progress.name = 'anim-progress';
  progress.position.set(SX - barW / 2, 0, scrZ + 0.005);
  const barMat = new THREE.MeshStandardMaterial({ color: '#3fbf5f', emissive: '#3fbf5f', emissiveIntensity: 0.8, roughness: 0.4 });
  progress.add(box(barW, 0.012, 0.002, barMat, barW / 2, barY, 0));
  parts.push(progress);
  // живой экран: верх дисплея (полоса цикла остаётся видна снизу)
  parts.push(infoScreen(scrW, 0.115, SX, scrY + 0.0925, scrZ + 0.0065));
  // светодиод состояния на рамке
  const led = rodZ(THREE, 0.007, 0.006, new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1 }), SX + 0.115, SY + 0.012, BF + 0.043);
  led.name = 'anim-status';
  parts.push(led);

  // кнопки: 3 + (2 и аварийный стоп) + 1
  const btnX = [SX - 0.075, SX, SX + 0.075];
  for (const x of btnX) parts.push(button(THREE, inoxDark, x, 1.28, BF));
  parts.push(button(THREE, inoxDark, btnX[0], 1.2, BF));
  parts.push(button(THREE, inoxDark, btnX[2], 1.2, BF));
  parts.push(rodZ(THREE, 0.024, 0.012, yellow, btnX[1], 1.2, BF + 0.006, 'аварийный стоп'));
  parts.push(rodZ(THREE, 0.016, 0.03, red, btnX[1], 1.2, BF + 0.025));
  parts.push(button(THREE, inoxDark, btnX[1], 1.12, BF));

  // табличка-инструкция в прозрачном кармане
  parts.push(box(0.23, 0.33, 0.008, mat.color('#e2e4e2', 0.1, 0.4), X0 + 0.185, 1.2, BF + 0.004, 'табличка'));
  parts.push(box(0.21, 0.31, 0.002, white, X0 + 0.185, 1.21, BF + 0.009));
  for (let i = 0; i < 9; i++) {
    parts.push(box(i % 3 === 0 ? 0.14 : 0.1, 0.006, 0.001, mat.color('#9a9ea2', 0.1, 0.6), X0 + 0.16 - (i % 3 === 0 ? 0 : 0.02), 1.47 - i * 0.03, BF + 0.0105));
  }

  // знак «Запрещено»: белый круг, красное кольцо, диагональ
  const signX = X0 + 0.46;
  const signY = 1.85;
  parts.push(rodZ(THREE, 0.045, 0.002, white, signX, signY, BF + 0.002, 'знак запрета'));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 8, 32), red);
  ring.position.set(signX, signY, BF + 0.004);
  parts.push(ring);
  const slash = box(0.075, 0.011, 0.002, red, signX, signY - 0.0055, BF + 0.004);
  slash.rotation.z = -Math.PI / 4;
  parts.push(slash);

  // кабели снизу у стойки
  for (const dx of [-0.02, 0.0]) parts.push(cyl(0.006, 0.12, mat.color('#2b3a8a', 0.1, 0.6), CX1 - 0.06 + dx, 0, BF + 0.01, 8));

  // ---- дверь камеры
  const DX0 = CX1 + 0.085;
  const DX1 = X1 - 0.015;
  const DC = (DX0 + DX1) / 2;
  const DZ = BF + 0.02; // центр толщины двери (0,04)
  parts.push(box(DX1 - DX0, BODY_H - 0.03, 0.04, inox, DC, 0.015, DZ, 'дверь'));
  // окантовка двери
  for (const x of [DX0 + 0.006, DX1 - 0.006]) parts.push(box(0.012, BODY_H - 0.03, 0.004, inoxDark, x, 0.015, BF + 0.041));
  parts.push(box(DX1 - DX0, 0.012, 0.004, inoxDark, DC, BODY_H - 0.03, BF + 0.041));
  // ручка: вертикальная труба на двух стойках
  const HX = DX0 + 0.1;
  const handle = cyl(0.014, 0.68, inox, HX, 0.92, BF + 0.086, 16, 'ручка');
  parts.push(handle);
  for (const y of [0.95, 1.57]) parts.push(rodZ(THREE, 0.01, 0.05, inox, HX, y, BF + 0.064));
  // защёлка у стойки
  parts.push(box(0.03, 0.05, 0.03, inoxDark, DX0 - 0.02, 0.88, BF + 0.025, 'защёлка'));
  parts.push(box(0.012, 0.012, 0.04, inox, DX0 - 0.02, 0.86, BF + 0.05));

  // иллюминатор: фланец с болтами и тёмное стекло
  const PX = DX0 + 0.48;
  const PY = 1.54;
  const flange = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 12, 40), inox);
  flange.position.set(PX, PY, BF + 0.045);
  flange.name = 'иллюминатор';
  parts.push(flange);
  parts.push(rodZ(THREE, 0.082, 0.006, glassDark, PX, PY, BF + 0.044));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(rodZ(THREE, 0.006, 0.01, inoxDark, PX + 0.1 * Math.cos(a), PY + 0.1 * Math.sin(a), BF + 0.065));
  }

  // надпись WEBER — синяя, вертикально вдоль правого края двери, читается снизу вверх
  const cap = 0.1;
  const word = label('WEBER', cap, blue, { stroke: 0.22, gap: 0.09, depth: 0.003 });
  word.rotation.z = Math.PI / 2; // строка идёт вверх, верх букв смотрит влево
  const LX = DX0 + 0.89;
  word.position.set(LX + cap / 2, 1.87 - word.userData.width / 2, BF + 0.04);
  word.name = 'надпись WEBER';
  parts.push(word);

  // ---- крыша: рым-болты, манометр, патрубки
  for (const [x, z] of [[X0 + 0.06, ZF - 0.12], [X1 - 0.06, ZF - 0.12]]) {
    parts.push(cyl(0.008, 0.02, inoxDark, x, BODY_H, z, 10));
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), inoxDark);
    eye.position.set(x, BODY_H + 0.032, z);
    eye.name = 'рым-болт';
    parts.push(eye);
  }
  parts.push(cyl(0.008, 0.02, inoxDark, 0.15, BODY_H, ZF - 0.25, 10));
  const gauge = rodZ(THREE, 0.025, 0.018, inox, 0.15, BODY_H + 0.034, ZF - 0.25, 'манометр');
  parts.push(gauge);
  parts.push(rodZ(THREE, 0.02, 0.002, white, 0.15, BODY_H + 0.034, ZF - 0.24));
  for (const x of [X0 + 0.27, X0 + 0.36]) parts.push(cyl(0.03, 0.055, black, x, BODY_H, -0.2, 16, 'патрубок'));
  parts.push(cyl(0.02, 0.05, inoxDark, X0 + 0.5, BODY_H, -0.4, 12));

  return group(parts);
}

/** Круглая кнопка из нержавейки с ободком */
function button(THREE, material, x, y, z) {
  const g = new THREE.Group();
  g.add(rodZ(THREE, 0.016, 0.008, material, x, y, z + 0.004));
  g.add(rodZ(THREE, 0.011, 0.012, material, x, y, z + 0.01));
  return g;
}

/** Короткий цилиндр с осью вдоль Z */
function rodZ(THREE, r, len, material, x, y, z, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}

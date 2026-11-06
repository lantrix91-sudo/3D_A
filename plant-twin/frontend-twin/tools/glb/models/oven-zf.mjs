/**
 * Ротационная печь «ZF» — модель по фотографии заказчика.
 * Габариты по данным заказчика (Д × Ш × В): 1330 × 2050 × 2330 мм.
 * Принято: 1330 мм — ширина фасада (дверь + пульт), 2050 мм — глубина вместе с козырьком, 2330 мм — высота
 * вместе с патрубком на крыше.
 * Упрощённая геометрия: корпус цвета «шампань», массивный козырёк с надписью «ZF», вентилятор и
 * дымоход на крыше, дверь со смотровым окном и тёмной планкой с надписью, рычажная ручка, колонна пульта
 * справа (три индикатора, красные кнопки, откидной карман), жалюзи внизу, перфорированная планка на боковине,
 * чёрный въездной порог.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-rotate — тележка за смотровым окном вращается, пока печь работает;
 *   anim-glow   — подсветка и жар камеры (яркость зависит от температуры);
 *   anim-status — сигнальная линза датчика над пультом окрашивается в цвет состояния;
 *   anim-screen — три индикатора пульта светятся, пока печь на связи и работает;
 *   anim-steam  — точка выхода пара (дымоход на крыше).
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Печь ротационная ZF',
  units: 'm',
  note: 'По фото заказчика; габариты 1330 × 2050 × 2330 мм (Ш × Г × В)',
};

export function build({ THREE, mat, box, cyl, group, label, chimney, infoScreen }) {
  const W = 1.33;
  const D = 2.05;
  const X0 = -W / 2;
  const X1 = W / 2;
  const ZF = D / 2; // передняя кромка козырька
  const ZB = -D / 2; // задняя стенка
  const BF = ZF - 0.1; // лицевая плоскость корпуса (козырёк выступает на 0,1 м)
  const HOOD0 = 1.88; // низ козырька
  const HOOD1 = 2.13; // верх козырька (крыша)

  const body = mat.color('#aaa696', 0.55, 0.38);
  const side = mat.color('#bab7ab', 0.5, 0.42);
  const hoodMat = mat.color('#a4a091', 0.55, 0.36);
  const seam = mat.color('#8a877b', 0.5, 0.5);
  const dark = mat.color('#17191b', 0.2, 0.5);
  const slot = mat.color('#2a2c2e', 0.2, 0.8);
  const chrome = mat.color('#e4e6e8', 0.9, 0.18);
  const red = new THREE.MeshStandardMaterial({ color: '#c8262b', emissive: '#7a0c10', emissiveIntensity: 0.4, roughness: 0.35 });
  const white = mat.color('#f4f4f2', 0.05, 0.45);
  const flapMat = mat.color('#d6d0c1', 0.35, 0.45);
  const glassTint = new THREE.MeshStandardMaterial({ color: '#a9c7d6', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.2 });
  const tray = mat.color('#c7ccd0', 0.8, 0.35);
  const liner = new THREE.MeshStandardMaterial({ color: '#3a3c3e', metalness: 0.5, roughness: 0.5, emissive: '#ff8a2a', emissiveIntensity: 0.35 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffe2b0', emissiveIntensity: 1.3 });
  const loafMat = mat.color('#c27a3a', 0, 0.85);
  const screen = new THREE.MeshStandardMaterial({ color: '#0e1418', emissive: '#7fd0a0', emissiveIntensity: 0.6, roughness: 0.3 });
  const status = new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1, roughness: 0.3 });

  const parts = [];

  // ---- зоны фасада
  const DX0 = X0 + 0.04; // дверь
  const DX1 = X0 + 1.1;
  const DY0 = 0.06;
  const DY1 = 1.86;
  const DZ = BF; // дверь лежит на лицевой плоскости, толщина 0,05
  const PX0 = DX1 + 0.015; // колонна пульта
  const PC = (PX0 + X1) / 2;
  const WX0 = X0 + 0.33; // смотровое окно
  const WX1 = X0 + 0.76;
  const WC = (WX0 + WX1) / 2;

  // ---- пекарная камера (за дверью)
  const CX0 = X0 + 0.07;
  const CX1 = DX1 - 0.03;
  const CY0 = 0.1;
  const CY1 = 1.8;
  const CZ0 = BF - 1.08;
  const front = BF - CZ0;
  const fz = (BF + CZ0) / 2;

  // корпус: задняя часть целиком, вокруг камеры — стенки
  parts.push(box(W - 0.02, 0.05, BF - ZB - 0.02, seam, 0, 0, (BF + ZB) / 2, 'цоколь'));
  parts.push(box(W - 0.006, HOOD0 - 0.05, CZ0 - ZB, body, 0, 0.05, (CZ0 + ZB) / 2, 'корпус'));
  parts.push(box(CX0 - X0 - 0.003, HOOD0 - 0.05, front, body, (X0 + 0.003 + CX0) / 2, 0.05, fz, 'корпус слева'));
  parts.push(box(X1 - 0.003 - CX1, HOOD0 - 0.05, front, body, (CX1 + X1 - 0.003) / 2, 0.05, fz, 'корпус справа'));
  parts.push(box(CX1 - CX0, HOOD0 - CY1, front, body, (CX0 + CX1) / 2, CY1, fz, 'корпус сверху'));
  parts.push(box(CX1 - CX0, CY0 - 0.05, front, body, (CX0 + CX1) / 2, 0.05, fz, 'корпус снизу'));

  // облицовка камеры и лампы — светятся, пока печь греет
  const lin = (w, h, d, x, y0, z) => box(w, h, d, liner, x, y0, z);
  const glow = group(
    lin(CX1 - CX0, CY1 - CY0, 0.01, (CX0 + CX1) / 2, CY0, CZ0 + 0.005),
    lin(0.01, CY1 - CY0, front, CX0 + 0.005, CY0, fz),
    lin(0.01, CY1 - CY0, front, CX1 - 0.005, CY0, fz),
    lin(CX1 - CX0, 0.01, front, (CX0 + CX1) / 2, CY1 - 0.01, fz),
    lin(CX1 - CX0, 0.01, front, (CX0 + CX1) / 2, CY0, fz),
    box(0.035, CY1 - CY0 - 0.3, 0.06, lamp, CX0 + 0.03, CY0 + 0.15, CZ0 + 0.08),
    box(0.035, CY1 - CY0 - 0.3, 0.06, lamp, CX1 - 0.03, CY0 + 0.15, CZ0 + 0.08),
  );
  glow.name = 'anim-glow';
  parts.push(glow);

  // тележка с противнями: вращается вокруг вертикальной оси в центре камеры
  const RW = 0.62;
  const RD = 0.76;
  const rack = new THREE.Group();
  rack.name = 'anim-rotate';
  rack.position.set((CX0 + CX1) / 2, 0, fz);
  const rp = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rp.push(box(0.025, CY1 - CY0 - 0.2, 0.025, tray, sx * (RW / 2 - 0.0125), CY0 + 0.05, sz * (RD / 2 - 0.0125)));
  }
  rp.push(box(RW, 0.03, RD, tray, 0, CY0 + 0.05, 0));
  rp.push(box(RW, 0.03, 0.04, tray, 0, CY1 - 0.18, 0));
  rp.push(cyl(0.02, 0.12, tray, 0, CY1 - 0.15, 0, 12));
  const TRAYS = 15;
  const ty0 = CY0 + 0.18;
  const tStep = (CY1 - CY0 - 0.5) / (TRAYS - 1);
  for (let i = 0; i < TRAYS; i++) {
    const y = ty0 + i * tStep;
    rp.push(box(RW - 0.04, 0.008, RD - 0.04, tray, 0, y, 0));
    for (const lx of [-0.19, 0, 0.19]) {
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, RD - 0.2, 3, 8), loafMat);
      loaf.rotation.x = Math.PI / 2;
      loaf.scale.set(1, 1, 0.55);
      loaf.position.set(lx, y + 0.03, 0);
      rp.push(loaf);
    }
  }
  rp.forEach((m) => rack.add(m));
  parts.push(rack);

  // ---- дверь: створки вокруг окна, нижняя панель, тёмная планка над окном
  const WY0 = 0.74;
  const WY1 = 1.64;
  const door = (w, h, x, y0, m = body, name) => box(w, h, 0.05, m, x, y0, DZ + 0.025, name);
  parts.push(door(WX0 - DX0, DY1 - WY0, (DX0 + WX0) / 2, WY0, body, 'дверь слева от окна'));
  parts.push(door(DX1 - WX1, DY1 - WY0, (WX1 + DX1) / 2, WY0, body, 'дверь справа от окна'));
  parts.push(door(DX1 - DX0, WY0 - DY0, (DX0 + DX1) / 2, DY0, body, 'дверь низ'));
  parts.push(door(WX1 - WX0, DY1 - WY1, WC, WY1, dark, 'планка над окном'));
  // стык нижней панели и светлая кромка справа от окна
  parts.push(box(DX1 - DX0, 0.006, 0.004, seam, (DX0 + DX1) / 2, WY0 - 0.003, DZ + 0.051));
  parts.push(box(0.012, WY1 - WY0 + 0.1, 0.004, mat.color('#e7e3d8', 0.4, 0.4), WX1 + 0.03, WY0, DZ + 0.051));
  // рамка и стекло окна
  for (const x of [WX0 + 0.012, WX1 - 0.012]) parts.push(box(0.024, WY1 - WY0, 0.055, dark, x, WY0, DZ + 0.025));
  parts.push(box(WX1 - WX0, 0.02, 0.055, dark, WC, WY0, DZ + 0.025));
  parts.push(box(WX1 - WX0 - 0.048, WY1 - WY0 - 0.02, 0.008, glassTint, WC, WY0 + 0.02, DZ + 0.04, 'стекло'));
  // кронштейны подсветки в верхних углах окна
  for (const x of [WX0 + 0.06, WX1 - 0.06]) parts.push(cyl(0.012, 0.02, dark, x, WY1 - 0.03, DZ + 0.03, 12));

  // ручка-рычаг: розетка у левого края и хромированная ручка вправо
  const HY = 0.93;
  const HX = DX0 + 0.1;
  parts.push(rodZ(THREE, 0.03, 0.03, chrome, HX, HY, DZ + 0.065, 'ручка'));
  parts.push(box(0.2, 0.024, 0.024, chrome, HX + 0.1, HY - 0.012, DZ + 0.085));
  parts.push(rodZ(THREE, 0.014, 0.04, chrome, HX, HY, DZ + 0.075));
  // запорная планка на левой кромке
  parts.push(box(0.035, 0.26, 0.05, side, X0 + 0.0175, 0.8, DZ + 0.03, 'запор'));
  // петли справа
  for (const y of [0.3, 1.6]) parts.push(box(0.02, 0.1, 0.04, seam, DX1 + 0.006, y, DZ + 0.02));

  // ---- колонна пульта справа
  const PW = X1 - PX0;
  parts.push(box(PW, DY1 - DY0, 0.02, body, PC, DY0, BF + 0.01, 'колонна пульта'));
  parts.push(box(PW * 0.78, 0.66, 0.012, dark, PC, 0.92, BF + 0.026, 'панель управления'));
  // три индикатора с белой окантовкой
  const scr = new THREE.Group();
  scr.name = 'anim-screen';
  for (const y of [1.4, 1.28, 1.16]) {
    parts.push(box(0.08, 0.07, 0.006, white, PC, y, BF + 0.034));
    scr.add(box(0.06, 0.035, 0.004, screen, PC, y + 0.025, BF + 0.038));
  }
  parts.push(scr);
  parts.push(infoScreen(PW * 0.74, 0.34, PC, 1.305, BF + 0.0405)); // живой экран поверх индикаторов
  // надпись-строка вверху панели
  parts.push(box(PW * 0.6, 0.012, 0.004, mat.color('#9aa0a6', 0.3, 0.5), PC, 1.54, BF + 0.033));
  // красные кнопки и переключатель
  for (const y of [1.05, 0.99, 0.93]) {
    const b = rodZ(THREE, 0.016, 0.012, red, PC - 0.02, y, BF + 0.036);
    parts.push(b);
    parts.push(box(0.035, 0.006, 0.003, mat.color('#9aa0a6', 0.3, 0.5), PC + 0.03, y - 0.003, BF + 0.033));
  }
  parts.push(box(0.05, 0.03, 0.012, red, PC - 0.01, 0.97 - 0.12, BF + 0.034, 'переключатель'));
  parts.push(rodZ(THREE, 0.013, 0.012, red, PC + 0.035, 0.865, BF + 0.036));
  // откидной карман для документации
  const flap = box(PW * 0.95, 0.15, 0.03, flapMat, PC + 0.01, 0.55, BF + 0.035, 'карман');
  flap.rotation.x = -0.12;
  parts.push(flap);
  // датчик над пультом с сигнальной линзой
  parts.push(box(0.05, 0.06, 0.05, dark, X1 - 0.06, 1.72, BF + 0.035, 'датчик'));
  const lens = rodZ(THREE, 0.012, 0.006, status, X1 - 0.06, 1.75, BF + 0.063);
  lens.name = 'anim-status';
  parts.push(lens);
  // жалюзи внизу колонны
  for (const col of [-1, 1]) for (let r = 0; r < 5; r++) {
    parts.push(box(0.07, 0.008, 0.004, slot, PC + col * 0.05, 0.08 + r * 0.02, BF + 0.022));
  }

  // ---- боковины: светлые филёнки, перфорированная планка у фасада, жалюзи внизу
  for (const sx of [-1, 1]) {
    const x = sx * (X1 - 0.002); // боковина корпуса — на X1 − 3 мм, детали в пределах габарита
    parts.push(box(0.002, HOOD0 - 0.25, CZ0 - ZB + front - 0.3, side, x, 0.15, (ZB + BF) / 2 - 0.05, 'филёнка'));
    for (let i = 0; i < 46; i++) parts.push(box(0.001, 0.012, 0.02, slot, sx * (X1 - 0.0005), 0.18 + i * 0.035, BF - 0.06));
    for (const zc of [-0.55, -0.3]) for (let r = 0; r < 5; r++) {
      parts.push(box(0.001, 0.008, 0.18, slot, sx * (X1 - 0.0005), 0.07 + r * 0.02, zc));
    }
  }

  // ---- козырёк: массивный, выступает вперёд над дверью и пультом
  const HF = ZF - 0.006; // лицо козырька (надпись выступает на 6 мм до ZF)
  parts.push(box(W, HOOD1 - HOOD0, HF - ZB, hoodMat, 0, HOOD0, (HF + ZB) / 2, 'козырёк'));
  parts.push(box(W - 0.01, 0.012, 0.004, seam, 0, HOOD0 + 0.004, HF + 0.002)); // нижняя кромка

  // надпись «ZF» на козырьке — белая, правее центра (как на фото)
  const cap = 0.14;
  const logo = label('ZF', cap, white, { stroke: 0.2, gap: 0.08, depth: 0.006 });
  logo.position.set(0.04 - logo.userData.width / 2, (HOOD0 + HOOD1) / 2 - cap / 2, HF);
  logo.name = 'надпись ZF';
  parts.push(logo);
  // малая надпись на тёмной планке над окном
  const cap2 = 0.07;
  const logo2 = label('ZF', cap2, white, { stroke: 0.2, gap: 0.08, depth: 0.004 });
  logo2.position.set(WC - logo2.userData.width / 2, (WY1 + DY1) / 2 - cap2 / 2, DZ + 0.05);
  logo2.name = 'надпись ZF на двери';
  parts.push(logo2);

  // ---- крыша: корпус вентилятора и патрубок дымохода
  parts.push(cyl(0.36, 0.1, hoodMat, -0.12, HOOD1, -0.25, 48, 'вентилятор'));
  parts.push(cyl(0.3, 0.012, seam, -0.12, HOOD1 + 0.1, -0.25, 48));
  parts.push(chimney(0.13, 0.2, hoodMat, 0.36, HOOD1, 0.05));
  const steam = new THREE.Group();
  steam.name = 'anim-steam';
  steam.position.set(0.36, HOOD1 + 0.2, 0.05);
  parts.push(steam);

  // ---- чёрный въездной порог перед дверью
  const ramp = new THREE.Shape();
  ramp.moveTo(0, 0);
  ramp.lineTo(ZF - BF, 0);
  ramp.lineTo(0, 0.03);
  ramp.closePath();
  const rampGeo = new THREE.ExtrudeGeometry(ramp, { depth: DX1 - DX0, bevelEnabled: false });
  rampGeo.rotateY(-Math.PI / 2);
  rampGeo.translate(DX1, 0, BF);
  const rampMesh = new THREE.Mesh(rampGeo, dark);
  rampMesh.name = 'порог';
  parts.push(rampMesh);

  return group(parts);
}

/** Короткий цилиндр с осью вдоль Z (ручки, кнопки) */
function rodZ(THREE, r, len, material, x, y, z, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}

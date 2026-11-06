/**
 * Тележечная хлебопекарная печь DEBAG MONSUN S5 — модель по фотографии заказчика.
 * Габариты по данным заказчика: 1350 × 2960 × 2935 мм (Ш × Г × В).
 * Упрощённая геометрия: корпус, колонна с пультом слева, дверной проём с тёмными откосами, дверь с высоким
 * смотровым окном и красной ручкой, пекарная камера с вращающейся тележкой, зонт с решёткой вытяжки,
 * тёмная панель на зонте с красными полосами, индикаторами и надписью DEBAG (простым шрифтом).
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 *
 * Узлы для анимации (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-rotate — тележка вращается, пока печь работает; anim-glow — свет и жар камеры;
 *   anim-status — индикатор на пульте и подсветка под зонтом; anim-screen — дисплеи; anim-steam — вытяжка.
 */
export const meta = {
  name: 'Печь тележечная DEBAG MONSUN S5',
  units: 'm',
  note: 'По фото заказчика; габариты 1350 × 2960 × 2935 мм',
};

export function build({ THREE, mat, box, cyl, group, label: textLabel, chimney, infoScreen }) {
  const W = 1.35;
  const D = 2.96;
  const H = 2.935;
  const X0 = -W / 2;
  const X1 = W / 2;
  const ZF = D / 2; // передняя плоскость зонта
  const ZB = -D / 2; // задняя стенка
  const BF = ZF - 0.15; // лицевая плоскость нижней части (зонт выступает на 0,15 м)
  const HOOD_Y = 2.08; // низ зонта

  const steel = mat.brushed.clone();
  steel.color.set('#b7bec4');
  const steelLight = mat.color('#cfd5da', 0.6, 0.4);
  const steelEdge = mat.steel;
  const black = mat.color('#15181b', 0.3, 0.45);
  const panelGrey = mat.color('#3a434c', 0.3, 0.45);
  const glassDark = new THREE.MeshStandardMaterial({ color: '#1c2228', metalness: 0.4, roughness: 0.15 });
  const red = mat.color('#9e1f2b', 0.2, 0.4);
  const redLine = new THREE.MeshStandardMaterial({ color: '#8a1d27', emissive: '#7a121c', emissiveIntensity: 0.3, roughness: 0.3 });
  const white = mat.color('#eef1f3', 0.1, 0.4);
  const glassTint = new THREE.MeshStandardMaterial({ color: '#b9d2de', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.2 });
  const tray = mat.color('#c7ccd0', 0.8, 0.35);
  const liner = new THREE.MeshStandardMaterial({ color: '#3b3d3f', metalness: 0.5, roughness: 0.5, emissive: '#ff8a2a', emissiveIntensity: 0.35 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd59a', emissiveIntensity: 1.2 });
  const loafMat = mat.color('#c27a3a', 0, 0.85);
  const lcd = new THREE.MeshStandardMaterial({ color: '#9fd0e6', emissive: '#7cc4e4', emissiveIntensity: 0.7, roughness: 0.3 });
  const status = new THREE.MeshStandardMaterial({ color: '#3fb67e', emissive: '#3fb67e', emissiveIntensity: 1, roughness: 0.3 });

  const parts = [];

  // ---- пекарная камера (шире двери, скрыта за лицевой рамой)
  const CX0 = X0 + 0.055;
  const CX1 = X1 - 0.055;
  const CY0 = 0.06;
  const CY1 = 2.0;
  const CZ0 = BF - 1.32; // задняя стенка камеры
  const CZ1 = BF - 0.03; // передняя (за рамой)
  const cz = (CZ0 + CZ1) / 2;
  const cd = CZ1 - CZ0;

  // ---- корпус: задняя часть, стенки вокруг камеры
  parts.push(box(W - 0.04, 0.05, BF - ZB - 0.04, black, 0, 0, (BF + ZB) / 2, 'цоколь'));
  parts.push(box(W, HOOD_Y - 0.05, CZ0 - ZB, steel, 0, 0.05, (CZ0 + ZB) / 2, 'корпус'));
  parts.push(box(CX0 - X0, HOOD_Y - 0.05, BF - CZ0, steel, (X0 + CX0) / 2, 0.05, (BF + CZ0) / 2, 'боковина левая'));
  parts.push(box(X1 - CX1, HOOD_Y - 0.05, BF - CZ0, steel, (CX1 + X1) / 2, 0.05, (BF + CZ0) / 2, 'боковина правая'));
  parts.push(box(CX1 - CX0, HOOD_Y - CY1, cd, steel, 0, CY1, cz));
  parts.push(box(CX1 - CX0, CY0 - 0.05, cd, steel, 0, 0.05, cz));
  // стыки панелей на боковинах
  for (const z of [-1.0, -0.2, 0.6]) {
    parts.push(box(0.004, HOOD_Y - 0.12, 0.012, mat.color('#8d969d', 0.6, 0.45), X1 - 0.001, 0.08, z));
    parts.push(box(0.004, HOOD_Y - 0.12, 0.012, mat.color('#8d969d', 0.6, 0.45), X0 + 0.001, 0.08, z));
  }

  // облицовка камеры (светится при нагреве)
  const lin = (w, h, d, x, y0, z) => box(w, h, d, liner, x, y0, z);
  const glow = group(
    lin(CX1 - CX0, CY1 - CY0, 0.01, 0, CY0, CZ0 + 0.005),
    lin(0.01, CY1 - CY0, cd, CX0 + 0.005, CY0, cz),
    lin(0.01, CY1 - CY0, cd, CX1 - 0.005, CY0, cz),
    lin(CX1 - CX0, 0.01, cd, 0, CY1 - 0.01, cz),
    lin(CX1 - CX0, 0.01, cd, 0, CY0, cz),
    box(0.04, CY1 - CY0 - 0.4, 0.08, lamp, CX0 + 0.03, CY0 + 0.2, CZ0 + 0.3),
    box(0.04, CY1 - CY0 - 0.4, 0.08, lamp, CX1 - 0.03, CY0 + 0.2, CZ0 + 0.3),
  );
  glow.name = 'anim-glow';
  parts.push(glow);

  // тележка 18 уровней (противни 600 × 800), вращается в центре камеры
  const RW = 0.7;
  const RD = 0.9;
  const rack = new THREE.Group();
  rack.name = 'anim-rotate';
  rack.position.set(0, 0, cz);
  const rp = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rp.push(box(0.03, CY1 - CY0 - 0.22, 0.03, tray, sx * (RW / 2 - 0.015), CY0 + 0.05, sz * (RD / 2 - 0.015)));
  }
  rp.push(box(RW, 0.035, RD, tray, 0, CY0 + 0.05, 0));
  rp.push(box(RW, 0.035, 0.05, tray, 0, CY1 - 0.2, 0));
  rp.push(cyl(0.025, 0.14, tray, 0, CY1 - 0.17, 0, 12));
  const TRAYS = 18;
  const ty0 = CY0 + 0.18;
  const tStep = (CY1 - CY0 - 0.5) / (TRAYS - 1);
  for (let i = 0; i < TRAYS; i++) {
    const y = ty0 + i * tStep;
    rp.push(box(RW - 0.05, 0.008, RD - 0.05, tray, 0, y, 0));
    for (const lx of [-0.21, 0, 0.21]) {
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, RD - 0.24, 3, 8), loafMat);
      loaf.rotation.x = Math.PI / 2;
      loaf.scale.set(1, 1, 0.55);
      loaf.position.set(lx, y + 0.032, 0);
      rp.push(loaf);
    }
  }
  rp.forEach((m) => rack.add(m));
  parts.push(rack);

  // ---- лицевая рама нижней части
  const FZ = BF - 0.015; // центр лицевых панелей
  const COL1 = X0 + 0.31; // правая кромка колонны пульта
  const DOOR0 = COL1 + 0.06; // проём двери (с тёмными откосами)
  const DOOR1 = X1 - 0.12;
  // колонна пульта
  parts.push(box(COL1 - X0, HOOD_Y - 0.05, 0.03, steelLight, (X0 + COL1) / 2, 0.05, FZ, 'колонна'));
  const PX = (X0 + COL1) / 2;
  parts.push(box(0.21, 0.92, 0.012, panelGrey, PX, 0.94, BF + 0.006, 'пульт'));
  parts.push(box(0.21, 0.02, 0.014, steelEdge, PX, 1.86, BF + 0.007));
  const screens = group(
    box(0.1, 0.05, 0.004, lcd, PX - 0.01, 1.7, BF + 0.014),
    box(0.1, 0.05, 0.004, lcd, PX - 0.01, 1.56, BF + 0.014),
  );
  screens.name = 'anim-screen';
  parts.push(screens);
  parts.push(infoScreen(0.18, 0.22, PX, 1.65, BF + 0.0175)); // живой экран на пульте
  // клавиатура
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    parts.push(box(0.022, 0.016, 0.006, white, PX - 0.055 + c * 0.036, 1.42 - r * 0.04, BF + 0.014));
  }
  // круглый регулятор
  const dial = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 8, 32), white);
  dial.position.set(PX, 1.22, BF + 0.014);
  parts.push(dial);
  parts.push(cyl(0.012, 0.004, white, PX, 1.22, BF + 0.012, 16));
  for (let c = 0; c < 4; c++) parts.push(box(0.03, 0.014, 0.006, white, PX - 0.06 + c * 0.04, 1.1, BF + 0.014));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), status);
  led.position.set(PX, 1.05, BF + 0.014);
  led.name = 'anim-status';
  parts.push(led);
  // тёмные откосы проёма и правая стойка
  parts.push(box(DOOR0 - COL1, HOOD_Y - 0.05, 0.03, black, (COL1 + DOOR0) / 2, 0.05, FZ + 0.004, 'откос левый'));
  parts.push(box(0.05, HOOD_Y - 0.05, 0.03, black, DOOR1 + 0.025, 0.05, FZ + 0.004, 'откос правый'));
  parts.push(box(X1 - DOOR1 - 0.05, HOOD_Y - 0.05, 0.03, steelLight, (DOOR1 + 0.05 + X1) / 2, 0.05, FZ, 'стойка правая'));
  parts.push(box(DOOR1 - DOOR0 + 0.05, HOOD_Y - CY1 + 0.02, 0.03, black, (DOOR0 + DOOR1 + 0.05) / 2, CY1 - 0.02, FZ + 0.004));
  // петли и винты на стойках
  for (const y of [0.25, 1.85]) parts.push(box(0.03, 0.08, 0.04, steelEdge, DOOR1 + 0.025, y, BF + 0.02));
  for (const y of [0.3, 1.9]) parts.push(cyl(0.012, 0.006, steelEdge, X1 - 0.06, y, BF + 0.003, 12));

  // ---- дверь
  const DZ = BF + 0.02;
  const DY0 = 0.07;
  const DY1 = CY1 - 0.02;
  const WIN0 = DOOR0 + 0.33; // окно смещено вправо от центра
  const WIN1 = WIN0 + 0.3;
  const WY0 = 0.7;
  const WY1 = 1.86;
  parts.push(box(WIN0 - DOOR0, DY1 - DY0, 0.04, steelLight, (DOOR0 + WIN0) / 2, DY0, DZ, 'дверь'));
  parts.push(box(DOOR1 - WIN1, DY1 - DY0, 0.04, steelLight, (WIN1 + DOOR1) / 2, DY0, DZ));
  parts.push(box(WIN1 - WIN0, WY0 - DY0, 0.04, steelLight, (WIN0 + WIN1) / 2, DY0, DZ));
  parts.push(box(WIN1 - WIN0, DY1 - WY1, 0.04, steelLight, (WIN0 + WIN1) / 2, WY1, DZ));
  // стыки филёнок двери
  for (const x of [WIN0 - 0.08, WIN1 + 0.06]) parts.push(box(0.004, DY1 - DY0 - 0.04, 0.042, mat.color('#9aa3aa', 0.6, 0.4), x, DY0 + 0.02, DZ));
  // окно: стекло в тонкой рамке
  parts.push(box(WIN1 - WIN0, 0.012, 0.045, steelEdge, (WIN0 + WIN1) / 2, WY0 - 0.006, DZ));
  parts.push(box(WIN1 - WIN0 - 0.02, WY1 - WY0, 0.008, glassTint, (WIN0 + WIN1) / 2, WY0, DZ + 0.015, 'стекло'));
  // тёмная арка под окном
  const arch = new THREE.Shape();
  const aw = (WIN1 - WIN0 + 0.12) / 2;
  arch.moveTo(-aw, 0);
  arch.lineTo(aw, 0);
  arch.lineTo(aw, 0.14);
  arch.quadraticCurveTo(0, 0.24, -aw, 0.14);
  arch.closePath();
  const archGeo = new THREE.ExtrudeGeometry(arch, { depth: 0.006, bevelEnabled: false });
  const archMesh = new THREE.Mesh(archGeo, panelGrey);
  archMesh.position.set((WIN0 + WIN1) / 2, 0.42, DZ + 0.02);
  archMesh.name = 'арка';
  parts.push(archMesh);
  // красная ручка
  const HY = 1.02;
  parts.push(box(0.3, 0.035, 0.035, red, DOOR0 + 0.17, HY, DZ + 0.09, 'ручка'));
  parts.push(box(0.035, 0.03, 0.09, steelEdge, DOOR0 + 0.05, HY + 0.003, DZ + 0.045));
  parts.push(box(0.035, 0.03, 0.09, steelEdge, DOOR0 + 0.28, HY + 0.003, DZ + 0.045));

  // ---- зонт
  parts.push(box(W, H - HOOD_Y - 0.03, ZF - 0.03 - ZB, steel, 0, HOOD_Y, (ZF - 0.03 + ZB) / 2, 'зонт'));
  // решётка вытяжки под выступом зонта
  parts.push(box(W - 0.16, 0.01, 0.13, black, 0, HOOD_Y - 0.008, BF + 0.075));
  for (let i = 0; i < 26; i++) parts.push(box(0.008, 0.012, 0.13, steelEdge, X0 + 0.1 + i * 0.044, HOOD_Y - 0.014, BF + 0.075));
  // подсветка под зонтом (цвет состояния)
  const glowStrip = box(W - 0.2, 0.012, 0.012, status, 0, HOOD_Y - 0.016, ZF - 0.045);
  glowStrip.name = 'anim-status-strip';
  parts.push(glowStrip);
  // тёмная панель на лицевой стороне зонта, выступает над крышей
  const PNL0 = X0 + 0.39;
  const PNL1 = X1 - 0.08;
  const PW = PNL1 - PNL0;
  const PC = (PNL0 + PNL1) / 2;
  const PY0 = HOOD_Y + 0.13;
  parts.push(box(PW, H - PY0, 0.03, glassDark, PC, PY0, ZF - 0.015, 'панель зонта'));
  parts.push(box(PW, 0.03, 0.18, glassDark, PC, H - 0.03, ZF - 0.09, 'козырёк'));
  parts.push(box(PW, 0.006, 0.004, redLine, PC, PY0 + 0.25, ZF + 0.001));
  parts.push(box(PW, 0.006, 0.004, redLine, PC, PY0 + 0.12, ZF + 0.001));
  const hoodScreens = group(
    box(0.08, 0.05, 0.004, lcd, PC - 0.22, PY0 + 0.16, ZF + 0.001),
    box(0.08, 0.05, 0.004, lcd, PC - 0.11, PY0 + 0.16, ZF + 0.001),
  );
  hoodScreens.name = 'anim-screen-hood';
  parts.push(hoodScreens);
  parts.push(infoScreen(0.32, 0.1, PC - 0.165, PY0 + 0.185, ZF + 0.0035, 'info-screen-hood')); // живой экран на зонте

  // надпись DEBAG (простые блочные буквы)
  const label = textLabel('DEBAG', 0.055, white);
  label.position.set(PNL1 - 0.06 - label.userData.width, PY0 + 0.165, ZF - 0.001);
  label.name = 'надпись DEBAG';
  parts.push(label);

  // вытяжка на крыше
  parts.push(chimney(0.15, 0.03, steelEdge, 0, H - 0.03, -0.9));
  const steam = new THREE.Group();
  steam.name = 'anim-steam';
  steam.position.set(0, H, -0.9);
  parts.push(steam);

  return group(parts);
}

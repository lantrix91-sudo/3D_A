/**
 * Ротационная (тележечная) печь MIWE roll-in e+ — модель по фотографии заказчика.
 * Габариты по данным заказчика: 1550 × 1600 × 2560 мм (Ш × Г × В).
 * Упрощённая геометрия: корпус, зонт с наклонной крышей, пульт слева, дверь со смотровым окном, пекарная
 * камера с вращающейся тележкой и противнями, ручка, решётка вентиляции, панели боковин, порог.
 * На зонте — надпись «MIWE roll-in» простым шрифтом, на крыше — патрубок дымохода.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-rotate — тележка вращается вокруг вертикальной оси, пока печь работает;
 *   anim-glow   — освещение и жар камеры (яркость зависит от температуры);
 *   anim-status — световая полоса под зонтом окрашивается в цвет состояния;
 *   anim-screen — экран пульта светится, пока печь на связи и работает;
 *   anim-steam  — точка выхода пара/вытяжки над зонтом.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Печь ротационная MIWE roll-in e+',
  units: 'm',
  note: 'По фото заказчика; габариты 1550 × 1600 × 2560 мм',
};

export function build({ THREE, mat, box, cyl, rodX, group, label, chimney, infoScreen }) {
  const W = 1.55; // ширина
  const H = 2.56; // высота
  const ZF = 0.8; // передняя кромка зонта
  const ZB = -0.8; // задняя стенка
  const BF = 0.7; // лицевая плоскость корпуса (зонт выступает на 0,1 м)
  const BODY_H = 2.3;
  const X0 = -W / 2;

  const steel = mat.brushed.clone();
  steel.color.set('#b4bcc3');
  const steelEdge = mat.steel;
  const yellow = mat.color('#f5b800', 0.05, 0.4);
  const dark = mat.color('#1c2024', 0.2, 0.5);
  const seam = mat.color('#8d969d', 0.6, 0.45);
  const glassTint = new THREE.MeshStandardMaterial({ color: '#a9c7d6', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22 });
  const tray = mat.color('#c7ccd0', 0.8, 0.35);
  const strip = new THREE.MeshStandardMaterial({ color: '#7fc4c9', emissive: '#7fc4c9', emissiveIntensity: 0.4, roughness: 0.2 });
  const liner = new THREE.MeshStandardMaterial({ color: '#3a3c3e', metalness: 0.5, roughness: 0.5, emissive: '#ff8a2a', emissiveIntensity: 0.35 });
  const lamp = new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd59a', emissiveIntensity: 1.2 });
  const loafMat = mat.color('#c27a3a', 0, 0.85);
  const screen = new THREE.MeshStandardMaterial({ color: '#0e1418', emissive: '#3b6e8a', emissiveIntensity: 0.55, roughness: 0.3 });

  const parts = [];

  // проём двери и пекарная камера
  const DX0 = X0 + 0.37;
  const DX1 = W / 2 - 0.05;
  const DW = DX1 - DX0;
  const DC = (DX0 + DX1) / 2;
  const DY0 = 0.09;
  const DY1 = 2.03;
  const DZ = BF + 0.03;
  const CX0 = DX0 + 0.005; // камера по ширине (внутри проёма двери — без щелей)
  const CX1 = DX1 - 0.005;
  const CY0 = DY0 + 0.005; // по высоте
  const CY1 = DY1 - 0.005;
  const CZ0 = BF - 1.04; // задняя стенка камеры

  // ---- цоколь и корпус: задняя часть целиком, вокруг камеры — стенки (камера открыта к двери)
  parts.push(box(W - 0.04, 0.07, BF - ZB - 0.06, seam, 0, 0, (BF + ZB) / 2 - 0.01, 'цоколь'));
  parts.push(box(W, BODY_H - 0.07, CZ0 - ZB, steel, 0, 0.07, (CZ0 + ZB) / 2, 'корпус'));
  const front = BF - CZ0;
  const fz = (BF + CZ0) / 2;
  parts.push(box(CX0 - X0, BODY_H - 0.07, front, steel, (X0 + CX0) / 2, 0.07, fz, 'корпус слева'));
  parts.push(box(W / 2 - CX1, BODY_H - 0.07, front, steel, (CX1 + W / 2) / 2, 0.07, fz, 'корпус справа'));
  parts.push(box(CX1 - CX0, BODY_H - CY1, front, steel, (CX0 + CX1) / 2, CY1, fz, 'корпус сверху'));
  parts.push(box(CX1 - CX0, CY0 - 0.07, front, steel, (CX0 + CX1) / 2, 0.07, fz, 'корпус снизу'));

  // облицовка камеры: светится тёплым светом, пока печь греет
  const lin = (w, h, d, x, y0, z) => box(w, h, d, liner, x, y0, z);
  const glow = group(
    lin(CX1 - CX0, CY1 - CY0, 0.01, (CX0 + CX1) / 2, CY0, CZ0 + 0.005),
    lin(0.01, CY1 - CY0, front, CX0 + 0.005, CY0, fz),
    lin(0.01, CY1 - CY0, front, CX1 - 0.005, CY0, fz),
    lin(CX1 - CX0, 0.01, front, (CX0 + CX1) / 2, CY1 - 0.01, fz),
    lin(CX1 - CX0, 0.01, front, (CX0 + CX1) / 2, CY0, fz),
    // ламповые панели в углах камеры
    box(0.03, CY1 - CY0 - 0.3, 0.06, lamp, CX0 + 0.03, CY0 + 0.15, CZ0 + 0.06),
    box(0.03, CY1 - CY0 - 0.3, 0.06, lamp, CX1 - 0.03, CY0 + 0.15, CZ0 + 0.06),
  );
  glow.name = 'anim-glow';
  parts.push(glow);

  // тележка с противнями: вращается вокруг вертикальной оси в центре камеры
  const RW = 0.64; // ширина тележки
  const RD = 0.74; // глубина
  const rack = new THREE.Group();
  rack.name = 'anim-rotate';
  rack.position.set(DC, 0, (CZ0 + BF) / 2 - 0.01);
  const rackParts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    rackParts.push(box(0.025, CY1 - CY0 - 0.2, 0.025, tray, sx * (RW / 2 - 0.0125), CY0 + 0.05, sz * (RD / 2 - 0.0125)));
  }
  rackParts.push(box(RW, 0.03, RD, tray, 0, CY0 + 0.05, 0)); // рама снизу
  rackParts.push(box(RW, 0.03, 0.04, tray, 0, CY1 - 0.18, 0)); // траверса подвеса
  rackParts.push(cyl(0.02, 0.12, tray, 0, CY1 - 0.15, 0, 12)); // крюк вращения
  const TRAYS = 18;
  const ty0 = CY0 + 0.16;
  const tStep = (CY1 - CY0 - 0.46) / (TRAYS - 1);
  for (let i = 0; i < TRAYS; i++) {
    const y = ty0 + i * tStep;
    rackParts.push(box(RW - 0.04, 0.008, RD - 0.04, tray, 0, y, 0));
    for (const lx of [-0.19, 0, 0.19]) {
      const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, RD - 0.2, 3, 8), loafMat);
      loaf.rotation.x = Math.PI / 2;
      loaf.scale.set(1, 1, 0.55);
      loaf.position.set(lx, y + 0.03, 0);
      rackParts.push(loaf);
    }
  }
  rackParts.forEach((m) => rack.add(m));
  parts.push(rack);

  // вертикальные стыки панелей на правой и левой боковинах
  for (const z of [-0.45, -0.05, 0.35]) {
    parts.push(box(0.004, BODY_H - 0.12, 0.012, seam, W / 2 - 0.001, 0.08, z));
    parts.push(box(0.004, BODY_H - 0.12, 0.012, seam, -W / 2 + 0.001, 0.08, z));
  }

  // ---- зонт: профиль в плоскости YZ, выдавлен по ширине
  const s = new THREE.Shape();
  s.moveTo(ZF, 2.06); // низ передней кромки
  s.lineTo(ZF, 2.33); // верх передней кромки
  s.lineTo(0.28, H); // наклонная крыша
  s.lineTo(ZB, H); // плоская часть до задней стенки
  s.lineTo(ZB, BODY_H);
  s.lineTo(BF, BODY_H);
  s.lineTo(BF, 2.06);
  s.closePath();
  const hoodGeo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false });
  // Shape строится в XY: x → Z, y → Y; выдавливание по Z → X
  hoodGeo.rotateY(-Math.PI / 2);
  hoodGeo.translate(W / 2, 0, 0);
  hoodGeo.computeVertexNormals();
  const hood = new THREE.Mesh(hoodGeo, steel);
  hood.name = 'зонт';
  parts.push(hood);
  // световая полоса под зонтом и жёлтый акцент над пультом
  parts.push(box(W - 0.02, 0.028, 0.03, strip, 0, 2.03, ZF - 0.016, 'anim-status')); // под кромкой зонта
  parts.push(box(0.32, 0.014, 0.022, yellow, X0 + 0.17, 2.052, ZF - 0.01));
  // крепёжные винты на кромке
  for (const x of [X0 + 0.08, W / 2 - 0.08]) parts.push(rodZ(THREE, 0.012, 0.01, steelEdge, x, 2.02, BF + 0.005));

  // ---- пульт слева (колонна)
  const PX = X0 + 0.19; // центр колонны
  const PW = 0.29;
  parts.push(box(PW + 0.04, 1.95, 0.02, steelEdge, PX, 0.07, BF + 0.01, 'рама пульта'));
  parts.push(box(PW, 0.18, 0.02, yellow, PX, 1.82, BF + 0.02, 'пульт верх'));
  parts.push(box(PW * 0.6, 0.012, 0.012, steelEdge, PX, 1.94, BF + 0.035));
  parts.push(cyl(0.012, 0.01, steelEdge, PX, 1.995, BF + 0.03, 12));
  parts.push(box(PW, 0.55, 0.02, dark, PX, 1.26, BF + 0.02, 'панель управления'));
  parts.push(box(PW * 0.7, 0.24, 0.006, screen, PX, 1.48, BF + 0.032, 'anim-screen'));
  parts.push(infoScreen(PW * 0.8, 0.26, PX, 1.48 + 0.12, BF + 0.0365)); // живой экран поверх дисплея пульта
  parts.push(box(PW, 1.0, 0.02, yellow, PX, 0.24, BF + 0.02, 'пульт низ'));
  parts.push(box(PW * 0.85, 0.012, 0.014, steelEdge, PX, 1.205, BF + 0.034, 'ручка панели'));
  // решётка вентиляции
  parts.push(box(PW, 0.15, 0.02, steelEdge, PX, 0.08, BF + 0.02, 'решётка'));
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
    parts.push(box(0.012, 0.012, 0.006, dark, PX - 0.11 + c * 0.0275, 0.1 + r * 0.03, BF + 0.032));
  }

  // ---- дверь (закрывает камеру, кроме смотрового окна)
  const WIN0 = DC - 0.04 - 0.19; // смотровое окно ~0,38 м, чуть левее центра
  const WIN1 = DC - 0.04 + 0.19;
  // створки по сторонам окна
  parts.push(box(WIN0 - DX0, DY1 - DY0, 0.05, steel, (DX0 + WIN0) / 2, DY0, DZ, 'дверь левая'));
  parts.push(box(DX1 - WIN1, DY1 - DY0, 0.05, steel, (WIN1 + DX1) / 2, DY0, DZ, 'дверь правая'));
  // рамка окна: тёмная верхняя часть и нижняя планка
  parts.push(box(WIN1 - WIN0, 0.16, 0.05, dark, (WIN0 + WIN1) / 2, DY1 - 0.16, DZ, 'окно верх'));
  parts.push(box(WIN1 - WIN0, 0.06, 0.05, steel, (WIN0 + WIN1) / 2, DY0, DZ));
  for (const x of [WIN0 + 0.012, WIN1 - 0.012]) parts.push(box(0.024, DY1 - DY0 - 0.22, 0.055, dark, x, DY0 + 0.06, DZ));
  // стекло
  parts.push(box(WIN1 - WIN0 - 0.04, DY1 - DY0 - 0.22, 0.01, glassTint, (WIN0 + WIN1) / 2, DY0 + 0.06, DZ + 0.02, 'стекло'));

  // ручка: круглая головка и вертикальная тяга
  const HX = (DX0 + WIN0) / 2;
  parts.push(rodZ(THREE, 0.04, 0.04, dark, HX, 1.13, DZ + 0.045, 'ручка'));
  parts.push(rodZ(THREE, 0.018, 0.04, steelEdge, HX, 1.13, DZ + 0.03));
  parts.push(box(0.018, 0.4, 0.018, steelEdge, HX, 0.75, DZ + 0.045, 'тяга'));
  parts.push(box(0.03, 0.02, 0.05, steelEdge, HX, 0.75, DZ + 0.03));
  parts.push(box(0.03, 0.02, 0.05, steelEdge, HX, 1.11, DZ + 0.03));

  // петли справа
  for (const y of [0.35, 1.75]) parts.push(box(0.025, 0.12, 0.04, seam, DX1 + 0.0125, y, DZ));

  // порог-пандус перед дверью (въезд тележки)
  const ramp = new THREE.Shape();
  ramp.moveTo(0, 0);
  ramp.lineTo(0.09, 0);
  ramp.lineTo(0, 0.025);
  ramp.closePath();
  const rampGeo = new THREE.ExtrudeGeometry(ramp, { depth: DW, bevelEnabled: false });
  rampGeo.rotateY(-Math.PI / 2);
  rampGeo.translate(DX1, 0, BF);
  const rampMesh = new THREE.Mesh(rampGeo, steelEdge);
  rampMesh.name = 'порог';
  parts.push(rampMesh);

  // надпись на лицевой кромке зонта
  const ink = mat.color('#16191c', 0.2, 0.5);
  const inkGrey = mat.color('#4a5056', 0.3, 0.5);
  const capH = 0.075;
  const word1 = label('MIWE', capH, ink, { stroke: 0.21 });
  word1.position.set(X0 + 0.07, 2.155, ZF - 0.003);
  word1.name = 'надпись MIWE';
  parts.push(word1);
  const word2 = label('roll-in', capH, inkGrey, { lowerStroke: 0.12, gap: 0.1 });
  word2.position.set(X0 + 0.07 + word1.userData.width + capH * 0.35, 2.155, ZF - 0.003);
  word2.name = 'надпись roll-in';
  parts.push(word2);

  // дымоход на плоской части крыши
  parts.push(chimney(0.12, 0.035, steelEdge, 0.25, H - 0.035, -0.35));

  // точка выхода пара (дымоход на крыше зонта)
  const steam = new THREE.Group();
  steam.name = 'anim-steam';
  steam.position.set(0.25, H, -0.35);
  parts.push(steam);

  return group(parts);
}

/** Короткий цилиндр с осью вдоль Z (ручки, винты) */
function rodZ(THREE, r, len, material, x, y, z, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 24), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}

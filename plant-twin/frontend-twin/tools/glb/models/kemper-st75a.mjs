/**
 * Спиральный тестомес Kemper ST 75 A (съёмная дежа на тележке) — модель по фотографии заказчика.
 * Габариты по данным заказчика: ширина 820 мм, длина (глубина) 1500 мм, высота 1320 мм.
 * Упрощённая геометрия: колонна-станина сзади, голова с жёлтой полосой и пультом (два таймера, кнопки,
 * переключатели), надпись KEMPER на голове, круглая крышка дежи, спираль и отбойник, дежа из нержавейки
 * на тележке с жёлтыми колёсами и ручкой по центру; слева — шкаф управления (лампы, аварийный стоп,
 * вводной выключатель). Со шкафом ширина установки ≈ 0,98 м (сам тестомес — 0,82 м).
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-bowl     — дежа вращается вокруг своей оси (≈12 об/мин), пока тестомес работает;
 *   anim-spin-rev — спираль (месильный орган) вращается быстро и в ПРОТИВОПОЛОЖНУЮ сторону;
 *   anim-status   — зелёные лампы на пульте и на шкафу окрашиваются в цвет состояния;
 *   anim-display  — белая лампа «В работе» на шкафу горит, только пока тестомес работает.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона (дежа) в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Тестомес Kemper ST 75 A',
  units: 'm',
  note: 'По фото заказчика; габариты 820 × 1500 × 1320 мм (Ш × Г × В)',
};

export function build({ THREE, mat, box, cyl, group, label, infoScreen }) {
  const W = 0.82;
  const D = 1.5;
  const H = 1.32;
  const ZB = -D / 2;
  const ZF = D / 2;

  const cream = mat.color('#ebe8e1', 0.1, 0.45);
  const creamDark = mat.color('#d9d5cc', 0.1, 0.5);
  const yellow = mat.color('#f2c21b', 0.1, 0.4);
  const steel = mat.color('#d0d4d7', 0.4, 0.34); // нержавейка (умеренная металличность — светлая и без карты отражений)
  const steelDark = mat.color('#a9aeb2', 0.4, 0.4);
  const grey = mat.color('#5d6267', 0.3, 0.5);
  const black = mat.color('#17191b', 0.2, 0.5);
  const white = mat.color('#f6f6f4', 0.05, 0.4);
  const dough = mat.color('#ecd27a', 0, 0.9);
  const rimWhite = mat.color('#f1f1ee', 0.05, 0.35);

  const parts = [];

  // ---- дежа: ось вращения
  const BZ = 0.27; // центр дежи по глубине
  const BR = 0.355; // радиус по верхней кромке
  const B0 = 0.13; // низ дежи
  const B1 = 0.62; // верхняя кромка

  // ---- колонна-станина сзади
  const CW = 0.62;
  parts.push(box(CW, 0.88, 0.58, cream, 0, 0, ZB + 0.29, 'станина'));
  parts.push(box(CW + 0.02, 0.05, 0.6, creamDark, 0, 0, ZB + 0.3, 'цоколь'));
  // съёмные панели станины
  for (const sx of [-1, 1]) parts.push(box(0.004, 0.6, 0.4, creamDark, sx * (CW / 2 + 0.002), 0.18, ZB + 0.3));
  parts.push(box(0.4, 0.5, 0.004, creamDark, 0, 0.25, ZB + 0.582, 'панель'));
  // низкая платформа под тележку (стыковка)
  parts.push(box(0.5, 0.05, 0.3, creamDark, 0, 0, ZB + 0.72, 'упор тележки'));

  // ---- голова: нижняя часть (сужается вниз), жёлтая полоса, верхний короб с пультом
  const HEAD_Z0 = ZB + 0.02;
  const HEAD_Z1 = 0.44;
  // нижняя часть головы — профиль в YZ, выдавлен по ширине
  const lower = new THREE.Shape();
  lower.moveTo(HEAD_Z0, 0.88);
  lower.lineTo(HEAD_Z1 - 0.06, 0.9);
  lower.lineTo(HEAD_Z1, 1.08);
  lower.lineTo(HEAD_Z0, 1.08);
  lower.closePath();
  parts.push(extrudeX(THREE, lower, 0.66, cream, 'голова низ'));
  // жёлтая полоса
  parts.push(box(0.68, 0.028, HEAD_Z1 - HEAD_Z0 + 0.02, yellow, 0, 1.08, (HEAD_Z0 + HEAD_Z1) / 2 + 0.005, 'жёлтая полоса'));
  // верхний короб: высокий спереди (пульт), длинный скат назад
  const upper = new THREE.Shape();
  upper.moveTo(HEAD_Z0 + 0.02, 1.108);
  upper.lineTo(HEAD_Z1 - 0.005, 1.108);
  upper.lineTo(HEAD_Z1 - 0.025, H - 0.02);
  upper.lineTo(HEAD_Z1 - 0.06, H);
  upper.lineTo(0.08, H);
  upper.lineTo(HEAD_Z0 + 0.06, 1.2);
  upper.lineTo(HEAD_Z0 + 0.02, 1.19);
  upper.closePath();
  parts.push(extrudeX(THREE, upper, 0.62, cream, 'голова верх'));

  // ---- пульт на лицевой стороне верхнего короба (слегка наклонён назад)
  const panel = new THREE.Group();
  panel.name = 'пульт';
  panel.position.set(0, 1.215, HEAD_Z1 - 0.012);
  panel.rotation.x = -0.1;
  const pz = 0.004;
  // два таймера в чёрных рамках
  for (const [x, dial] of [[-0.06, 'reg'], [0.06, 'clock']]) {
    panel.add(box(0.105, 0.105, 0.006, black, x, -0.05, pz));
    panel.add(box(0.092, 0.092, 0.004, white, x, -0.044, pz + 0.004));
    const face = new THREE.Mesh(new THREE.CircleGeometry(dial === 'clock' ? 0.036 : 0.012, 32), dial === 'clock' ? mat.color('#e9ecee', 0.2, 0.4) : black);
    face.position.set(x, 0.002, pz + 0.0065);
    panel.add(face);
    if (dial === 'clock') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.002, 6, 32), grey);
      ring.position.set(x, 0.002, pz + 0.007);
      panel.add(ring);
    }
    const hand = box(0.003, 0.03, 0.001, black, x, -0.004, pz + 0.008);
    hand.rotation.z = dial === 'clock' ? -0.7 : 0.4;
    panel.add(hand);
  }
  // кнопки слева: две серые и переключатель
  for (const y of [0.03, -0.02]) panel.add(knob(THREE, 0.015, grey, -0.19, y, pz));
  panel.add(knob(THREE, 0.016, black, -0.19, -0.075, pz));
  panel.add(box(0.03, 0.006, 0.006, black, -0.19, -0.078, pz + 0.014));
  panel.add(box(0.03, 0.008, 0.002, mat.color('#d24a2a', 0.1, 0.5), -0.19, -0.042, pz + 0.002));
  // переключатель под таймерами
  panel.add(knob(THREE, 0.016, black, 0.0, -0.105, pz));
  panel.add(box(0.03, 0.006, 0.006, black, 0.0, -0.108, pz + 0.014));
  // кнопки справа: зелёная, зелёная (лампа «Работа»), красная
  const green = new THREE.MeshStandardMaterial({ color: '#2f9e57', emissive: '#2f9e57', emissiveIntensity: 0.3, roughness: 0.35 });
  panel.add(knob(THREE, 0.017, green, 0.19, 0.03, pz));
  const run = knob(THREE, 0.017, new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1, roughness: 0.35 }), 0.19, -0.022, pz);
  run.name = 'anim-status';
  panel.add(run);
  panel.add(knob(THREE, 0.017, mat.color('#c8262b', 0.1, 0.4), 0.19, -0.075, pz));
  parts.push(panel);

  // ---- надпись KEMPER на нижней части головы (тёмно-серая)
  const cap = 0.052;
  const word = label('KEMPER', cap, mat.color('#3f4448', 0.2, 0.5), { stroke: 0.2, gap: 0.1, depth: 0.003 });
  // лицевая грань нижней части головы наклонена: от (z 0,38; y 0,90) до (z 0,44; y 1,08)
  const tilt = Math.atan2(0.06, 0.18);
  const wy = 0.955;
  const wz = HEAD_Z1 - 0.06 + 0.06 * ((wy - 0.9) / 0.18) + 0.002;
  word.position.set(-word.userData.width / 2 + 0.03, wy, wz);
  word.rotation.x = tilt; // верх букв наклонён вперёд вместе с гранью
  word.name = 'надпись KEMPER';
  parts.push(word);
  // жёлтая точка-акцент слева от надписи (элемент окраски, не логотип)
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.014, 24), yellow);
  dot.position.set(-word.userData.width / 2 - 0.005, wy + cap / 2, wz + 0.004 + Math.tan(tilt) * (cap / 2));
  dot.rotation.x = tilt;
  parts.push(dot);

  // ---- кронштейн и крышка дежи (белый обод, стальной верх с прорезями)
  parts.push(box(0.06, 0.06, 0.08, steelDark, 0, 0.86, BZ - 0.12, 'кронштейн крышки'));
  const LID_R = 0.41;
  parts.push(cyl(LID_R, 0.05, rimWhite, 0, 0.8, BZ, 64, 'крышка'));
  parts.push(cyl(LID_R - 0.01, 0.006, steel, 0, 0.85, BZ, 64));
  for (let i = 0; i < 4; i++) {
    const slot = box(0.08, 0.002, 0.03, black, 0.08 + i * 0.07, 0.856, BZ + 0.12 - i * 0.012);
    slot.rotation.y = 0.25;
    parts.push(slot);
  }

  // ---- отбойник (вертикальная планка) — неподвижен
  parts.push(box(0.05, 0.36, 0.02, steel, 0.07, 0.44, BZ - 0.02, 'отбойник'));

  // ---- спираль: вращается быстро в обратную сторону (anim-spin-rev); ось смещена от центра дежи
  const spiral = new THREE.Group();
  spiral.name = 'anim-spin-rev';
  spiral.position.set(-0.11, 0, BZ + 0.02);
  spiral.add(cyl(0.022, 0.16, steel, 0, 0.64, 0, 16)); // вал
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 2 * 1.15;
    const r = 0.03 + 0.07 * Math.min(1, t * 1.6);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.66 - t * 0.42, Math.sin(a) * r));
  }
  const helix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.016, 10, false), steel);
  helix.name = 'спираль';
  spiral.add(helix);
  parts.push(spiral);

  // ---- дежа на тележке: вращается (anim-bowl) вместе с тестом
  const bowl = new THREE.Group();
  bowl.name = 'anim-bowl';
  bowl.position.set(0, 0, BZ);
  const prof = [
    new THREE.Vector2(0, B0),
    new THREE.Vector2(0.27, B0),
    new THREE.Vector2(0.3, B0 + 0.03),
    new THREE.Vector2(BR - 0.01, B1 - 0.03),
    new THREE.Vector2(BR, B1),
    new THREE.Vector2(BR - 0.012, B1),
    new THREE.Vector2(BR - 0.022, B1 - 0.03),
    new THREE.Vector2(0.288, B0 + 0.04),
    new THREE.Vector2(0.26, B0 + 0.012),
    new THREE.Vector2(0, B0 + 0.012),
  ];
  const bowlMat = steel.clone();
  bowlMat.side = THREE.DoubleSide;
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), bowlMat);
  shell.name = 'дежа';
  bowl.add(shell);
  // кольцевые отметки на стенке (видно вращение)
  for (const a of [0.3, 2.4, 4.4]) {
    const mark = box(0.05, 0.01, 0.004, steelDark, Math.cos(a) * (BR - 0.025), 0.42, Math.sin(a) * (BR - 0.025));
    mark.rotation.y = -a + Math.PI / 2;
    bowl.add(mark);
  }
  // тесто: несколько комков, смещённых от центра
  for (const [x, z, r] of [[0.08, 0.05, 0.11], [-0.04, 0.1, 0.09], [0.13, -0.06, 0.08], [0.0, -0.02, 0.1]]) {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), dough);
    lump.scale.set(1.2, 0.5, 1.1);
    lump.position.set(x, B0 + 0.06, z);
    bowl.add(lump);
  }
  parts.push(bowl);

  // тележка: белое основание, жёлтые колёса, ручка спереди справа
  parts.push(box(0.6, 0.07, 0.62, cream, 0, 0.06, BZ + 0.02, 'тележка'));
  parts.push(cyl(0.2, 0.03, steelDark, 0, 0.1, BZ, 32)); // опора дежи
  for (const [x, z] of [[-0.24, BZ - 0.24], [0.24, BZ - 0.24], [-0.24, BZ + 0.26], [0.24, BZ + 0.26]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 20), yellow);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.05, z);
    parts.push(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12), grey);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.05, z);
    parts.push(hub);
  }
  // ручка тележки — по центру: две стойки и поперечина
  const HZ = ZF - 0.012;
  for (const x of [-0.09, 0.09]) parts.push(cyl(0.012, 0.6, rimWhite, x, 0.13, HZ, 12));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 12), rimWhite);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.73, HZ);
  parts.push(bar);
  parts.push(box(0.2, 0.025, 0.12, rimWhite, 0, 0.13, HZ - 0.06)); // крепление ручки к тележке

  // ---- шкаф управления слева от станины (нержавейка): лампы, аварийный стоп, вводной выключатель
  const SW = 0.24; // ширина (X)
  const SD = 0.3; // глубина (Z)
  const SH = 0.95; // высота
  const SX = -CW / 2 - 0.02 - SW / 2; // зазор 2 см от станины
  const SZ = ZB + 0.42; // ближе к лицевой стороне станины
  const SF = SZ + SD / 2; // лицевая грань шкафа
  const cab = mat.color('#c9cdd1', 0.4, 0.36);
  parts.push(box(SW, SH, SD, cab, SX, 0, SZ, 'шкаф управления'));
  parts.push(box(SW - 0.03, SH - 0.06, 0.004, mat.color('#b9bec2', 0.4, 0.4), SX, 0.03, SF + 0.002, 'дверца шкафа'));
  parts.push(box(0.01, 0.12, 0.012, steelDark, SX - SW / 2 + 0.025, 0.42, SF + 0.008, 'замок'));
  // верхний ряд: белая лампа «В работе», аварийный стоп (жёлтое кольцо, красный гриб), зелёная лампа «Сеть»
  const lampY = 0.84;
  const runLamp = new THREE.MeshStandardMaterial({ color: '#f4f4f0', emissive: '#ffffff', emissiveIntensity: 1.2, roughness: 0.3 });
  const wl = knob(THREE, 0.016, runLamp, SX - 0.07, lampY, SF);
  wl.name = 'anim-display'; // горит, только пока тестомес работает
  parts.push(wl);
  parts.push(knob(THREE, 0.026, yellow, SX, lampY, SF));
  parts.push(knob(THREE, 0.017, mat.color('#c8262b', 0.1, 0.4), SX, lampY, SF + 0.012));
  const gl = knob(THREE, 0.016, new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1, roughness: 0.3 }), SX + 0.07, lampY, SF);
  gl.name = 'anim-status-cabinet'; // цвет состояния, как лампа на пульте
  parts.push(gl);
  // вводной выключатель: жёлтая площадка и красная ручка
  parts.push(box(0.085, 0.085, 0.01, yellow, SX, 0.66, SF + 0.005, 'вводной выключатель'));
  parts.push(knob(THREE, 0.026, mat.color('#c8262b', 0.1, 0.4), SX, 0.703, SF + 0.008));
  parts.push(box(0.016, 0.07, 0.022, mat.color('#c8262b', 0.1, 0.4), SX, 0.668, SF + 0.025));
  // живой экран на внешней боковине шкафа (у тестомеса нет дисплея — только стрелочные таймеры;
  // спереди шкаф частично закрыт дежой и крышкой, поэтому экран смотрит влево, −X)
  parts.push(infoScreen(0.22, 0.15, SX - SW / 2 - 0.0015, 0.62, SZ, 'info-screen', -Math.PI / 2));
  // кабель-канал от шкафа к станине
  parts.push(box(0.02 + 0.02, 0.04, 0.04, steelDark, -CW / 2 - 0.01, 0.3, SZ - 0.05, 'кабель'));

  return group(parts);
}

/** Профиль в плоскости YZ, выдавленный по ширине X и отцентрованный */
function extrudeX(THREE, shape, width, material, name) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.name = name;
  return m;
}

/** Круглая кнопка/переключатель на пульте (ось вдоль Z) */
function knob(THREE, r, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 20), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z + 0.006);
  return m;
}

/**
 * Планетарный миксер TeknoStamap TK2 80 л — модель по фотографии заказчика.
 * Габариты по данным заказчика (Ш × Г × В): 986 × 1069 × 1842 мм.
 * Упрощённая геометрия: П-образная станина из двух опорных балок с серыми опорами, колонна с головой под
 * чёрной крышкой, пульт на лицевой стороне головы (индикатор, мембранные кнопки, переключатель, синяя
 * кнопка, аварийный стоп), перфорированная защитная решётка, венчик, дежа 80 л с ручками на подъёмнике и
 * тележке с колёсиками; надпись TeknoStamap на боковине головы и на крышке; переключатель и таблички сбоку.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-orbit    — планетарная головка: венчик обходит дежу по кругу (~40 об/мин), пока миксер работает;
 *   anim-spin-rev — венчик вращается вокруг своей оси быстро и в обратную сторону (внутри anim-orbit);
 *   anim-display  — красный индикатор пульта горит, только пока миксер работает;
 *   anim-status   — светодиод на пульте окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона (дежа) в +Z, низ на y = 0.
 */
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const meta = {
  name: 'Планетарный миксер TeknoStamap TK2 80',
  units: 'm',
  note: 'По фото заказчика; габариты 986 × 1069 × 1842 мм (Ш × Г × В)',
};

export function build({ THREE, mat, box, cyl, group, label, infoScreen }) {
  const W = 0.986;
  const D = 1.069;
  const H = 1.842;
  const ZF = D / 2;
  const ZB = -D / 2;

  const paint = mat.color('#a3a6a9', 0.35, 0.42); // серый металлик корпуса
  const paintDark = mat.color('#8d9094', 0.35, 0.45);
  const feet = mat.color('#d4d6d8', 0.1, 0.5);
  const black = mat.color('#1b1d1f', 0.2, 0.45);
  const steel = mat.color('#d0d4d7', 0.4, 0.32);
  const steelDark = mat.color('#a9aeb2', 0.4, 0.4);
  const panelMat = mat.color('#c9d1d8', 0.1, 0.5);
  const dark = mat.color('#2a2e33', 0.2, 0.5);
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const red = mat.color('#d0262b', 0.1, 0.4);
  const blue = mat.color('#2f6fb8', 0.1, 0.4);
  const orange = mat.color('#e05a2a', 0.1, 0.45);
  const whiteM = mat.color('#f3f3f1', 0.05, 0.5);

  const parts = [];
  /** Параллелепипед со скруглёнными рёбрами (как у корпуса на фото): центр (x, z), низ на y0 */
  const rbox = (w, h, d, radius, material, x, y0, z, name) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material);
    m.position.set(x, y0 + h / 2, z);
    if (name) m.name = name;
    return m;
  };

  // ---- станина: две опорные балки вдоль глубины, поперечина сзади, серые опоры на концах
  const RX = W / 2 - 0.075; // ось балки
  const FOOT_R = 0.075;
  for (const sx of [-1, 1]) {
    parts.push(rbox(0.13, 0.13, D - 2 * FOOT_R, 0.03, paint, sx * RX, 0.03, 0, 'опорная балка'));
    for (const z of [ZF - FOOT_R, ZB + FOOT_R]) {
      parts.push(cyl(FOOT_R, 0.17, feet, sx * RX, 0, z, 24, 'опора'));
    }
  }
  parts.push(box(2 * RX, 0.13, 0.2, paint, 0, 0.03, ZB + 0.32, 'поперечина'));

  // ---- колонна (сзади по центру) и голова над дежей
  const CW = 0.48;
  const C_Z0 = ZB + 0.06;
  const C_Z1 = -0.06;
  parts.push(rbox(CW, 1.44, C_Z1 - C_Z0, 0.045, paint, 0, 0.1, (C_Z0 + C_Z1) / 2, 'колонна'));
  // стальная накладка на лицевой стороне колонны (направляющие подъёмника)
  parts.push(box(0.3, 0.75, 0.01, steel, 0, 0.62, C_Z1 + 0.005, 'направляющие'));
  // голова
  const HZ1 = 0.34; // лицевая сторона головы
  const HW = 0.54;
  parts.push(rbox(HW, 0.42, HZ1 - C_Z0, 0.045, paint, 0, 1.35, (C_Z0 + HZ1) / 2, 'голова'));
  // чёрная крышка со скруглённой передней кромкой
  const lidL = HZ1 - C_Z0 + 0.02;
  parts.push(rbox(HW + 0.02, H - 1.755, lidL, 0.035, black, 0, 1.755, (C_Z0 + HZ1) / 2, 'крышка'));

  // ---- пульт на лицевой стороне головы (слева)
  const PZ = HZ1 + 0.001;
  const PX = -0.13;
  parts.push(box(0.2, 0.17, 0.006, panelMat, PX, 1.55, PZ + 0.003, 'пульт'));
  const disp = box(0.06, 0.022, 0.003, new THREE.MeshStandardMaterial({ color: '#2a0404', emissive: '#ff2a1a', emissiveIntensity: 1.3, roughness: 0.3 }), PX - 0.05, 1.68, PZ + 0.007, 'anim-display');
  parts.push(disp);
  for (const [dx, dy] of [[0.0, 1.69], [0.035, 1.69], [0.07, 1.69], [-0.06, 1.645], [-0.025, 1.645], [0.01, 1.645], [0.045, 1.645], [0.08, 1.645]]) {
    parts.push(cylZ(THREE, 0.011, 0.004, mat.color('#e7ebee', 0.05, 0.5), PX + dx, dy, PZ + 0.008));
  }
  const led = cylZ(THREE, 0.006, 0.004, new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1 }), PX + 0.035, 1.69, PZ + 0.011);
  led.name = 'anim-status';
  parts.push(led);
  parts.push(infoScreen(0.19, 0.12, PX, 1.66, PZ + 0.014)); // живой экран на пульте
  // переключатель, синяя кнопка, аварийный стоп (жёлтое кольцо и красный гриб)
  parts.push(box(0.022, 0.03, 0.012, dark, PX - 0.07, 1.475, PZ + 0.006));
  parts.push(cylZ(THREE, 0.02, 0.016, blue, PX - 0.01, 1.475, PZ + 0.008));
  parts.push(cylZ(THREE, 0.034, 0.006, yellow, PX + 0.06, 1.475, PZ + 0.004));
  parts.push(cylZ(THREE, 0.022, 0.03, red, PX + 0.06, 1.475, PZ + 0.02, 'аварийный стоп'));
  // таблички «осторожно» на лицевой стороне
  for (const x of [0.04, 0.2]) parts.push(box(0.035, 0.03, 0.002, yellow, x, 1.405, PZ + 0.002));
  // узел шарнира решётки справа на лицевой стороне головы
  parts.push(box(0.09, 0.18, 0.06, paintDark, 0.19, 1.4, HZ1 + 0.02, 'кронштейн решётки'));
  parts.push(cylZ(THREE, 0.022, 0.05, steel, 0.19, 1.55, HZ1 + 0.03));

  // ---- надписи TeknoStamap: на боковине головы (+X) и на передней кромке крышки
  const inkDark = mat.color('#3a3d40', 0.2, 0.5);
  const sideLabel = (h, z, y) => {
    const g = new THREE.Group();
    const w1 = label('Tekno', h, inkDark, { stroke: 0.2, lowerStroke: 0.15, gap: 0.08, depth: 0.002 });
    const w2 = label('Stamap', h, orange, { stroke: 0.2, lowerStroke: 0.15, gap: 0.08, depth: 0.002 });
    w2.position.x = w1.userData.width + h * 0.08;
    g.add(w1, w2);
    g.userData.width = w1.userData.width + h * 0.08 + w2.userData.width;
    return g;
  };
  const lbl = sideLabel(0.045);
  lbl.rotation.y = Math.PI / 2; // на боковине +X: строка идёт от лица к задней стенке
  lbl.position.set(HW / 2 + 0.001, 1.64, HZ1 - 0.12);
  lbl.name = 'надпись TeknoStamap';
  parts.push(lbl);
  const lblTop = sideLabel(0.022);
  lblTop.position.set(-HW / 2 + 0.04, 1.775, HZ1 + 0.02);
  lblTop.name = 'надпись на крышке';
  parts.push(lblTop);
  // таблички на боковине и переключатель сбоку колонны
  parts.push(box(0.002, 0.07, 0.06, yellow, HW / 2 + 0.001, 1.5, HZ1 - 0.05));
  parts.push(box(0.002, 0.12, 0.09, whiteM, HW / 2 + 0.001, 1.58, -0.38));
  parts.push(box(0.002, 0.08, 0.06, yellow, CW / 2 + 0.001, 0.98, -0.3, 'выключатель'));
  parts.push(cylX(THREE, 0.024, 0.02, red, CW / 2 + 0.01, 1.0, -0.3));

  // ---- защитная решётка (перфорированная, полукольцом спереди) под головой
  const BZ = 0.17; // ось дежи
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.1, 40, 1, true, -Math.PI / 2 - 1.2, 2.4 + Math.PI), steel.clone());
  guard.material.side = THREE.DoubleSide;
  guard.position.set(0, 1.31, BZ);
  guard.name = 'защитная решётка';
  parts.push(guard);
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 - 1.2 + ((i + 0.5) / 14) * (2.4 + Math.PI);
    const slot = box(0.03, 0.055, 0.004, mat.color('#6b7075', 0.3, 0.5), Math.sin(a) * 0.312, 1.285, BZ + Math.cos(a) * 0.312);
    slot.rotation.y = a;
    parts.push(slot);
  }
  parts.push(box(0.12, 0.05, 0.1, steel, 0.0, 1.36, BZ + 0.24, 'загрузочный лоток'));
  // ступица планетарной головки
  parts.push(cyl(0.07, 0.04, steelDark, 0, 1.32, BZ, 24));

  // ---- планетарная головка: венчик обходит дежу (anim-orbit) и крутится сам (anim-spin-rev)
  const orbit = new THREE.Group();
  orbit.name = 'anim-orbit';
  orbit.position.set(0, 0, BZ);
  const whisk = new THREE.Group();
  whisk.name = 'anim-spin-rev';
  whisk.position.set(0.05, 0, 0); // эксцентриситет планетарной передачи
  whisk.add(cyl(0.02, 0.07, steel, 0, 1.25, 0, 16)); // хвостовик
  whisk.add(cyl(0.035, 0.03, steelDark, 0, 1.22, 0, 16));
  const WIRES = 14;
  for (let k = 0; k < WIRES; k++) {
    const a = (k / WIRES) * Math.PI;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24; // 0 — верх, 1 — низ, через низ на другую сторону
      const ang = u * Math.PI; // полуокружность «капли»
      const y = 1.22 - 0.64 * (1 - Math.cos(ang)) / 2; // венчик до 0,58 м — в работе заходит в дежу
      const r = 0.16 * Math.sin(ang) * (1 - 0.35 * u);
      const rr = u < 1 ? r : 0;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    for (let i = 23; i >= 0; i--) {
      const p = pts[i];
      pts.push(new THREE.Vector3(-p.x, p.y, -p.z));
    }
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.003, 5, false), steel);
    whisk.add(wire);
  }
  orbit.add(whisk);
  parts.push(orbit);

  // ---- дежа 80 л (поднята в рабочее положение) с ручками и поясами
  const BR = 0.27;
  const R0 = 0.86; // кромка (дежа приподнята подъёмником; дно на 0,30 м)
  const prof = [
    new THREE.Vector2(0, 0.3),
    new THREE.Vector2(0.12, 0.305),
    new THREE.Vector2(0.21, 0.345),
    new THREE.Vector2(0.255, 0.42),
    new THREE.Vector2(BR - 0.005, 0.52),
    new THREE.Vector2(BR, R0 - 0.01),
    new THREE.Vector2(BR + 0.012, R0),
    new THREE.Vector2(BR - 0.008, R0),
    new THREE.Vector2(BR - 0.013, 0.52),
    new THREE.Vector2(0.245, 0.425),
    new THREE.Vector2(0.2, 0.355),
    new THREE.Vector2(0, 0.315),
  ];
  const bowlMat = steel.clone();
  bowlMat.side = THREE.DoubleSide;
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), bowlMat);
  bowl.position.set(0, 0, BZ);
  bowl.name = 'дежа';
  parts.push(bowl);
  for (const y of [0.72, 0.6]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(BR + 0.005, 0.008, 8, 48), steelDark);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, y, BZ);
    parts.push(band);
  }
  // ручки дежи
  for (const sx of [-1, 1]) {
    parts.push(box(0.012, 0.012, 0.12, steel, sx * (BR + 0.05), 0.71, BZ));
    for (const dz of [-0.055, 0.055]) parts.push(box(0.05, 0.012, 0.012, steel, sx * (BR + 0.027), 0.71, BZ + dz));
  }
  // кронштейны подъёмника: от колонны к поясу дежи
  for (const sx of [-1, 1]) {
    parts.push(box(0.04, 0.12, BZ - C_Z1 - 0.18, paintDark, sx * 0.2, 0.58, (C_Z1 + BZ - 0.18) / 2 + 0.0, 'кронштейн подъёмника'));
    parts.push(box(0.05, 0.05, 0.05, steelDark, sx * 0.2, 0.62, BZ - 0.2));
  }

  // ---- тележка дежи: лапы и колёсики
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const lx = Math.cos(a) * 0.16;
    const lz = BZ + Math.sin(a) * 0.16;
    const leg = box(0.03, 0.2, 0.03, steelDark, lx * 0.8, 0.09, BZ + (lz - BZ) * 0.8);
    parts.push(leg);
    parts.push(box(0.05, 0.02, 0.05, steelDark, lx, 0.08, lz));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 16), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(lx, 0.04, lz);
    parts.push(wheel);
  }
  parts.push(cyl(0.17, 0.02, steelDark, 0, 0.28, BZ, 32, 'опора дежи'));

  return group(parts);
}

/** Короткий цилиндр с осью вдоль Z */
function cylZ(THREE, r, len, material, x, y, z, name) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  if (name) m.name = name;
  return m;
}

/** Короткий цилиндр с осью вдоль X */
function cylX(THREE, r, len, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), material);
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

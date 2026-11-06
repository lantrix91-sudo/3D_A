/**
 * Тестоделитель-округлитель KÖNIG Mini Rex Futura — модель по фотографиям заказчика.
 * Габариты по данным заказчика (Д × Ш × В): 1755 × 630 × 1790 мм (с выносным конвейером и бункером).
 * Упрощённая геометрия: стол-подставка на колёсах с полкой, корпус из нержавеющей стали, сверху белый
 * бункер для теста; на лицевой стороне — пульт в красной рамке (дисплей, клавиатура, аварийный стоп),
 * красная надпись KÖNIG, решётка вентилятора; слева — окно выхода с белым барабаном-округлителем,
 * прижимным белым валиком на рычаге и узкий голубой конвейер на 2 ряда заготовок.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-ball    — заготовка (шарик теста); userData: phase (сдвиг по циклу 0…1), fromX/toX (путь по ленте),
 *                  period (с на путь); пока аппарат работает, шарики выходят из-под барабана парами,
 *                  едут по ленте к краю и там исчезают;
 *   anim-roll    — барабан-округлитель: вращается вокруг своей оси (поперёк ленты), пока аппарат работает;
 *   anim-status  — лампа на пульте окрашивается в цвет состояния.
 * Оси: X — длина (вдоль конвейера), Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Тестоделитель-округлитель KÖNIG Mini Rex Futura',
  units: 'm',
  note: 'По фото заказчика; габариты 1755 × 630 × 1790 мм (Д × Ш × В)',
};

export function build({ THREE, mat, box, cyl, rodX, rodZ, group, label, infoScreen }) {
  const L = 1.755;
  const D = 0.63;
  const X0 = -L / 2;
  const X1 = L / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;

  const inox = mat.color('#cdd2d6', 0.45, 0.36);
  const inoxDark = mat.color('#a6acb1', 0.45, 0.42);
  const tube = mat.color('#b8bec3', 0.5, 0.4);
  const red = mat.color('#c22a2e', 0.1, 0.4);
  const redLogo = mat.color('#d23a2e', 0.1, 0.45);
  const black = mat.color('#151719', 0.1, 0.7);
  const dark = mat.color('#2a2f34', 0.2, 0.5);
  const keys = mat.color('#d9dde0', 0.1, 0.5);
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const green = mat.color('#2f9a4a', 0.1, 0.4);
  const white = mat.color('#f4f4f1', 0.02, 0.5); // пластик барабана и валика
  const hopperWhite = mat.color('#eef0ee', 0.02, 0.35, );
  const belt = mat.color('#8fd0ee', 0.05, 0.5); // светло-голубая лента
  const beltDark = mat.color('#5ba9cf', 0.05, 0.6);
  const blue = mat.color('#2a5bd6', 0.05, 0.45);
  const rubber = mat.color('#2a2d30', 0, 0.9);
  const wheel = mat.color('#8d9296', 0.2, 0.6);
  const dough = mat.color('#f1e9da', 0, 0.92);

  const parts = [];

  // ---- стол-подставка на колёсах: четыре ноги, обвязка, полка, ящик
  const TX0 = -0.03; // стол по длине
  const TX1 = X1 - 0.03;
  const TY = 0.8; // верх стола
  const legs = [[TX0 + 0.04, Z0 + 0.05], [TX1 - 0.04, Z0 + 0.05], [TX0 + 0.04, Z1 - 0.05], [TX1 - 0.04, Z1 - 0.05]];
  for (const [lx, lz] of legs) {
    parts.push(box(0.06, TY - 0.12, 0.06, tube, lx, 0.12, lz, 'нога'));
    parts.push(box(0.08, 0.03, 0.08, inoxDark, lx, 0.09, lz)); // площадка колеса
    parts.push(box(0.012, 0.04, 0.04, inoxDark, lx - 0.018, 0.05, lz));
    parts.push(box(0.012, 0.04, 0.04, inoxDark, lx + 0.018, 0.05, lz));
    parts.push(rodX(0.045, 0.024, rubber, lx, 0.045, lz, 24));
    parts.push(rodX(0.026, 0.028, wheel, lx, 0.045, lz, 16));
  }
  parts.push(box(TX1 - TX0, 0.05, D - 0.04, inox, (TX0 + TX1) / 2, TY - 0.05, 0, 'столешница'));
  parts.push(box(TX1 - TX0 - 0.1, 0.02, D - 0.1, inox, (TX0 + TX1) / 2, 0.28, 0, 'полка'));
  parts.push(box(TX1 - TX0 - 0.1, 0.03, 0.03, tube, (TX0 + TX1) / 2, 0.25, Z1 - 0.05)); // обвязка
  parts.push(box(TX1 - TX0 - 0.16, 0.08, 0.02, inox, (TX0 + TX1) / 2, TY - 0.14, Z1 - 0.06, 'ящик'));
  parts.push(box(0.16, 0.014, 0.014, inoxDark, (TX0 + TX1) / 2, TY - 0.11, Z1 - 0.045)); // ручка ящика
  parts.push(box(0.012, TY - 0.36, D - 0.12, inox, TX0 + 0.05, 0.3, 0, 'боковина стола'));

  // ---- корпус машины
  const BX0 = 0.04;
  const BX1 = X1 - 0.02;
  const BY0 = TY;
  const BY1 = 1.53;
  const BF = Z1 - 0.05; // лицевая плоскость корпуса (пульт и стоп выступают до Z1)
  const BC = (BX0 + BX1) / 2;
  // корпус собран из частей: слева на лицевой стороне — открытая ниша выхода (барабан и начало ленты)
  const NX1 = BX0 + 0.3; // правая стенка ниши
  const NY0 = 0.93;
  const NY1 = 1.3;
  const NZB = -0.05; // задняя стенка ниши
  const ZB = Z0 + 0.01;
  const depthAll = BF - ZB;
  parts.push(box(BX1 - BX0, NY0 - BY0, depthAll, inox, BC, BY0, (BF + ZB) / 2, 'корпус низ'));
  parts.push(box(BX1 - BX0, BY1 - NY1, depthAll, inox, BC, NY1, (BF + ZB) / 2, 'корпус верх'));
  parts.push(box(BX1 - NX1, NY1 - NY0, depthAll, inox, (NX1 + BX1) / 2, NY0, (BF + ZB) / 2, 'корпус справа'));
  parts.push(box(NX1 - BX0, NY1 - NY0, NZB - ZB, inox, (BX0 + NX1) / 2, NY0, (NZB + ZB) / 2, 'корпус за нишей'));
  parts.push(box(NX1 - BX0, NY1 - NY0, 0.006, dark, (BX0 + NX1) / 2, NY0, NZB + 0.003, 'стенка ниши'));
  parts.push(box(BX1 - BX0 + 0.02, 0.03, BF - Z0, inoxDark, BC, BY1 - 0.18, (BF + Z0) / 2)); // пояс над дверцей
  parts.push(box(BX1 - BX0 - 0.04, 0.006, 0.006, inoxDark, BC, BY0 + 0.05, BF + 0.003)); // стык нижней панели
  parts.push(box(0.012, 0.015, 0.16, inoxDark, BX1 + 0.012, 1.13, BF - 0.12)); // ручка сбоку
  // крышка с отгибом
  parts.push(box(BX1 - BX0 + 0.02, 0.025, BF - Z0 + 0.01, inox, BC, BY1, (BF + Z0) / 2, 'крышка'));

  // ---- белый бункер для теста сверху (сужается книзу), с крышкой
  const HX = BC + 0.12;
  const hg = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, false);
  hg.rotateY(Math.PI / 4);
  const pos = hg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    pos.setX(i, Math.sign(pos.getX(i)) * (top ? 0.36 : 0.26) / 2);
    pos.setZ(i, Math.sign(pos.getZ(i)) * (top ? 0.42 : 0.3) / 2);
    pos.setY(i, top ? 0.2 : 0);
  }
  hg.computeVertexNormals();
  const hopper = new THREE.Mesh(hg, hopperWhite);
  hopper.position.set(HX, BY1 + 0.025, -0.02);
  hopper.name = 'бункер';
  parts.push(hopper);
  parts.push(box(0.38, 0.035, 0.44, white, HX, BY1 + 0.225, -0.02, 'крышка бункера'));

  // ---- пульт в красной рамке: дисплей, клавиатура, аварийный стоп, кнопки
  const PX = BC + 0.12;
  const PY0 = 1.24;
  parts.push(box(0.42, 0.24, 0.01, red, PX, PY0, BF + 0.005, 'рамка пульта'));
  parts.push(box(0.4, 0.22, 0.01, keys, PX, PY0 + 0.01, BF + 0.01, 'пульт'));
  parts.push(box(0.15, 0.115, 0.01, dark, PX - 0.005, PY0 + 0.07, BF + 0.015, 'рамка дисплея'));
  parts.push(infoScreen(0.13, 0.095, PX - 0.005, PY0 + 0.127, BF + 0.0205)); // живой экран на дисплее пульта
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) {
    parts.push(box(0.022, 0.022, 0.008, dark, PX + 0.1 + c * 0.03, PY0 + 0.03 + r * 0.035, BF + 0.017));
  }
  parts.push(rodZ(0.024, 0.01, yellow, PX - 0.15, PY0 + 0.17, BF + 0.017, 24));
  parts.push(rodZ(0.017, 0.022, red, PX - 0.15, PY0 + 0.17, BF + 0.032, 24)); // аварийный стоп
  parts.push(rodZ(0.011, 0.01, green, PX - 0.165, PY0 + 0.085, BF + 0.017, 16));
  parts.push(rodZ(0.011, 0.01, red, PX - 0.135, PY0 + 0.085, BF + 0.017, 16));
  parts.push(rodZ(0.009, 0.008, green, PX - 0.15, PY0 + 0.04, BF + 0.017, 16));
  parts[parts.length - 1].name = 'anim-status'; // лампа состояния

  // ---- надпись KÖNIG и подпись Mini Rex Futura
  const cap = 0.06;
  const word = label('KÖNIG', cap, redLogo, { stroke: 0.2, gap: 0.12, depth: 0.003 });
  word.position.set(BC - 0.06, 0.98, BF + 0.001);
  parts.push(word);
  const sub = label('Mini Rex Futura', 0.017, redLogo, { stroke: 0.18, gap: 0.1, depth: 0.002 });
  sub.position.set(BC - 0.06, 0.95, BF + 0.001);
  parts.push(sub);
  // табличка и знак запрета
  parts.push(box(0.09, 0.11, 0.003, white, BC - 0.02, 0.83, BF + 0.0015, 'табличка'));
  parts.push(box(0.1, 0.06, 0.003, white, BC - 0.05, 1.21, BF + 0.0015, 'знак'));
  parts.push(rodZ(0.018, 0.003, red, BC - 0.03, 1.24, BF + 0.003, 20));

  // ---- решётка вентилятора
  const VX = BX1 - 0.13;
  const VY = 0.98;
  parts.push(rodZ(0.075, 0.006, inoxDark, VX, VY, BF + 0.003, 32));
  for (const rr of [0.068, 0.052, 0.036, 0.02]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0035, 6, 32), dark);
    ring.position.set(VX, VY, BF + 0.007);
    parts.push(ring);
  }

  // ---- окно выхода слева на лицевой стороне: тёмная ниша, белый барабан с карманами, синий кожух
  const OX0 = BX0;
  const OX1 = BX0 + 0.3;
  const OY0 = 0.95;
  const OY1 = 1.3;
  const BT = 1.0; // верх ленты
  const BWB = 0.22; // ширина ленты (2 ряда)
  const BZ = Z1 - 0.17; // ось ленты по глубине
  parts.push(box(0.07, 0.2, BWB + 0.06, blue, OX0 + 0.25, BT + 0.06, BZ, 'кожух барабана')); // синие направляющие за барабаном
  // барабан-округлитель: ось поперёк ленты (Z), четыре кармана на ряд
  const DX = OX0 + 0.14;
  const DY = BT + 0.12;
  const DR = 0.1;
  const drum = new THREE.Group();
  drum.name = 'anim-roll';
  drum.position.set(DX, DY, BZ);
  const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(DR, DR, BWB, 32), white);
  drumBody.rotation.x = Math.PI / 2;
  drum.add(drumBody);
  for (let k = 0; k < 4; k++) {
    for (const rz of [-0.055, 0.055]) {
      const a = (k * Math.PI) / 2;
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.07), inoxDark);
      pocket.position.set(Math.cos(a) * (DR - 0.012), Math.sin(a) * (DR - 0.012), rz);
      pocket.rotation.z = a;
      drum.add(pocket);
    }
  }
  parts.push(drum);
  // прижимной белый валик на рычаге (фото 2)
  {
    // рычаг от шарнира у края ленты вверх-вправо к концу белого валика
    const ax = OX0 - 0.11, ay = BT + 0.035, bx = OX0 + 0.05, by = BT + 0.12;
    const arm = box(Math.hypot(bx - ax, by - ay) + 0.04, 0.04, 0.02, inox, 0, 0, BZ + BWB / 2 + 0.03, 'рычаг валика');
    arm.position.set((ax + bx) / 2, (ay + by) / 2, BZ + BWB / 2 + 0.03);
    arm.rotation.z = Math.atan2(by - ay, bx - ax);
    parts.push(arm);
  }
  parts.push(rodZ(0.022, BWB + 0.04, white, OX0 + 0.05, BT + 0.12, BZ, 24)); // белый валик
  parts.push(rodZ(0.03, 0.03, inoxDark, OX0 - 0.11, BT + 0.035, BZ + BWB / 2 + 0.03, 20)); // шарнир рычага
  parts.push(cyl(0.006, 0.06, inoxDark, OX0 - 0.03, BT + 0.12, BZ + BWB / 2 + 0.03, 12)); // винт регулировки
  parts.push(cyl(0.016, 0.012, inoxDark, OX0 - 0.03, BT + 0.18, BZ + BWB / 2 + 0.03, 16));

  // ---- выносной конвейер: узкая голубая лента до левого края
  const CX0 = X0;
  const CX1 = OX0 + 0.26;
  const CL = CX1 - CX0;
  const CC = (CX0 + CX1) / 2;
  parts.push(box(CL - 0.04, 0.025, BWB, belt, CC + 0.02, BT - 0.025, BZ, 'лента'));
  parts.push(box(CL - 0.08, 0.01, BWB - 0.02, beltDark, CC + 0.02, BT - 0.075, BZ)); // обратная ветвь
  parts.push(rodZ(0.0175, BWB, belt, CX0 + 0.0175, BT - 0.0175, BZ, 20)); // концевой ролик
  parts.push(rodZ(0.019, BWB + 0.06, dark, CX0 + 0.0175, BT - 0.0175, BZ, 16)); // ось ролика (тёмная, как на фото)
  for (const sz of [BZ + BWB / 2 + 0.008, BZ - BWB / 2 - 0.008]) {
    parts.push(box(CL - 0.02, 0.07, 0.012, inox, CC + 0.01, BT - 0.075, sz, 'щека конвейера'));
  }
  // разделитель рядов посередине ленты
  parts.push(box(CL * 0.35, 0.025, 0.006, inoxDark, CX1 - CL * 0.175 - 0.05, BT, BZ));
  // кронштейн конвейера к столу
  parts.push(box(0.24, 0.16, 0.2, inox, OX0 - 0.02, BT - 0.29, BZ, 'кронштейн конвейера'));
  parts.push(box(0.04, 0.12, 0.04, inoxDark, OX0 - 0.12, BT - 0.2, BZ - 0.06));

  // ---- заготовки: два ряда по 8 шариков, сдвинуты по циклу
  const N = 8;
  const fromX = DX - 0.02; // под барабаном
  const toX = CX0 + 0.04; // край ленты
  const ballGeo = new THREE.SphereGeometry(0.036, 18, 12);
  ballGeo.scale(1, 0.82, 1);
  for (let k = 0; k < N; k++) {
    for (const rz of [-0.055, 0.055]) {
      const b = new THREE.Mesh(ballGeo, dough);
      b.position.set(fromX - (k / N) * (fromX - toX), BT + 0.029, BZ + rz);
      b.name = 'anim-ball';
      b.userData = { phase: k / N, fromX, toX, period: 8 };
      parts.push(b);
    }
  }

  return group(parts);
}

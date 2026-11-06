/**
 * Кондитерская отсадочная машина S400 (COOKIE MACHINE, 220 В, 2,6 кВт) — модель по фотографиям заказчика.
 * Габариты по данным заказчика: высота 1370 мм, ширина 980 мм (вдоль ленты), длина 620 мм (глубина).
 * Компоновка как на фото: слева — высокая стойка управления (верх лицевой стороны скошен, на скосе сенсорная
 * панель; ниже ключ и аварийный стоп; сбоку вентилятор); сзади — корпус привода головки с наклейками;
 * перед ним по всей длине — синий транспортёр; над лентой, отдельно от стойки, — бункер с тестом и отсадочная
 * головка на 6 насадок-звёздочек; от головки вниз — две стойки с белыми подпятниками на тумбе под лентой.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-tray   — противень; параметры хода в userData.conv: шагает под насадками, затем едет к краю и возвращается;
 *   anim-fill   — печенье (userData.col — колонка): появляется при отсадке, исчезает у края ленты;
 *   anim-stream — струйка теста из насадки во время отсадки;
 *   anim-dose   — шток поршня головки;
 *   anim-status — лампа на панели окрашивается в цвет состояния;
 *   info-screen — живой экран на сенсорной панели.
 * Оси: X — вдоль ленты (лента выходит в +X), Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Отсадочная машина S400',
  units: 'm',
  note: 'По фото заказчика; 980 × 620 × 1370 мм (Ш × Д × В)',
};

export function build({ THREE, mat, box, cyl, cone, rodX, rodZ, group, infoScreen }) {
  const W = 0.98;
  const D = 0.62;
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2; // задняя сторона
  const Z1 = D / 2; // лицевая сторона (оператор)
  const H = 1.37;

  const inox = mat.color('#d8dde0', 0.6, 0.27);
  // шлифованная нержавеющая сталь: светлый металл с полосами бликов (цвет по вершинам)
  const steel = new THREE.MeshStandardMaterial({ color: '#d4d9dd', metalness: 0.78, roughness: 0.3, vertexColors: true });
  const steelBox = (w, h, d, x, y0, z, name, seed = 0) => {
    const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 0.04)), Math.max(1, Math.round(h / 0.04)), Math.max(1, Math.round(d / 0.06)));
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i) + x, py = pos.getY(i) + y0 + h / 2, pz = pos.getZ(i) + z;
      const band = 0.16 * Math.sin(px * 5.5 + py * 2.2 + pz * 1.7 + seed) + 0.08 * Math.sin(py * 7.5 - px * 2.0 + seed * 1.7);
      const brush = 0; // мелкие риски давали муар на крышке — без них
      const v = Math.min(1, Math.max(0.5, 0.8 + band + brush));
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = Math.min(1, v * 1.02);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, steel);
    m.position.set(x, y0 + h / 2, z);
    if (name) m.name = name;
    return m;
  };
  const inoxDark = mat.color('#a6adb2', 0.55, 0.36);
  const seam = mat.color('#80878c', 0.5, 0.4);
  const belt = mat.color('#2f6fd0', 0.05, 0.5);
  const beltDark = mat.color('#24559f', 0.05, 0.6);
  const black = mat.color('#141618', 0.1, 0.6);
  const dark = mat.color('#24292e', 0.2, 0.5);
  const white = mat.color('#f1f1ee', 0.02, 0.55);
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const red = mat.color('#c8262b', 0.1, 0.4);
  const blueSign = mat.color('#2b5fb5', 0.05, 0.5);
  const trayMat = mat.color('#3a2a22', 0.2, 0.5); // противень
  const silicone = mat.color('#6a3f2a', 0, 0.7); // коричневый силиконовый коврик
  const dough = mat.color('#efdcae', 0, 0.85);
  const cookie = mat.color('#f3e2b4', 0, 0.8);
  const openSteel = new THREE.MeshStandardMaterial({ color: '#d8dde1', metalness: 0.72, roughness: 0.26, side: THREE.DoubleSide });

  const parts = [];

  // ---- щиток (корпус) сзади вдоль всей машины: слева ниже (за бункером), справа выше — со скошенным верхом и панелью
  const CZ0 = Z0 - 0.1; // корпус (с решёткой вентилятора) шире — уходит назад
  const CZ1 = Z0 + 0.2; // лицевая плоскость щитка; перед ним — лента и бункер
  const CC = (CZ0 + CZ1) / 2;
  const TX0 = 0.08; // высокая часть с панелью — справа
  const TX1 = X1 - 0.035; // правый торец щитка (стоп и ключ выступают до края машины)
  const TC = (TX0 + TX1) / 2;
  const TW = TX1 - TX0;
  const LH = H; // левая часть — той же высоты, что панель и бункер
  const SY0 = 1.0; // начало скоса
  const SD = 0.22; // скос уходит назад к верху (крутой угол над дисплеем, как на фото)
  parts.push(steelBox(TX0 - X0, LH - 0.06, CZ1 - CZ0, (X0 + TX0) / 2, 0.06, CC, 'щиток слева', 0.4));
  parts.push(box(TX0 - X0 + 0.01, 0.012, CZ1 - CZ0 + 0.01, inoxDark, (X0 + TX0) / 2, LH - 0.012, CC));
  // высокая часть справа: панель управления и скос смотрят вправо (+X), в сторону выхода ленты
  parts.push(steelBox(TW, SY0 - 0.06, CZ1 - CZ0, TC, 0.06, CC, 'щиток справа', 1.3));
  parts.push(steelBox(TW - SD, H - SY0, CZ1 - CZ0, TX0 + (TW - SD) / 2, SY0, CC, 'щиток справа верх', 2.1));
  {
    // клин скоса на правом торце: (X1 − SD, SY0) — (X1, SY0) — (X1 − SD, H), вытянут по глубине
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(SD, 0); sh.lineTo(0, H - SY0); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: CZ1 - CZ0, bevelEnabled: false });
    const wedge = new THREE.Mesh(g, inox);
    wedge.position.set(TX1 - SD, SY0, CZ0);
    wedge.name = 'скос';
    parts.push(wedge);
  }
  parts.push(box(TW - SD + 0.01, 0.012, CZ1 - CZ0 + 0.01, inoxDark, TX0 + (TW - SD) / 2, H - 0.012, CC)); // отгиб крышки
  parts.push(box(0.008, 0.008, CZ1 - CZ0, inoxDark, TX1 - 0.002, SY0, CC)); // кромка скоса
  // на скосе: сенсорная панель с живым экраном и лампа — лицом вправо, наклонена назад
  const tilt = Math.atan2(SD, H - SY0);
  const slant = new THREE.Group();
  slant.position.set(TX1 - SD / 2, SY0 + (H - SY0) / 2, CC);
  slant.rotation.order = 'YXZ';
  slant.rotation.y = Math.PI / 2; // лицом в +X
  slant.rotation.x = -tilt; // верх уходит назад (к −X)
  slant.add(box(0.2, 0.19, 0.016, mat.color('#c9ced2', 0.3, 0.35), 0, -0.02, 0.008, 'рамка панели'));
  slant.add(box(0.17, 0.15, 0.004, black, 0, 0.0, 0.018));
  slant.add(infoScreen(0.16, 0.13, 0, 0.075, 0.0205)); // живой экран
  const lamp = rodZ(0.008, 0.008, mat.color('#2a6e3a', 0.1, 0.4), 0.085, 0.14, 0.02, 12);
  lamp.name = 'anim-status';
  slant.add(lamp);
  parts.push(slant);
  // ключ, аварийный стоп и наклейка — на правом торце под скосом
  parts.push(rodX(0.016, 0.012, dark, TX1 + 0.006, 0.92, CC - 0.06, 16)); // ключ
  parts.push(box(0.006, 0.02, 0.006, inoxDark, TX1 + 0.014, 0.91, CC - 0.06));
  parts.push(rodX(0.03, 0.012, yellow, TX1 + 0.006, 0.92, CC + 0.04, 24));
  parts.push(rodX(0.022, 0.025, red, TX1 + 0.022, 0.92, CC + 0.04, 24)); // аварийный стоп
  parts.push(box(0.002, 0.13, 0.08, yellow, TX1 + 0.001, 0.72, CC, 'наклейка'));
  // наклейки и болты-фиксаторы головки на левой части щитка
  parts.push(box(0.09, 0.07, 0.002, white, X0 + 0.1, 0.98, CZ1 + 0.001, 'наклейка'));
  parts.push(box(0.05, 0.05, 0.002, blueSign, X0 + 0.08, 0.98, CZ1 + 0.002));
  parts.push(rodZ(0.025, 0.002, red, X0 + 0.2, 1.01, CZ1 + 0.001, 20));
  parts.push(box(0.04, 0.04, 0.002, yellow, X0 + 0.12, 0.84, CZ1 + 0.001));
  // решётка вентилятора охлаждения — на левой стенке аппарата, на уровне дисплея
  {
    const fy = SY0 + (H - SY0) / 2; // высота центра дисплея
    const fz = CC;
    parts.push(box(0.006, 0.17, 0.17, dark, X0 - 0.003, fy - 0.085, fz, 'решётка вентилятора'));
    for (const r of [0.072, 0.056, 0.04, 0.024]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0035, 6, 32), inoxDark);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(X0 - 0.007, fy, fz);
      parts.push(ring);
    }
    parts.push(box(0.004, 0.15, 0.006, inoxDark, X0 - 0.007, fy - 0.075, fz)); // перекрестие решётки
    parts.push(box(0.004, 0.006, 0.15, inoxDark, X0 - 0.007, fy - 0.003, fz));
    for (const [dy, dz] of [[-0.07, -0.07], [-0.07, 0.07], [0.07, -0.07], [0.07, 0.07]]) {
      parts.push(rodX(0.006, 0.006, inoxDark, X0 - 0.006, fy + dy, fz + dz, 8)); // винты
    }
  }
  parts.push(box(0.18, 0.12, 0.012, black, TC, 0.8, CZ0 - 0.004, 'шильдик'));
  // колёсные опоры: аппарат стоит на четырёх поворотных колёсах по углам (днище на высоте 0,06 м)
  parts.push(box(W - 0.05, 0.012, Z1 - CZ0 - 0.03, inoxDark, (X0 + X1 - 0.035) / 2, 0.06, (CZ0 + Z1 - 0.01) / 2, 'днище'));
  for (const wx of [X0 + 0.07, X1 - 0.1]) {
    for (const wz of [CZ0 + 0.07, Z1 - 0.08]) {
      parts.push(box(0.06, 0.006, 0.06, inoxDark, wx, 0.054, wz)); // площадка
      parts.push(cyl(0.012, 0.012, inoxDark, wx, 0.042, wz, 12)); // поворотный узел
      parts.push(box(0.006, 0.035, 0.035, inoxDark, wx - 0.016, 0.012, wz + 0.008)); // вилка
      parts.push(box(0.006, 0.035, 0.035, inoxDark, wx + 0.016, 0.012, wz + 0.008));
      parts.push(rodX(0.025, 0.02, black, wx, 0.025, wz + 0.012, 18)); // колесо
      parts.push(rodX(0.012, 0.024, mat.color('#9aa1a6', 0.4, 0.4), wx, 0.025, wz + 0.012, 12)); // ступица
    }
  }

  // ---- синий транспортёр перед щитком, параллельно ему, по всей длине машины; противень едет в +X
  const BT = 0.72; // верх ленты
  const BW = 0.32;
  const ZSHIFT = 0.1; // лента с бункером вынесены вперёд, дальше от корпуса с вентилятором
  const BZ = CZ1 + ZSHIFT + BW / 2; // ось ленты по глубине
  const EXT = 0.22; // лента выступает за корпус с обеих сторон
  const SHIFT = 0; // смещение ленты и бункера вдоль машины (0 — по центру)
  const LX0 = X0 - EXT + SHIFT;
  const LX1 = X1 + EXT + SHIFT;
  parts.push(box(LX1 - LX0 - 0.05, 0.03, BW, belt, (LX0 + LX1) / 2, BT - 0.03, BZ, 'лента'));
  for (const rx of [LX0 + 0.02, LX1 - 0.02]) {
    parts.push(rodZ(0.02, BW, belt, rx, BT - 0.02, BZ, 20)); // концевой ролик
    parts.push(rodZ(0.008, BW + 0.03, inoxDark, rx, BT - 0.02, BZ, 10)); // ось концевого ролика
    // чёрный натяжной ролик — под лентой, чуть внутрь от конца
    const inward = rx < (LX0 + LX1) / 2 ? 0.07 : -0.07;
    parts.push(rodZ(0.022, BW - 0.02, black, rx + inward, BT - 0.07, BZ, 16));
  }
  // щёки ленты — трапеция: низ короче верха, концы скошены под углом (как на фото)
  {
    const cl = LX1 - LX0 - 0.04; // длина по верху
    const ch = 0.1; // высота щеки
    const cut = 0.1; // скос на каждом конце по низу
    const sh = new THREE.Shape();
    sh.moveTo(-cl / 2, 0); sh.lineTo(cl / 2, 0); sh.lineTo(cl / 2 - cut, -ch); sh.lineTo(-cl / 2 + cut, -ch); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
    g.translate(0, 0, -0.006);
    for (const sz of [-1, 1]) {
      const cheek = new THREE.Mesh(g, inoxDark);
      cheek.position.set((LX0 + LX1) / 2, BT - 0.02, BZ + sz * (BW / 2 + 0.008));
      cheek.name = 'щека ленты';
      parts.push(cheek);
    }
  }
  parts.push(box(LX1 - LX0 - 0.28, 0.012, BW - 0.02, beltDark, (LX0 + LX1) / 2, BT - 0.11, BZ)); // обратная ветвь
  // кронштейны ленты к щитку
  for (const bx of [X0 + 0.12, 0.0, X1 - 0.12]) parts.push(box(0.04, 0.04, ZSHIFT + 0.02, inoxDark, bx, BT - 0.14, CZ1 + (ZSHIFT + 0.02) / 2));

  // ---- тумба под лентой (впереди, под бункером)
  const PBX0 = X0; // тумба под лентой — во всю ширину корпуса
  const PBX1 = X1 - 0.035;
  // нижний щиток выступает вперёд за ленту — на нём стоят крепления бункера
  const PBZ1 = Z1 + 0.04 + ZSHIFT + 0.01; // выступ нижнего щитка сохраняется
  const PBT = 0.58; // верх нижнего щитка
  parts.push(steelBox(PBX1 - PBX0, PBT - 0.06, PBZ1 - CZ1, (PBX0 + PBX1) / 2, 0.06, (PBZ1 + CZ1) / 2, 'тумба', 0.9));
  parts.push(box(PBX1 - PBX0 + 0.006, 0.012, PBZ1 - CZ1 + 0.006, inoxDark, (PBX0 + PBX1) / 2, PBT - 0.008, (PBZ1 + CZ1) / 2)); // крышка-отгиб (чуть выше корпуса — без мерцания)

  // ---- отсадочная головка и бункер над лентой (отдельно от стойки управления)
  const NX = -0.02 + SHIFT; // ось насадок по ходу ленты — бункер с креплениями по центру машины (центр бункера NX + 0.02 = 0)
  const HY0 = 0.815; // низ головки — насадки сразу над противнем (бункер ближе к ленте)
  parts.push(box(0.16, 0.12, BW + 0.06, inox, NX, HY0, BZ, 'головка'));
  parts.push(rodX(0.016, 0.24, inoxDark, NX, HY0 + 0.06, BZ + BW / 2 + 0.015, 16)); // вал перед головкой
  for (const bx of [-0.05, 0.05]) parts.push(rodZ(0.013, 0.03, inoxDark, NX + bx, HY0 + 0.06, BZ + BW / 2 + 0.03, 12)); // барашки
  const dose = rodX(0.014, 0.2, inoxDark, NX - 0.16, HY0 + 0.03, BZ - 0.1, 12);
  dose.name = 'anim-dose';
  parts.push(dose);
  // две стойки от головки вниз к тумбе, с белыми подпятниками
  const rz = BZ + BW / 2 + 0.07; // стойки стоят на выступе нижнего щитка перед лентой
  for (const sx of [-1, 1]) {
    const rx = NX + sx * 0.07;
    parts.push(cyl(0.012, HY0 + 0.06 - PBT, inox, rx, PBT, rz, 12));
    parts.push(cyl(0.022, 0.05, white, rx, PBT, rz, 16)); // белый подпятник на щитке
    parts.push(cyl(0.03, 0.006, inoxDark, rx, PBT, rz, 16)); // фланец крепления
    parts.push(box(0.03, 0.03, rz - (BZ + BW / 2 + 0.03), inoxDark, rx, HY0 + 0.03, (rz + BZ + BW / 2 + 0.03) / 2));
  }
  // бункер: трапеция, сужается книзу, тесто внутри; верх — вровень со щитком (H)
  const HB = HY0 + 0.12; // низ бункера
  const HZ = BZ + 0.04; // бункер чуть вынесен вперёд — между ним и щитком зазор ~2 см, бункер стоит отдельно
  const HH = H - 0.012 - HB; // высота бункера до отбортовки
  {
    const hg = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true);
    hg.rotateY(Math.PI / 4);
    const p = hg.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const top = p.getY(k) > 0;
      p.setX(k, Math.sign(p.getX(k)) * (top ? 0.4 : 0.18) / 2);
      p.setZ(k, Math.sign(p.getZ(k)) * (top ? 0.32 : 0.26) / 2);
      p.setY(k, top ? HH : 0);
    }
    hg.computeVertexNormals();
    const hop = new THREE.Mesh(hg, openSteel);
    hop.position.set(NX + 0.02, HB, HZ);
    hop.name = 'бункер';
    parts.push(hop);
    for (const sz of [-1, 1]) parts.push(box(0.42, 0.012, 0.012, inoxDark, NX + 0.02, HB + HH, HZ + sz * 0.165));
    for (const sx of [-1, 1]) parts.push(box(0.012, 0.012, 0.34, inoxDark, NX + 0.02 + sx * 0.205, HB + HH, HZ));
    parts.push(box(0.36, 0.02, 0.29, dough, NX + 0.02, HB + HH * 0.82, HZ, 'тесто'));
    const lump = new THREE.SphereGeometry(1, 12, 8);
    for (const [dx, dz, r] of [[-0.08, 0.08, 0.06], [0.05, -0.09, 0.07], [0.02, 0.04, 0.07], [-0.1, -0.06, 0.05]]) {
      const lm = new THREE.Mesh(lump, dough);
      lm.scale.set(r, r * 0.35, r);
      lm.position.set(NX + 0.02 + dx, HB + HH * 0.86, HZ + dz * 0.8);
      parts.push(lm);
    }
  }
  // 6 насадок-звёздочек поперёк ленты и струйки теста
  const ROWS = 6;
  const RP = 0.048;
  const tipY = HY0 - 0.06;
  for (let r = 0; r < ROWS; r++) {
    const z = BZ + (r - (ROWS - 1) / 2) * RP;
    parts.push(cyl(0.02, 0.02, white, NX, HY0 - 0.02, z, 16)); // белая гайка
    parts.push(cone(0.016, 0.004, 0.04, inox, NX, tipY, z, 8)); // звёздочка (8 граней)
    const sLen = tipY - (BT + 0.035);
    const g = new THREE.CylinderGeometry(0.0045, 0.006, sLen, 10);
    g.translate(0, -sLen / 2, 0);
    const stream = new THREE.Mesh(g, dough);
    stream.position.set(NX, tipY, z);
    stream.name = 'anim-stream';
    parts.push(stream);
  }

  // ---- противень с силиконовым ковриком и печеньем (двигается в двойнике)
  const COLS = 6;
  const CP = 0.052;
  const TL = 0.34;
  const TWd = 0.3;
  const startX = LX0 + 0.01 + TL / 2; // противень заходит на ленту слева
  const endX = LX1 - 0.02 - TL / 2;
  const tray = new THREE.Group();
  tray.name = 'anim-tray';
  tray.position.set(startX, BT, BZ);
  tray.userData.conv = { nozzleX: NX, cols: COLS, pitch: CP, startX, endX };
  tray.add(box(TL, 0.008, TWd, trayMat, 0, 0, 0, 'противень'));
  tray.add(box(TL - 0.02, 0.003, TWd - 0.02, silicone, 0, 0.008, 0, 'коврик'));
  const cookieGeo = new THREE.ConeGeometry(0.017, 0.025, 8);
  cookieGeo.translate(0, 0.0125, 0);
  for (let c = 0; c < COLS; c++) {
    const x = (c - (COLS - 1) / 2) * CP;
    for (let r = 0; r < ROWS; r++) {
      const z = (r - (ROWS - 1) / 2) * RP;
      const ck = new THREE.Mesh(cookieGeo, cookie);
      ck.position.set(x, 0.011, z);
      ck.name = 'anim-fill';
      ck.userData.col = c;
      tray.add(ck);
    }
  }
  parts.push(tray);

  return group(parts);
}

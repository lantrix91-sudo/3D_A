/**
 * Медовая линия ALBA (раскатка и вырубка коржей) — модель по фотографиям заказчика.
 * Размеры по данным заказчика: конвейер длиной 4 м, шириной 0,8 м, высота ленты от пола 0,9 м.
 * По ходу ленты (слева направо, +X):
 *   1) мукосей № 1 — короб 0,23 × 0,6 м поперёк ленты, сыплет муку на ленту;
 *   2) тестоприёмник — бункер с воронкой (верх 0,35 м, корпус 0,25 м, длина 0,6 м), выдаёт тестовую ленту;
 *      рядом — щиток привода из нержавейки чуть выше ленты, с аварийным стопом;
 *   3) мукосей № 2 — как первый, сыплет муку уже на тесто;
 *   4) прижимной вал (белый, в синих кронштейнах; маховик с указателем — со стороны пульта) — сжимает тесто;
 *   5) барабан-вырубщик (серый, со спиральными ножами) — режет тесто на круглые коржи;
 *   далее коржи едут к концу ленты. Пульт на наклонной тумбе с логотипом CA ALBA.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-flour   — объём под мукосеем: пока линия работает, в нём сыплется мука (частицы), завеса — лёгкая дымка;
 *   anim-roll    — вращение вокруг оси поперёк ленты: прижимной вал, барабан-вырубщик, концевые валы;
 *   anim-ball    — вырубленный корж; userData: phase, fromX, toX, period — выходит из-под барабана,
 *                  едет к концу ленты и там исчезает;
 *   anim-status  — лампа на пульте окрашивается в цвет состояния.
 *   info-screen  — живой экран на сенсорной панели пульта.
 * Оси: X — длина (по ходу ленты), Y — вверх, Z — поперёк ленты, лицевая сторона (пульт) в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Медовая линия ALBA',
  units: 'm',
  note: 'По фото заказчика; конвейер 4 × 0,8 м, высота ленты 0,9 м',
};

export function build({ THREE, mat, box, cyl, rodX, rodZ, group, label, infoScreen }) {
  const L = 4.0;
  const X0 = -L / 2;
  const X1 = L / 2;
  const BW = 0.8; // ширина ленты
  const BT = 0.9; // верх ленты
  const BZ = 0; // ось ленты

  const inox = mat.color('#d0d5d9', 0.6, 0.3);
  const inoxDark = mat.color('#a4abb1', 0.55, 0.38);
  const belt = mat.color('#1f3a8f', 0.05, 0.55); // тёмно-синяя лента
  const beltDark = mat.color('#182c6c', 0.05, 0.6);
  const blue = mat.color('#2350c8', 0.1, 0.45); // синие кронштейны
  const white = mat.color('#f1f1ee', 0.02, 0.5);
  const grey = mat.color('#80878d', 0.5, 0.35); // барабан-вырубщик
  const black = mat.color('#141618', 0.1, 0.6);
  const dark = mat.color('#24292e', 0.2, 0.5);
  const motor = mat.color('#9aa1a6', 0.4, 0.45);
  const red = mat.color('#c8262b', 0.1, 0.4);
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const green = mat.color('#2f9a4a', 0.1, 0.4);
  const logoGreen = mat.color('#2e9a3c', 0.1, 0.45);
  const logoYellow = mat.color('#f1c419', 0.1, 0.45);
  const dough = mat.color('#e8cf98', 0, 0.9); // медовое тесто
  const flour = new THREE.MeshStandardMaterial({ color: '#f7f5ef', transparent: true, opacity: 0.22, roughness: 1, depthWrite: false });

  const parts = [];

  // ---- рама конвейера: продольные балки, ноги с регулируемыми опорами, поперечины
  const FZ = BW / 2 + 0.03; // щёки рамы
  for (const sz of [-1, 1]) {
    parts.push(box(L - 0.06, 0.1, 0.03, inox, 0, BT - 0.13, sz * FZ, 'щека рамы'));
    for (const lx of [X0 + 0.25, -0.6, 0.6, X1 - 0.25]) {
      parts.push(box(0.06, BT - 0.2, 0.06, inox, lx, 0.07, sz * (FZ - 0.02), 'нога'));
      parts.push(cyl(0.035, 0.012, black, lx, 0, sz * (FZ - 0.02), 16)); // опора
      parts.push(cyl(0.01, 0.06, inoxDark, lx, 0.012, sz * (FZ - 0.02), 8));
    }
  }
  for (const lx of [X0 + 0.25, -0.6, 0.6, X1 - 0.25]) parts.push(box(0.05, 0.05, 2 * FZ, inoxDark, lx, 0.3, 0, 'поперечина'));

  // ---- лента и концевые валы
  parts.push(box(L - 0.1, 0.02, BW, belt, 0, BT - 0.02, BZ, 'лента'));
  parts.push(box(L - 0.16, 0.012, BW - 0.02, beltDark, 0, BT - 0.1, BZ)); // обратная ветвь
  for (const rx of [X0 + 0.05, X1 - 0.05]) {
    const roll = new THREE.Group();
    roll.name = 'anim-roll';
    roll.position.set(rx, BT - 0.05, BZ);
    const rm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, BW, 24), belt);
    rm.rotation.x = Math.PI / 2;
    roll.add(rm);
    roll.add(box(0.012, 0.09, BW + 0.002, beltDark, 0, -0.045, 0)); // метка вращения
    parts.push(roll);
    parts.push(rodZ(0.014, 2 * FZ + 0.06, inoxDark, rx, BT - 0.05, BZ, 12)); // ось
  }
  // мотор-редукторы под лентой: на монтажной плите, привёрнутой к щеке рамы, редуктор — на полке
  for (const mx of [X0 + 0.55, 0.95]) {
    const pz = -FZ + 0.025; // монтажная плита вплотную к щеке рамы изнутри
    parts.push(box(0.24, 0.37, 0.012, inox, mx, BT - 0.41, pz, 'плита мотора'));
    for (const [bx, by] of [[-0.09, -0.07], [0.09, -0.07], [-0.09, -0.36], [0.09, -0.36]]) {
      parts.push(rodZ(0.008, 0.012, inoxDark, mx + bx, BT + by, pz - 0.012, 8)); // болты
    }
    parts.push(box(0.2, 0.012, 0.2, inox, mx, BT - 0.385, -FZ + 0.12, 'полка редуктора'));
    parts.push(box(0.012, 0.1, 0.012, inoxDark, mx - 0.09, BT - 0.48, -FZ + 0.2)); // раскос полки
    parts.push(box(0.012, 0.1, 0.012, inoxDark, mx + 0.09, BT - 0.48, -FZ + 0.2));
    parts.push(box(0.16, 0.16, 0.16, motor, mx, BT - 0.37, -FZ + 0.115, 'редуктор'));
    parts.push(rodZ(0.08, 0.016, motor, mx, BT - 0.29, pz - 0.014, 24)); // фланец двигателя
    parts.push(rodZ(0.07, 0.22, motor, mx, BT - 0.29, -FZ - 0.1, 20)); // двигатель
    for (let k = 0; k < 6; k++) parts.push(rodZ(0.074, 0.01, inoxDark, mx, BT - 0.29, -FZ - 0.18 + k * 0.032, 20)); // рёбра
  }
  // ---- открытый лоток-бункер (как на фото): наклонные боковые стенки, вертикальные торцы, отбортовка по верху
  const openSteel = new THREE.MeshStandardMaterial({ color: '#d3d8dc', metalness: 0.6, roughness: 0.28, side: THREE.DoubleSide });
  const trough = (x, y0, wTop, wBot, h, len, nm) => {
    const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true);
    g.rotateY(Math.PI / 4);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const top = pos.getY(k) > 0;
      pos.setX(k, Math.sign(pos.getX(k)) * (top ? wTop : wBot) / 2);
      pos.setZ(k, Math.sign(pos.getZ(k)) * len / 2);
      pos.setY(k, top ? h : 0);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, openSteel);
    m.position.set(x, y0, BZ);
    m.name = nm;
    parts.push(m);
    parts.push(box(wBot, 0.006, len, inox, x, y0, BZ)); // дно
    // отбортовка по верху
    parts.push(box(wTop + 0.03, 0.012, 0.015, inox, x, y0 + h, BZ + len / 2));
    parts.push(box(wTop + 0.03, 0.012, 0.015, inox, x, y0 + h, BZ - len / 2));
    for (const sx of [-1, 1]) parts.push(box(0.015, 0.012, len + 0.015, inox, x + sx * (wTop / 2 + 0.008), y0 + h, BZ));
  };
  // наполнение лотка на высоте f (0…1) — плоскость по ширине на этой высоте
  const fill = (x, y0, wTop, wBot, h, len, f, m, nm) => {
    const w = wBot + (wTop - wBot) * f;
    parts.push(box(w - 0.006, 0.01, len - 0.01, m, x, y0 + h * f - 0.01, BZ, nm));
  };
  // торец лотка со стороны оператора (+Z): чёрная ручка-скоба и белый фиксатор
  const endFittings = (x, y0, h, len) => {
    const ez = BZ + len / 2 + 0.008;
    parts.push(box(0.012, 0.05, 0.03, black, x - 0.045, y0 + h - 0.09, ez + 0.012));
    parts.push(box(0.012, 0.05, 0.03, black, x + 0.045, y0 + h - 0.09, ez + 0.012));
    parts.push(box(0.11, 0.014, 0.014, black, x, y0 + h - 0.045, ez + 0.03, 'ручка'));
    parts.push(rodZ(0.024, 0.012, white, x, y0 + h - 0.15, ez + 0.004, 24)); // белый фиксатор
    parts.push(rodZ(0.008, 0.016, inoxDark, x, y0 + h - 0.15, ez + 0.012, 12));
  };

  // ---- мукосей: открытый лоток 0,23 × 0,6 м поперёк ленты с мукой, валик-дозатор, завеса муки
  const flourMat = mat.color('#e9e6dd', 0, 0.95);
  const duster = (x, nm) => {
    const y0 = BT + 0.16;
    const h = 0.26;
    trough(x, y0, 0.23, 0.17, h, 0.6, nm);
    fill(x, y0, 0.23, 0.17, h, 0.6, 0.75, flourMat, 'мука');
    endFittings(x, y0, h, 0.6);
    parts.push(rodZ(0.02, 0.7, inoxDark, x, y0 - 0.02, BZ, 16)); // валик-дозатор под лотком
    for (const sz of [-1, 1]) parts.push(box(0.04, y0 - BT + 0.1, 0.03, inox, x, BT - 0.1, sz * (FZ + 0.03))); // кронштейны к раме
    // завеса муки
    const fh = y0 - 0.04 - BT;
    const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.05, fh, 0.56), flour);
    curtain.geometry.translate(0, -fh / 2, 0);
    curtain.position.set(x, y0 - 0.04, BZ);
    curtain.name = 'anim-flour'; // объём, в котором сыплется мука (частицы рисует двойник)
    parts.push(curtain);
  };

  // ---- тестоприёмник: короб 0,25 × 0,6 м и расширяющаяся кверху воронка 0,35 м, полная теста
  const HX = X0 + 1.2;
  const hY0 = BT + 0.18;
  parts.push(box(0.25, 0.16, 0.6, inox, HX, hY0, BZ, 'тестоприёмник'));
  trough(HX, hY0 + 0.16, 0.35, 0.25, 0.16, 0.6, 'воронка');
  fill(HX, hY0 + 0.16, 0.35, 0.25, 0.16, 0.6, 0.85, dough, 'тесто в бункере');
  // комья теста над краем
  {
    const lump = new THREE.SphereGeometry(1, 14, 10);
    const lumps = [[-0.08, 0.12, 0.07], [0.06, -0.15, 0.08], [0.0, 0.0, 0.09], [-0.05, -0.22, 0.06], [0.08, 0.18, 0.06], [-0.1, 0.24, 0.05]];
    for (const [dx, dz, r] of lumps) {
      const lm = new THREE.Mesh(lump, dough);
      lm.scale.set(r, r * 0.35, r * 1.2);
      lm.position.set(HX + dx, hY0 + 0.16 + 0.16 * 0.85, BZ + dz);
      parts.push(lm);
    }
  }
  // держатель на торце воронки (как на фото): квадратный блок на стойке
  parts.push(box(0.08, 0.1, 0.06, inox, HX, hY0 + 0.02, BZ + 0.33, 'держатель'));
  parts.push(box(0.025, 0.2, 0.025, inoxDark, HX, hY0 - 0.15, BZ + 0.33));

  duster(HX - 0.32, 'мукосей 1');

  // ---- рама-мост для бункеров: боковые щиты по краям ленты и полки под торцами лотков
  {
    const bx0 = HX - 0.48, bx1 = HX + 0.48;
    const pz = FZ + 0.025; // щиты чуть снаружи щёк ленты
    const top = BT + 0.03; // щиты низкие — видно, как сыплется мука; лотки стоят на стойках и полках
    for (const sz of [-1, 1]) {
      parts.push(box(bx1 - bx0, top - (BT - 0.13), 0.012, inox, (bx0 + bx1) / 2, BT - 0.13, sz * pz, 'щит рамы бункеров'));
      parts.push(box(bx1 - bx0 + 0.02, 0.02, 0.05, inoxDark, (bx0 + bx1) / 2, top, sz * (pz - 0.02))); // верхний отгиб
      // полки под торцами лотков: от щита внутрь до торца
      for (const [tx, w, base] of [[HX - 0.32, 0.17, BT + 0.16], [HX, 0.25, BT + 0.18], [HX + 0.32, 0.17, BT + 0.16]]) {
        const z0 = 0.29, z1 = pz;
        parts.push(box(w + 0.04, 0.02, z1 - z0, inoxDark, tx, base - 0.02, sz * (z0 + z1) / 2, 'полка'));
        parts.push(box(0.02, base - (BT - 0.05), 0.02, inoxDark, tx - w / 2 - 0.01, BT - 0.05, sz * (pz - 0.015))); // стойка
        parts.push(box(0.02, base - (BT - 0.05), 0.02, inoxDark, tx + w / 2 + 0.01, BT - 0.05, sz * (pz - 0.015)));
      }
    }
  }
  parts.push(box(0.27, 0.12, 0.62, inoxDark, HX, BT + 0.06, BZ, 'выход тестовой ленты'));
  // щиток привода тестоприёмника (сзади ленты): чуть выше уровня ленты; аварийный стоп и фланцы — снаружи
  const SX = HX;
  const SZ = -FZ - 0.2;
  const ST = BT + 0.15; // верх щитка
  const OF = SZ - 0.166; // наружная грань
  parts.push(box(0.4, ST - 0.05, 0.32, inox, SX, 0.05, SZ, 'щиток привода'));
  parts.push(box(0.42, 0.02, 0.34, inoxDark, SX, ST, SZ));
  parts.push(rodZ(0.028, 0.012, yellow, SX + 0.12, ST - 0.1, OF, 20));
  parts.push(rodZ(0.02, 0.03, red, SX + 0.12, ST - 0.1, OF - 0.02, 20)); // аварийный стоп
  for (const dy of [0.22, 0.3]) parts.push(rodZ(0.012, 0.01, dark, SX + 0.12, ST - dy, OF, 12));
  for (const dy of [0.12, 0.27]) parts.push(rodZ(0.035, 0.012, white, SX - 0.1, ST - dy, OF, 20)); // белые фланцы
  parts.push(box(0.12, 0.012, 0.012, black, SX, ST - 0.04, OF - 0.004)); // ручка-скоба

  duster(HX + 0.32, 'мукосей 2');
  // слой муки на ленте под первым мукосеем (до тестоприёмника)
  parts.push(box(0.36, 0.004, 0.56, mat.color('#f1eee6', 0, 0.95), HX - 0.32 + 0.07, BT, BZ, 'мука на ленте'));

  // ---- тестовая лента на транспортёре: от тестоприёмника до барабана
  const CUTX = X0 + 2.5; // барабан-вырубщик
  const PRX = X0 + 2.05; // прижимной вал
  parts.push(box(PRX - HX, 0.02, 0.62, dough, (HX + PRX) / 2, BT, BZ, 'тестовая лента'));
  // после вала — сплошная сжатая лента до самого барабана; после барабана — только круглые коржи
  parts.push(box(CUTX - PRX, 0.012, 0.64, dough, (PRX + CUTX) / 2, BT, BZ, 'тестовая лента (сжатая)'));

  // ---- прижимной вал: белый вал в синих кронштейнах, маховик регулировки — со стороны пульта
  const press = new THREE.Group();
  press.name = 'anim-roll';
  press.position.set(PRX, BT + 0.08, BZ);
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, BW - 0.04, 28), white);
  pm.rotation.x = Math.PI / 2;
  press.add(pm);
  press.add(box(0.01, 0.12, BW - 0.03, mat.color('#e2e2dc', 0, 0.6), 0, -0.06, 0)); // шов
  parts.push(press);
  parts.push(rodZ(0.02, BW + 0.22, inoxDark, PRX, BT + 0.08, BZ, 12)); // ось
  for (const sz of [-1, 1]) {
    parts.push(box(0.12, 0.3, 0.04, blue, PRX, BT - 0.05, sz * (FZ + 0.06), 'кронштейн вала'));
    parts.push(box(0.06, 0.18, 0.05, inoxDark, PRX, BT + 0.12, sz * (FZ + 0.06)));
  }
  // маховик регулировки зазора с указателем положения (как на фото) — со стороны пульта (−Z)
  {
    const wz = -(FZ + 0.06); // наружная плоскость кронштейна
    const wy = BT + 0.2;
    // стальной корпус механизма над синими кронштейнами
    parts.push(box(0.16, 0.16, 0.07, inox, PRX, BT + 0.12, wz, 'корпус регулятора'));
    for (const [bx, by] of [[-0.05, 0.25], [0.05, 0.25], [0, 0.25]]) parts.push(rodZ(0.008, 0.01, inoxDark, PRX + bx, BT + by, wz - 0.038, 8)); // болты
    const face = wz - 0.035; // наружная грань корпуса
    const wheel = new THREE.Group();
    wheel.position.set(PRX, wy, face);
    // чёрный маховик: обод, ступица; наружная сторона — в −Z
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 12, 40), black);
    rim.position.z = -0.03;
    wheel.add(rim);
    wheel.add(rodZ(0.075, 0.02, black, 0, 0, -0.02, 36)); // диск
    wheel.add(rodZ(0.05, 0.03, black, 0, 0, -0.035, 32)); // ступица
    // циферблат указателя: белый, красная стрелка, окно счётчика
    wheel.add(rodZ(0.042, 0.004, white, 0, 0, -0.052, 32));
    const needle = box(0.035, 0.004, 0.002, red, 0.012, -0.002, -0.055);
    needle.rotation.z = -0.35;
    wheel.add(needle);
    wheel.add(box(0.05, 0.012, 0.002, black, 0, -0.022, -0.055)); // окно счётчика 00007
    for (let k = 0; k < 4; k++) wheel.add(box(0.007, 0.008, 0.001, white, -0.016 + k * 0.011, -0.022, -0.057));
    // чёрная рукоятка на ободе, торчит наружу
    wheel.add(rodZ(0.014, 0.075, black, 0.05, 0.055, -0.075, 16));
    parts.push(wheel);
  }

  // ---- барабан-вырубщик: серый вал с кольцевыми ножами
  const cutter = new THREE.Group();
  cutter.name = 'anim-roll';
  cutter.position.set(CUTX, BT + 0.115, BZ);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, BW - 0.06, 32), grey);
  core.rotation.x = Math.PI / 2;
  cutter.add(core);
  // кромки ножей: наклонные кольца по спирали — вырубают круглые коржи
  const edge = mat.color('#b9c0c6', 0.7, 0.25);
  for (const [rz, tilt] of [[-0.27, 0.5], [-0.09, -0.5], [0.09, 0.5], [0.27, -0.5]]) {
    const knife = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.009, 8, 40), edge);
    knife.position.set(0, 0, rz);
    knife.rotation.y = tilt;
    cutter.add(knife);
  }
  parts.push(cutter);
  parts.push(rodZ(0.018, BW + 0.2, inoxDark, CUTX, BT + 0.115, BZ, 12));
  for (const sz of [-1, 1]) parts.push(box(0.14, 0.28, 0.04, inox, CUTX, BT - 0.05, sz * (FZ + 0.05), 'кронштейн барабана'));
  parts.push(rodZ(0.06, 0.02, inoxDark, CUTX, BT + 0.115, -FZ - 0.09, 24)); // фланец

  // ---- пульт на сужающейся книзу тумбе — с другой стороны линии (оператор стоит со стороны −Z)
  //      собирается лицом в +Z и разворачивается на 180°
  const PX = CUTX; // прямо за барабаном-вырубщиком (как на фото)
  const PZ = -(FZ + 0.3);
  const pult = new THREE.Group();
  pult.position.set(PX, 0, PZ);
  pult.rotation.y = Math.PI;
  {
    // тумба: трапеция, широкая сверху (0,46) и узкая снизу (0,3), одна опора
    const ped = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1);
    ped.rotateY(Math.PI / 4);
    const pp = ped.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      const top = pp.getY(k) > 0;
      pp.setX(k, Math.sign(pp.getX(k)) * (top ? 0.46 : 0.3) / 2);
      pp.setZ(k, Math.sign(pp.getZ(k)) * (top ? 0.3 : 0.22) / 2);
      pp.setY(k, top ? 0.98 : 0.08);
    }
    ped.computeVertexNormals();
    const pedM = new THREE.Mesh(ped, inox);
    pedM.name = 'тумба пульта';
    pult.add(pedM);
    pult.add(cyl(0.05, 0.02, black, 0, 0, 0, 20)); // опора
    pult.add(cyl(0.015, 0.07, inoxDark, 0, 0.02, 0, 10));
    // корпус пульта: шире тумбы, лицевая панель наклонена к оператору
    pult.add(box(0.56, 0.22, 0.36, inox, 0, 0.98, 0, 'корпус пульта'));
    const face = new THREE.Group();
    face.position.set(0, 1.2, 0.18);
    face.rotation.x = -0.5;
    face.add(box(0.56, 0.3, 0.014, inox, 0, -0.3, -0.007, 'лицевая панель'));
    // сенсорная панель в светло-серой рамке (слева), на ней живой экран
    face.add(box(0.2, 0.16, 0.016, mat.color('#d6d9dc', 0.15, 0.4), -0.13, -0.24, 0.002, 'рамка дисплея'));
    face.add(infoScreen(0.16, 0.115, -0.13, -0.16, 0.0105));
    // аварийный стоп — над дисплеем
    face.add(rodZ(0.035, 0.012, yellow, -0.13, -0.035, 0.006, 24));
    face.add(rodZ(0.026, 0.045, red, -0.13, -0.035, 0.03, 24));
    // кнопки 3 × 3 справа: STOP / START / RESET, переключатели
    const bx = [0.07, 0.15, 0.23];
    const rowY = [-0.075, -0.16, -0.245];
    const tags = (x, y) => face.add(box(0.05, 0.016, 0.003, white, x, y + 0.035, 0.002));
    [[red, bx[0]], [green, bx[1]], [blue, bx[2]]].forEach(([m, x]) => {
      tags(x, rowY[0]);
      face.add(rodZ(0.024, 0.01, inoxDark, x, rowY[0], 0.005, 20));
      face.add(rodZ(0.018, 0.016, m, x, rowY[0], 0.012, 20));
    });
    for (const x of bx) {
      tags(x, rowY[1]);
      face.add(rodZ(0.022, 0.01, black, x, rowY[1], 0.005, 20));
      face.add(box(0.008, 0.03, 0.012, inoxDark, x, rowY[1] - 0.015, 0.014)); // ручка переключателя
    }
    tags(bx[0], rowY[2]); tags(bx[1], rowY[2]); tags(bx[2], rowY[2]);
    face.add(box(0.04, 0.04, 0.012, black, bx[0], rowY[2] - 0.02, 0.006));
    face.add(rodZ(0.022, 0.01, black, bx[1], rowY[2], 0.005, 20));
    face.add(box(0.008, 0.03, 0.012, inoxDark, bx[1], rowY[2] - 0.015, 0.014));
    face.add(box(0.04, 0.04, 0.012, black, bx[2], rowY[2] - 0.02, 0.006));
    pult.add(face);
    // лампа состояния на торце корпуса
    const lampP = rodX(0.012, 0.01, mat.color('#2a6e3a', 0.1, 0.4), 0.285, 1.09, 0.05, 14);
    lampP.name = 'anim-status';
    pult.add(lampP);
    // логотип ALBA на тумбе: зелёные «A» по краям, жёлтые «LB» посередине, зелёная дуга, флажок, подпись
    const LY = 0.82;
    const LZ = 0.148; // лицевая грань тумбы на этой высоте
    const capL = 0.06;
    const a1 = label('A', capL, logoGreen, { stroke: 0.2, depth: 0.003 });
    const lb = label('LB', capL, logoYellow, { stroke: 0.22, gap: 0.08, depth: 0.003 });
    const a2 = label('A', capL, logoGreen, { stroke: 0.2, depth: 0.003 });
    const gap = 0.012;
    const total = a1.userData.width + lb.userData.width + a2.userData.width + 2 * gap;
    let lx = -total / 2;
    for (const g of [a1, lb, a2]) { g.position.set(lx, LY, LZ); pult.add(g); lx += g.userData.width + gap; }
    const swoosh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40, 1, Math.PI * 0.08, Math.PI * 0.84), logoGreen);
    swoosh.scale.set(0.19, 0.05, 1);
    swoosh.position.set(0, LY - 0.012, LZ + 0.001);
    pult.add(swoosh);
    pult.add(box(0.012, 0.014, 0.002, logoGreen, total / 2 - 0.02, LY + capL + 0.012, LZ + 0.001)); // флажок Италии
    pult.add(box(0.012, 0.014, 0.002, white, total / 2 - 0.008, LY + capL + 0.012, LZ + 0.001));
    pult.add(box(0.012, 0.014, 0.002, red, total / 2 + 0.004, LY + capL + 0.012, LZ + 0.001));
    const subtitle = label('ALBA BAKERY AND PASTRY EQUIPMENT', 0.011, mat.color('#3c4248', 0.2, 0.5), { stroke: 0.2, gap: 0.12, depth: 0.0015 });
    subtitle.position.set(-subtitle.userData.width / 2, LY - 0.035, LZ - 0.002);
    pult.add(subtitle);
  }
  parts.push(pult);

  // ---- вырубленные коржи: 2 ряда по 4, от барабана к концу ленты
  const N = 4;
  const fromX = CUTX + 0.12; // корж появляется сразу за барабаном
  const toX = X1 - 0.18;
  const discGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.012, 32);
  for (let k = 0; k < N; k++) {
    for (const rz of [-0.18, 0.18]) {
      const d = new THREE.Mesh(discGeo, dough);
      d.position.set(fromX + (k / N) * (toX - fromX), BT + 0.007, BZ + rz);
      d.name = 'anim-ball';
      d.userData = { phase: k / N, fromX, toX, period: 7 };
      parts.push(d);
    }
  }

  return group(parts);
}

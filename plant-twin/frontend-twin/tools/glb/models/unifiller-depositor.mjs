/**
 * Дозатор-депозитор UNIFILLER — модель по фотографии заказчика.
 * Габариты по данным заказчика (Д × Ш × В): 1550 × 990 × 1880 мм; компоновка — по чертежам производителя
 * (вид спереди и сверху: 1350 × 890 × 1600 мм), пропорционально увеличена до габаритов заказчика.
 * Упрощённая геометрия: передвижная рама на колёсах, ленточный конвейер (синяя лента) вдоль всей длины,
 * посередине сзади — стойка из нержавеющей стали с красной надписью UNIFILLER, рукояткой сверху, сенсорным
 * дисплеем, кнопками и аварийным стопом; на лицевой стороне стойки над лентой — бункер с дозирующей головкой
 * на 6 насадок (в ряд поперёк ленты), рычаг привода поршней; вдоль ленты — белая направляющая.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-tray    — лист на конвейере; параметры хода — в userData.conv (насадки, шаг колонок, старт и край);
 *                  пока аппарат работает, лист шагает под насадками, затем уезжает к краю и возвращается;
 *   anim-fill    — порция крема в формочке (userData.col — номер колонки): появляется при дозировании,
 *                  исчезает, когда лист доходит до края;
 *   anim-stream  — струйка крема из насадки во время дозирования;
 *   anim-dose    — шток поршня дозирующей головки: ход при каждой порции;
 *   anim-status  — лампа на стойке окрашивается в цвет состояния.
 * Оси: X — длина (вдоль конвейера), Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Дозатор UNIFILLER',
  units: 'm',
  note: 'По фото заказчика; габариты 1550 × 990 × 1880 мм (Д × Ш × В)',
};

export function build({ THREE, mat, box, cyl, cone, hopper, rodX, rodZ, group, label, infoScreen }) {
  const L = 1.55;
  const D = 0.99;
  const X0 = -L / 2;
  const X1 = L / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;

  const inox = mat.color('#cfd4d8', 0.45, 0.36);
  const inoxDark = mat.color('#a9afb4', 0.45, 0.42);
  const tube = mat.color('#b9bfc4', 0.5, 0.4);
  const belt = mat.color('#2f6fc4', 0.05, 0.55);
  const beltDark = mat.color('#24579c', 0.05, 0.6);
  const red = mat.color('#c8262b', 0.1, 0.4);
  const redLogo = mat.color('#d0302a', 0.1, 0.45);
  const black = mat.color('#141618', 0.1, 0.7);
  const dark = mat.color('#22272b', 0.2, 0.5);
  const white = mat.color('#eeeeea', 0.02, 0.55);
  const capBlue = mat.color('#2a6fd6', 0.05, 0.4);
  const tipWhite = mat.color('#f1f1ee', 0.02, 0.45); // наконечники насадок
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const green = mat.color('#2f9a4a', 0.1, 0.4);
  const rubber = mat.color('#2a2d30', 0, 0.9);
  const wheel = mat.color('#8d9296', 0.2, 0.6);
  const traySteel = mat.color('#8e959b', 0.55, 0.4);
  const shell = mat.color('#d9b25f', 0, 0.85); // формочка (корзиночка из теста)
  const cream = mat.color('#f7f1df', 0, 0.75); // крем

  const parts = [];

  // ---- компоновка (м): лента вдоль X, стойка по центру сзади, бункер на её лицевой стороне
  const BT = 0.81; // верх ленты (регулируется 0,69…0,81 по чертежу ×1,175)
  const BW = 0.41; // ширина ленты
  const BZ = 0.225; // ось ленты по глубине
  const CX = 0.07; // центр стойки
  const CW = 0.73; // ширина стойки
  const CF = -0.09; // лицевая плоскость стойки
  const CY0 = 0.33; // низ корпуса стойки
  const CY1 = 1.83; // верх корпуса стойки

  // ---- рама на колёсах: две опоры по глубине, поперечина, стойки до корпуса
  const FY = 0.1;
  const feet = [-0.34, 0.45];
  for (const fx of feet) {
    parts.push(box(0.07, 0.06, D - 0.06, tube, fx, FY, 0, 'опора рамы'));
    for (const fz of [Z0 + 0.055, Z1 - 0.055]) {
      parts.push(box(0.09, 0.012, 0.09, inoxDark, fx, FY - 0.012, fz));
      parts.push(cyl(0.032, 0.03, beltDark, fx, FY - 0.045, fz, 16)); // синий корпус поворотного узла
      parts.push(box(0.012, 0.05, 0.05, inoxDark, fx - 0.02, FY - 0.06, fz));
      parts.push(box(0.012, 0.05, 0.05, inoxDark, fx + 0.02, FY - 0.06, fz));
      parts.push(rodX(0.05, 0.026, rubber, fx, 0.05, fz, 24));
      parts.push(rodX(0.03, 0.03, wheel, fx, 0.05, fz, 16));
    }
  }
  parts.push(box(feet[1] - feet[0], 0.07, 0.07, tube, (feet[0] + feet[1]) / 2, FY, -0.3, 'поперечина'));
  for (const px of [CX - CW / 2 + 0.06, CX + CW / 2 - 0.06]) parts.push(box(0.08, CY0 - FY - 0.06, 0.08, tube, px, FY + 0.06, -0.3, 'стойка рамы'));

  // ---- стойка (корпус) с регулировочными ручками внизу
  const ZB = Z0 + 0.02; // задняя плоскость стойки (крышка и табличка выступают до Z0)
  parts.push(box(CW, CY1 - CY0, CF - ZB, inox, CX, CY0, (CF + ZB) / 2, 'стойка'));
  for (const dx of [-0.25, 0.25]) {
    parts.push(rodZ(0.035, 0.012, inoxDark, CX + dx, 0.5, CF + 0.006, 24)); // ручки регулировки высоты ленты
    parts.push(box(0.012, 0.05, 0.016, inox, CX + dx, 0.475, CF + 0.02));
  }
  parts.push(box(0.006, CY1 - CY0 - 0.02, 0.006, inoxDark, CX - 0.12, CY0 + 0.01, CF + 0.003)); // стыки панелей
  parts.push(box(0.006, CY1 - CY0 - 0.02, 0.006, inoxDark, CX + 0.12, CY0 + 0.01, CF + 0.003));
  // красные фиксаторы по бокам стойки
  for (const sx of [-1, 1]) parts.push(rodX(0.022, 0.03, red, CX + sx * (CW / 2 + 0.015), 1.47, CF - 0.06, 20));
  // боковые кронштейны от стойки к ленте (вид сверху)
  for (const sx of [-1, 1]) parts.push(box(0.03, 0.12, (BZ - BW / 2) - CF + 0.02, inoxDark, CX + sx * (CW / 2 - 0.02), BT - 0.16, (CF + BZ - BW / 2) / 2, 'кронштейн ленты'));
  // рукоятка сверху
  parts.push(box(0.12, 0.03, 0.09, inoxDark, CX + 0.05, CY1, -0.3, 'корпус рукоятки'));
  parts.push(box(0.16, 0.012, 0.02, inoxDark, CX + 0.12, CY1 + 0.03, -0.3));
  parts.push(cyl(0.01, 0.04, black, CX + 0.19, CY1 + 0.007, -0.3, 12)); // ручка — до 1,88 м
  parts[parts.length - 1].position.y = 1.86; // верх ручки — 1,88 м

  // большая надпись UNIFILLER: красные буквы на чёрной плашке в красной рамке
  const cap = 0.065;
  const word = label('UNIFILLER', cap, redLogo, { stroke: 0.2, gap: 0.12, depth: 0.003 });
  const wW = word.userData.width;
  const LX = CX;
  const LY = 1.72;
  const LZ = CF + 0.004;
  parts.push(box(wW + 0.07, cap + 0.06, 0.004, redLogo, LX, LY - 0.03, LZ));
  parts.push(box(wW + 0.055, cap + 0.045, 0.004, black, LX, LY - 0.0225, LZ + 0.002));
  word.position.set(LX - wW / 2, LY, LZ + 0.004);
  parts.push(word);

  // сенсорный дисплей и лампа состояния — на правой боковой стенке стойки (экраном вбок, в +X)
  const RX = CX + CW / 2; // правая боковая стенка
  const SZ = -0.3;
  const SY = 1.48;
  parts.push(box(0.02, 0.165, 0.2, dark, RX + 0.01, SY - 0.083, SZ, 'рамка дисплея'));
  parts.push(infoScreen(0.175, 0.13, RX + 0.0215, SY, SZ, 'info-screen', Math.PI / 2)); // живой экран на сенсорном дисплее
  parts.push(box(0.012, 0.08, 0.05, white, RX + 0.006, 1.24, SZ - 0.04, 'пост кнопок'));
  parts.push(rodX(0.012, 0.012, green, RX + 0.016, 1.3, SZ - 0.04, 16));
  parts.push(rodX(0.012, 0.012, red, RX + 0.016, 1.26, SZ - 0.04, 16));
  parts.push(rodX(0.011, 0.008, green, RX + 0.004, 1.62, SZ + 0.08, 16));
  parts[parts.length - 1].name = 'anim-status'; // лампа состояния
  // аварийный стоп и блок пневмоклапанов — на левой боковой стенке (как на фото)
  const LXW = CX - CW / 2;
  parts.push(rodX(0.03, 0.012, yellow, LXW - 0.006, 1.42, -0.2, 24));
  parts.push(rodX(0.022, 0.03, red, LXW - 0.027, 1.42, -0.2, 24)); // аварийный стоп
  parts.push(box(0.03, 0.2, 0.06, inoxDark, LXW - 0.015, 1.08, -0.2, 'блок клапанов'));
  for (let k = 0; k < 6; k++) parts.push(rodX(0.006, 0.05, inox, LXW - 0.05, 1.1 + k * 0.03, -0.22, 8));

  // ---- задняя сторона: гнутая панель из нержавейки, сверху планка с двумя болтами,
  // по центру — чёрная табличка MULTISTATION в красной рамке, под ней мелко UNIFILLER
  const BKZ = ZB; // задняя плоскость стойки
  parts.push(box(CW - 0.08, 1.1, 0.012, inox, CX, 0.46, BKZ - 0.006, 'задняя крышка'));
  for (const sx of [-1, 1]) parts.push(box(0.012, 1.1, 0.03, inoxDark, CX + sx * (CW / 2 - 0.04), 0.46, BKZ - 0.012, 'отгиб крышки'));
  parts.push(box(CW - 0.08, 0.012, 0.03, inoxDark, CX, 1.56, BKZ - 0.012)); // верхний отгиб
  parts.push(box(CW - 0.02, 0.006, 0.006, inoxDark, CX, 1.66, BKZ - 0.003)); // стык верхней планки
  for (const bx of [-0.06, 0.06]) parts.push(rodZ(0.012, 0.008, inoxDark, CX + bx, 1.76, BKZ - 0.004, 16)); // болты
  const backCap = 0.06;
  const back = label('MULTISTATION', backCap, redLogo, { stroke: 0.17, gap: 0.1, depth: 0.003 });
  const bW = back.userData.width;
  const BY = 1.33; // низ букв
  const plateW = bW + 0.08;
  parts.push(box(plateW + 0.012, 0.17, 0.004, redLogo, CX, BY - 0.07, BKZ - 0.014, 'табличка'));
  parts.push(box(plateW, 0.158, 0.004, black, CX, BY - 0.064, BKZ - 0.016));
  // надписи на задней стороне смотрят назад (в −Z): поворот на 180° вокруг вертикали
  back.rotation.y = Math.PI;
  back.position.set(CX + bW / 2, BY, BKZ - 0.018);
  parts.push(back);
  const bsCap = 0.016;
  const bs = label('UNIFILLER', bsCap, redLogo, { stroke: 0.2, gap: 0.12, depth: 0.002 });
  bs.rotation.y = Math.PI;
  bs.position.set(CX + bs.userData.width / 2, BY - 0.04, BKZ - 0.018);
  parts.push(bs);

  // ---- конвейер: синяя лента вдоль всей длины, боковые щёки, концевые ролики
  parts.push(box(L - 0.043, 0.03, BW, belt, 0, BT - 0.03, BZ, 'лента'));
  parts.push(box(L - 0.09, 0.012, BW - 0.02, beltDark, 0, BT - 0.085, BZ)); // обратная ветвь
  for (const rx of [X0 + 0.0215, X1 - 0.0215]) {
    parts.push(rodZ(0.0215, BW, belt, rx, BT - 0.0215, BZ, 24));
    parts.push(rodZ(0.012, BW + 0.05, inoxDark, rx, BT - 0.0215, BZ, 12));
  }
  for (const [sz, nm] of [[BZ + BW / 2 + 0.008, 'щека передняя'], [BZ - BW / 2 - 0.008, 'щека задняя']]) {
    parts.push(box(L - 0.06, 0.1, 0.012, inox, 0, BT - 0.09, sz, nm));
    parts.push(box(0.95, 0.06, 0.012, inox, 0.05, BT - 0.15, sz)); // утолщение щеки посередине
  }
  // натяжители и красная ручка натяжения
  parts.push(box(0.07, 0.03, 0.03, inoxDark, X1 - 0.09, BT - 0.05, BZ + BW / 2 + 0.03));
  parts.push(box(0.07, 0.03, 0.03, inoxDark, X0 + 0.09, BT - 0.05, BZ + BW / 2 + 0.03));
  parts.push(cyl(0.009, 0.04, red, X1 - 0.07, BT - 0.1, BZ + BW / 2 + 0.03, 12));
  // белая направляющая вдоль дальнего края ленты
  parts.push(box(1.25, 0.04, 0.03, white, 0.13, BT + 0.01, BZ - BW / 2 + 0.005, 'направляющая'));
  for (const gx of [-0.42, 0.68]) parts.push(cyl(0.012, 0.02, black, gx, BT + 0.05, BZ - BW / 2 + 0.005, 12));

  // табличка UNIFILLER, знак «Осторожно» и круглый логотип на передней щеке
  const smallCap = 0.024;
  const smallWord = label('UNIFILLER', smallCap, redLogo, { stroke: 0.2, gap: 0.12, depth: 0.002 });
  const swW = smallWord.userData.width;
  const SLX = 0.1;
  const SLY = BT - 0.07;
  const SLZ = BZ + BW / 2 + 0.014;
  parts.push(box(swW + 0.04, smallCap + 0.026, 0.004, redLogo, SLX, SLY - 0.013, SLZ + 0.002));
  parts.push(box(swW + 0.03, smallCap + 0.016, 0.004, black, SLX, SLY - 0.008, SLZ + 0.004));
  smallWord.position.set(SLX - swW / 2, SLY, SLZ + 0.006);
  parts.push(smallWord);
  parts.push(box(0.06, 0.04, 0.003, yellow, -0.3, BT - 0.075, SLZ + 0.002, 'знак осторожно'));
  parts.push(rodZ(0.02, 0.003, redLogo, 0.42, BT - 0.06, SLZ + 0.002, 20));

  // ---- бункер на лицевой стороне стойки и дозирующая головка
  const HX = -0.09; // ось бункера по длине
  const HZ = 0.19; // ось бункера по глубине
  const HY0 = 1.25; // низ бункера
  parts.push(hopper(0.59, 0.5, 0.13, 0.4, 0.45, inox, HX, HY0, HZ));
  parts.push(box(0.59, 0.012, 0.012, inoxDark, HX, HY0 + 0.444, HZ + 0.25)); // отбортовка
  parts.push(box(0.59, 0.012, 0.012, inoxDark, HX, HY0 + 0.444, HZ - 0.25));
  parts.push(box(0.012, 0.45, 0.012, inoxDark, HX, HY0, HZ + 0.11)); // шов бункера (вид спереди)
  parts.push(box(0.6, 0.5, 0.012, inox, HX, HY0 - 0.06, CF + 0.006, 'плита бункера')); // крепёжная плита на стойке
  parts.push(box(0.16, 0.12, 0.44, inox, HX, HY0 - 0.12, HZ, 'дозирующая головка'));
  parts.push(rodZ(0.04, 0.03, inoxDark, HX, HY0 - 0.08, HZ + 0.235, 24)); // торец поворотного клапана
  parts.push(rodZ(0.034, 0.04, capBlue, HX, HY0 - 0.08, HZ + 0.27, 24)); // синяя крышка
  parts.push(box(0.012, 0.18, 0.012, inoxDark, HX + 0.32, HY0 + 0.08, HZ - 0.15)); // тяга зажима
  parts.push(cyl(0.012, 0.05, red, HX + 0.32, HY0 + 0.26, HZ - 0.15, 12)); // красная ручка зажима
  // рычаг привода поршней с эксцентриком (справа от бункера)
  parts.push(box(0.4, 0.05, 0.015, inox, CX + 0.08, 1.2, CF + 0.03, 'рычаг привода'));
  parts.push(rodZ(0.045, 0.02, inoxDark, CX + 0.24, 1.28, CF + 0.02, 24)); // эксцентрик
  parts.push(rodZ(0.018, 0.03, inox, CX + 0.24, 1.28, CF + 0.04, 16));
  const dose = rodX(0.016, 0.3, inoxDark, HX + 0.24, HY0 - 0.08, HZ - 0.12, 16);
  dose.name = 'anim-dose'; // шток поршня
  parts.push(dose);

  // 6 насадок в ряд поперёк ленты: патрубок из головки влево, колено вниз, белый конический наконечник
  const NX = HX - 0.12; // ось кончиков насадок
  const ROWS = 6;
  const RP = 0.062; // шаг насадок поперёк ленты
  const PY = HY0 - 0.1; // ось патрубков
  const ER = 0.035; // радиус колена
  const PR = 0.011;
  const tipY = PY - ER - 0.04 - 0.05;
  const elbowGeo = new THREE.TorusGeometry(ER, PR, 10, 14, Math.PI / 2);
  for (let r = 0; r < ROWS; r++) {
    const z = BZ + (r - (ROWS - 1) / 2) * RP;
    const pipeLen = HX - 0.08 - (NX + ER);
    parts.push(rodX(PR, pipeLen, inox, NX + ER + pipeLen / 2, PY, z, 12)); // патрубок
    const elbow = new THREE.Mesh(elbowGeo, inox);
    elbow.position.set(NX + ER, PY - ER, z);
    elbow.rotation.z = Math.PI / 2; // дуга от патрубка (сверху) к вертикальной трубе (слева)
    parts.push(elbow);
    parts.push(cyl(PR, 0.04, inox, NX, PY - ER - 0.04, z, 12));
    parts.push(cyl(PR + 0.004, 0.012, inoxDark, NX, PY - ER - 0.045, z, 12)); // хомут
    parts.push(cone(0.016, 0.005, 0.05, tipWhite, NX, tipY, z, 16)); // наконечник
    const sLen = tipY - (BT + 0.035);
    const g = new THREE.CylinderGeometry(0.0045, 0.006, sLen, 10);
    g.translate(0, -sLen / 2, 0); // верх струйки — у кончика насадки
    const stream = new THREE.Mesh(g, cream);
    stream.position.set(NX, tipY, z);
    stream.name = 'anim-stream';
    parts.push(stream);
  }

  // ---- лист с формочками на ленте (двигается в двойнике)
  const COLS = 7;
  const CP = 0.058; // шаг колонок вдоль ленты
  const TL = 0.44;
  const TW = 0.38;
  const startX = X0 + 0.01 + TL / 2;
  const endX = X1 - 0.01 - TL / 2;
  const tray = new THREE.Group();
  tray.name = 'anim-tray';
  tray.position.set(startX, BT, BZ);
  tray.userData.conv = { nozzleX: NX, cols: COLS, pitch: CP, startX, endX };
  tray.add(box(TL, 0.008, TW, traySteel, 0, 0, 0, 'лист'));
  tray.add(box(TL, 0.012, 0.008, traySteel, 0, 0, TW / 2 - 0.004)); // бортики
  tray.add(box(TL, 0.012, 0.008, traySteel, 0, 0, -TW / 2 + 0.004));
  const cupGeo = new THREE.CylinderGeometry(0.024, 0.019, 0.014, 16);
  const dollopGeo = new THREE.SphereGeometry(0.019, 14, 10);
  dollopGeo.scale(1, 0.75, 1);
  for (let c = 0; c < COLS; c++) {
    const x = (c - (COLS - 1) / 2) * CP;
    for (let r = 0; r < ROWS; r++) {
      const z = (r - (ROWS - 1) / 2) * RP;
      const cup = new THREE.Mesh(cupGeo, shell);
      cup.position.set(x, 0.015, z);
      tray.add(cup);
      const d = new THREE.Mesh(dollopGeo, cream);
      d.position.set(x, 0.024, z);
      d.name = 'anim-fill';
      d.userData.col = c;
      tray.add(d);
    }
  }
  parts.push(tray);

  return group(parts);
}

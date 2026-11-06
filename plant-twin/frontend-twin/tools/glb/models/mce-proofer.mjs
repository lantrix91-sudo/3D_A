/**
 * Расстоечный шкаф M.C.E. Meccanica — модель по фотографии заказчика.
 * Габариты по данным заказчика: ширина 950 мм, длина (глубина) 1350 мм, высота 2440 мм.
 * Упрощённая геометрия: корпус из нержавеющей стали; на лицевой стороне — белая утеплённая дверь в белой
 * раме (чёрный уплотнитель и петли справа, стальная защёлка слева, жёлтый знак), сверху — козырёк-блок
 * управления из нержавейки с белой крышкой: чёрный сенсорный пульт слева, синий логотип M.C.E. meccanica
 * с жёлтым овалом, номер III у правого края.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-steam  — точка выхода пара (патрубок на крыше): пока шкаф работает, идёт пар;
 *   anim-status — лампа на пульте окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Расстоечный шкаф M.C.E. Meccanica',
  units: 'm',
  note: 'По фото заказчика; ширина 950, глубина 1350, высота 2440 мм',
};

export function build({ THREE, mat, box, cyl, rodZ, group, label, infoScreen }) {
  const W = 0.95;
  const D = 1.35;
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;
  const H = 2.44;

  const inox = mat.color('#d0d5d8', 0.45, 0.34);
  const inoxDark = mat.color('#a7adb2', 0.45, 0.4);
  const white = mat.color('#f1f1ee', 0.02, 0.62);
  const whiteFrame = mat.color('#e6e6e2', 0.02, 0.55);
  const black = mat.color('#141618', 0.1, 0.6);
  const dark = mat.color('#1f2428', 0.2, 0.5);
  const blue = mat.color('#2440a8', 0.1, 0.4);
  const yellowLogo = mat.color('#f0c419', 0.1, 0.4);
  const yellow = mat.color('#f2c230', 0.1, 0.45);

  const parts = [];

  // ---- корпус (лицевая плоскость отступает под козырёк и дверь)
  const BF = Z1 - 0.2; // лицевая плоскость корпуса (дверь и козырёк выступают)
  const HY0 = 2.02; // низ козырька
  parts.push(box(W, HY0, BF - Z0, inox, 0, 0, (BF + Z0) / 2, 'корпус'));
  parts.push(box(W - 0.02, H - 0.05 - HY0, BF - Z0 - 0.02, inox, 0, HY0, (BF + Z0) / 2 - 0.01, 'корпус верх'));
  // боковые стыки и цоколь
  for (const sz of [Z0 + 0.45, Z0 + 0.9]) {
    parts.push(box(0.006, HY0 - 0.02, 0.008, inoxDark, X1 - 0.002, 0.01, sz));
    parts.push(box(0.006, HY0 - 0.02, 0.008, inoxDark, X0 + 0.002, 0.01, sz));
  }

  // ---- белая рама и утеплённая дверь
  const FW = W - 0.1;
  parts.push(box(FW, HY0 - 0.02, 0.03, whiteFrame, 0, 0, BF + 0.015, 'рама двери'));
  const DW = FW - 0.12;
  const DX = -0.01;
  parts.push(box(DW, HY0 - 0.12, 0.05, white, DX, 0.04, BF + 0.045, 'дверь'));
  parts.push(box(DW - 0.04, 0.004, 0.004, whiteFrame, DX, HY0 - 0.1, BF + 0.071)); // кромка полотна
  // чёрный уплотнитель и петли справа
  parts.push(box(0.02, HY0 - 0.14, 0.03, black, DX + DW / 2 + 0.015, 0.05, BF + 0.04, 'уплотнитель'));
  for (const hy of [0.18, HY0 - 0.5]) {
    parts.push(box(0.03, 0.14, 0.04, black, DX + DW / 2 + 0.02, hy, BF + 0.06, 'петля'));
    parts.push(cyl(0.012, 0.05, white, DX + DW / 2 + 0.02, hy - 0.05, BF + 0.06, 12));
  }
  // стальная защёлка слева
  parts.push(box(0.05, 0.2, 0.02, inoxDark, DX - DW / 2 + 0.01, 0.95, BF + 0.08, 'защёлка'));
  parts.push(box(0.03, 0.14, 0.03, inox, DX - DW / 2 + 0.01, 0.98, BF + 0.095));
  // жёлтый предупреждающий знак
  const tri = new THREE.Shape();
  tri.moveTo(-0.045, 0); tri.lineTo(0.045, 0); tri.lineTo(0, 0.08); tri.closePath();
  const sign = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.002, bevelEnabled: false }), yellow);
  sign.position.set(DX, 1.72, BF + 0.07);
  sign.name = 'знак';
  parts.push(sign);

  // ---- козырёк — блок управления из нержавейки с белой крышкой
  const CZ0 = BF - 0.05; // козырёк: от корпуса до лицевой плоскости Z1
  const CZ1 = Z1 - 0.005;
  parts.push(box(W, H - 0.04 - HY0, CZ1 - CZ0, inox, 0, HY0, (CZ0 + CZ1) / 2, 'козырёк'));
  parts.push(box(W, 0.04, D, white, 0, H - 0.04, 0, 'белая крышка'));
  parts.push(box(W, 0.008, CZ1 - CZ0, inoxDark, 0, HY0 - 0.008, (CZ0 + CZ1) / 2)); // нижняя кромка
  const CF = Z1 - 0.005; // лицевая плоскость козырька
  // чёрный сенсорный пульт слева: живой экран на нём и лампа состояния
  const PX = X0 + 0.24;
  const PY = HY0 + 0.21;
  parts.push(box(0.2, 0.15, 0.008, black, PX, PY - 0.075, CF + 0.004, 'пульт'));
  parts.push(infoScreen(0.14, 0.09, PX, PY + 0.01, CF + 0.0085)); // живой экран на дисплее пульта
  for (let k = 0; k < 5; k++) parts.push(rodZ(0.006, 0.004, dark, PX - 0.06 + k * 0.03, PY - 0.055, CF + 0.009, 10));
  const lamp = rodZ(0.006, 0.004, mat.color('#2a6e3a', 0.1, 0.4), PX - 0.085, PY + 0.03, CF + 0.009, 10);
  lamp.name = 'anim-status';
  parts.push(lamp);
  // логотип M.C.E. meccanica: синие буквы и жёлтый овал
  const LX = X1 - 0.33;
  const LY = HY0 + 0.16;
  const word = label('M.C.E.', 0.085, blue, { stroke: 0.17, gap: 0.08, depth: 0.003 });
  word.position.set(LX - word.userData.width / 2, LY, CF + 0.001);
  parts.push(word);
  const sub = label('meccanica', 0.026, blue, { stroke: 0.18, gap: 0.22, depth: 0.002 });
  sub.position.set(LX - sub.userData.width / 2 + 0.03, LY - 0.035, CF + 0.001);
  parts.push(sub);
  const oval = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48, 1, 0.25, Math.PI * 1.35), yellowLogo);
  oval.scale.set(0.2, 0.065, 1);
  oval.rotation.z = 0.12;
  oval.position.set(LX + 0.01, LY + 0.04, CF + 0.0015);
  parts.push(oval);
  const oval2 = new THREE.Mesh(new THREE.RingGeometry(0.95, 1, 48, 1, Math.PI * 1.55, Math.PI * 0.6), yellowLogo);
  oval2.scale.set(0.2, 0.065, 1);
  oval2.rotation.z = 0.12;
  oval2.position.copy(oval.position);
  parts.push(oval2);
  // номер III у правого края
  parts.push(box(0.09, 0.08, 0.003, white, X1 - 0.07, HY0 + 0.25, CF + 0.001, 'номер'));
  for (let k = 0; k < 3; k++) parts.push(box(0.008, 0.05, 0.002, black, X1 - 0.09 + k * 0.02, HY0 + 0.265, CF + 0.003));

  // ---- патрубок пара на крыше
  const SX = 0.2;
  const SZ = Z0 + 0.35;
  const steam = new THREE.Object3D();
  steam.name = 'anim-steam';
  steam.position.set(SX, H, SZ);
  parts.push(steam);
  parts.push(cyl(0.035, 0.004, inoxDark, SX, H - 0.004, SZ, 16)); // решётка отвода пара в крышке

  return group(parts);
}

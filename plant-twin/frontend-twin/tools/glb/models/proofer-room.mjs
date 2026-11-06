/**
 * Расстоечная камера (камерного типа, под тележки) — модель по фотографии заказчика.
 * Габариты по данным заказчика: ширина 2240 мм (лицевая сторона с дверями), длина 3400 мм, высота 2630 мм.
 * Упрощённая геометрия: камера из сэндвич-панелей; на лицевой стороне — двустворчатые маятниковые двери
 * (белые полотна в серой рамке, овальные окна в чёрном уплотнителе, за стеклом — стеллаж тележки),
 * доводчики над створками, над дверями — щит управления из нержавейки (ручки, термостат, контроллер
 * с оранжевым дисплеем); на крыше — патрубок отвода пара.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-steam   — точка выхода пара (патрубок на крыше): пока камера работает, идёт пар;
 *   anim-display — дисплей контроллера: светится, пока камера работает;
 *   anim-status  — лампа на щите окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — длина (глубина), лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Расстоечная камера',
  units: 'm',
  note: 'По фото заказчика; ширина 2240, длина 3400, высота 2630 мм',
};

export function build({ THREE, mat, box, cyl, rodX, rodZ, group, infoScreen }) {
  const W = 2.24;
  const D = 3.4;
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;
  const BODY_H = 2.56; // корпус; патрубок пара — до 2,63 м
  const BF = Z1 - 0.1; // лицевая плоскость камеры; двери и щит выступают до Z1

  const wall = mat.color('#c7ccd0', 0.35, 0.42); // сэндвич-панели (серебристые)
  const seam = mat.color('#9aa0a5', 0.4, 0.45);
  const frameGrey = mat.color('#9aa3ab', 0.15, 0.5); // серая рамка дверей
  const leafWhite = mat.color('#ece9e1', 0.02, 0.7);
  const gasket = mat.color('#131516', 0.05, 0.7);
  const inox = mat.color('#d3d7da', 0.5, 0.35);
  const inoxDark = mat.color('#a8aeb3', 0.5, 0.4);
  const dark = mat.color('#1d2125', 0.2, 0.5);
  const black = mat.color('#111314', 0.1, 0.6);
  const white = mat.color('#f3f3f0', 0.02, 0.6);
  const rack = mat.color('#c9d3da', 0.6, 0.3);
  const glass = new THREE.MeshStandardMaterial({ color: '#a9c6d8', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 });
  const interior = mat.color('#4d6f86', 0.2, 0.4); // голубоватая подсветка камеры за стеклом
  const orangeDisp = new THREE.MeshStandardMaterial({ color: '#3a1a08', emissive: '#ff7a2a', emissiveIntensity: 1.0, roughness: 0.3 });

  const parts = [];

  // ---- камера из панелей
  parts.push(box(W - 0.006, BODY_H, BF - Z0, wall, 0, 0, (BF + Z0) / 2, 'корпус'));
  for (const sz of [Z0 + 0.85, Z0 + 1.7, Z0 + 2.55]) {
    parts.push(box(0.006, BODY_H - 0.02, 0.008, seam, X1 - 0.001, 0.01, sz));
    parts.push(box(0.006, BODY_H - 0.02, 0.008, seam, X0 + 0.001, 0.01, sz));
  }
  for (const sx of [X0 + 0.25, X1 - 0.25]) parts.push(box(0.008, BODY_H - 0.02, 0.006, seam, sx, 0.01, BF + 0.003));
  parts.push(box(W, 0.012, BF - Z0, seam, 0, BODY_H - 0.012, (BF + Z0) / 2, 'кромка крыши'));
  parts.push(box(W, 0.08, 0.01, white, 0, 0, BF + 0.005, 'цоколь'));

  // ---- проём и двустворчатые маятниковые двери
  const DH = 2.02; // высота створок
  const LW = 0.74; // ширина створки
  const GAP = 0.02;
  const DY0 = 0.04;
  parts.push(box(2 * LW + GAP + 0.12, DH + 0.08, 0.02, frameGrey, 0, DY0 - 0.02, BF + 0.01, 'коробка проёма'));
  const winShape = (w, h, r) => {
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(x0 + w, y0 + h - r); s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
    s.lineTo(x0 + r, y0 + h); s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
    return s;
  };
  for (const side of [-1, 1]) {
    const cx = side * (LW / 2 + GAP / 2);
    const fz = BF + 0.02; // лицевая плоскость створки
    parts.push(box(LW, DH, 0.05, frameGrey, cx, DY0, fz + 0.025 - 0.02, 'створка'));
    parts.push(box(LW - 0.14, DH - 0.16, 0.006, leafWhite, cx, DY0 + 0.08, fz + 0.033, 'филёнка'));
    // овальное окно: чёрный уплотнитель, за стеклом — подсвеченная камера и полки тележки
    const WW = 0.3, WH = 0.6, WY = DY0 + 1.25;
    const ring = winShape(WW + 0.05, WH + 0.05, 0.14);
    ring.holes.push(winShape(WW, WH, 0.12));
    const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.012, bevelEnabled: false, curveSegments: 10 }), gasket);
    gm.position.set(cx, WY, fz + 0.034);
    parts.push(gm);
    const back = new THREE.Mesh(new THREE.ShapeGeometry(winShape(WW, WH, 0.12), 10), interior);
    back.position.set(cx, WY, fz + 0.037);
    parts.push(back);
    if (side < 0) {
      for (let k = 0; k < 13; k++) parts.push(box(WW * 0.72, 0.008, 0.004, rack, cx, WY - WH / 2 + 0.05 + k * 0.04, fz + 0.04));
      parts.push(box(0.01, WH - 0.06, 0.004, rack, cx - WW * 0.36, WY - WH / 2 + 0.03, fz + 0.04));
      parts.push(box(0.01, WH - 0.06, 0.004, rack, cx + WW * 0.36, WY - WH / 2 + 0.03, fz + 0.04));
    }
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(winShape(WW, WH, 0.12), 10), glass);
    gl.position.set(cx, WY, fz + 0.044);
    parts.push(gl);
    // доводчик над створкой
    parts.push(rodX(0.022, 0.2, inoxDark, cx - side * 0.12, DY0 + DH + 0.04, fz + 0.02, 16));
    parts.push(box(0.05, 0.05, 0.04, inoxDark, cx - side * 0.24, DY0 + DH + 0.015, fz + 0.02));
  }
  // петли на боковых кромках
  for (const side of [-1, 1]) for (const hy of [0.5, 1.4]) {
    parts.push(box(0.03, 0.12, 0.03, inoxDark, side * (LW + GAP / 2 + 0.03), hy, BF + 0.03, 'петля'));
  }

  // ---- щит управления над дверями
  const PX = 0.05;
  const PY0 = 2.18;
  const PW = 0.92;
  const PH = 0.3;
  parts.push(box(PW, PH, 0.12, inox, PX, PY0, BF + 0.06 - 0.06, 'щит управления'));
  parts.push(box(PW - 0.06, PH - 0.08, 0.004, mat.color('#e2e5e7', 0.3, 0.4), PX, PY0 + 0.04, BF + 0.062, 'лицевая панель'));
  const KY = PY0 + 0.17;
  for (const [kx, r] of [[-0.38, 0.022], [-0.24, 0.024], [-0.12, 0.024], [0.0, 0.024]]) {
    parts.push(rodZ(r, 0.025, black, PX + kx, KY, BF + 0.075, 20)); // ручки
    parts.push(rodZ(r * 0.5, 0.01, inoxDark, PX + kx, KY, BF + 0.09, 12));
  }
  parts.push(box(0.09, 0.09, 0.012, dark, PX + 0.14, KY - 0.045, BF + 0.068, 'термостат'));
  parts.push(box(0.06, 0.03, 0.004, mat.color('#3a4a54', 0.1, 0.4), PX + 0.14, KY - 0.005, BF + 0.076));
  parts.push(box(0.14, 0.11, 0.012, dark, PX + 0.33, KY - 0.06, BF + 0.068, 'контроллер'));
  const disp = box(0.11, 0.045, 0.006, orangeDisp, PX + 0.33, KY - 0.0, BF + 0.077, 'anim-display');
  parts.push(disp);
  parts.push(box(0.11, 0.025, 0.006, black, PX + 0.33, KY - 0.04, BF + 0.077)); // строка цифр
  const lamp = rodZ(0.012, 0.01, mat.color('#2a6e3a', 0.1, 0.4), PX - 0.38, PY0 + 0.06, BF + 0.068, 16);
  lamp.name = 'anim-status';
  parts.push(lamp);
  parts.push(box(0.03, 0.03, 0.004, white, PX - 0.38, PY0 + 0.1, BF + 0.063)); // наклейки
  // гибкий рукав от щита вверх к крыше
  parts.push(cyl(0.03, BODY_H - (PY0 + PH), inoxDark, PX - 0.15, PY0 + PH, BF - 0.02, 16));

  // ---- живой экран — на месте таблички справа от щита
  parts.push(box(0.36, 0.3, 0.004, white, PX + 0.72, PY0 - 0.04, BF + 0.002, 'табличка'));
  parts.push(infoScreen(0.33, 0.27, PX + 0.72, PY0 + 0.11, BF + 0.0045));

  // ---- патрубок отвода пара на крыше и короб парогенератора
  const SX = 0.55;
  const SZ = Z0 + 0.9;
  parts.push(box(0.5, 0.05, 0.4, inoxDark, SX - 0.35, BODY_H, SZ + 0.3, 'короб на крыше'));
  parts.push(cyl(0.06, BODY_H + 0.07 - BODY_H, inox, SX, BODY_H, SZ, 24));
  const steam = new THREE.Object3D();
  steam.name = 'anim-steam';
  steam.position.set(SX, BODY_H + 0.07, SZ);
  parts.push(steam);
  parts.push(rodX(0.03, 1.2, inoxDark, -0.1, BODY_H + 0.03, Z0 + 0.4, 16)); // труба вдоль крыши

  return group(parts);
}

/**
 * Камера шоковой заморозки DEBAG KA-SF.2 eco — модель по фотографиям заказчика.
 * Габариты по данным заказчика (Ш × В × Г): 2100 × 2170 × 1700 мм.
 * Упрощённая геометрия: сборная камера из панелей нержавеющей стали; справа — утеплённая распашная дверь
 * с тремя чёрными петлями слева, рычажной ручкой справа и двумя чёрными отбойными полосами внизу; слева —
 * блок управления DEBAG (дисплей, зелёный индикатор, поворотная ручка) с вертикальным коробом к крыше,
 * предупреждающий знак; на крыше — трубы холодильного агрегата; над дверью — зелёная лампа.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-display — дисплей и индикатор блока управления: горят зелёным, пока камера работает, гаснут при остановке;
 *   anim-status  — лампа над дверью окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Камера шоковой заморозки DEBAG KA-SF.2 eco',
  units: 'm',
  note: 'По фото заказчика; габариты 2100 × 2170 × 1700 мм (Ш × В × Г)',
};

export function build({ THREE, mat, box, cyl, rodX, rodZ, group, label, infoScreen }) {
  const W = 2.1;
  const D = 1.7;
  const X0 = -W / 2;
  const X1 = W / 2;
  const Z0 = -D / 2;
  const Z1 = D / 2;
  const BODY_H = 2.1; // корпус; трубы агрегата — до 2,17 м
  const BF = Z1 - 0.17; // лицевая плоскость камеры; дверь, ручка и блок управления — до Z1

  const inox = mat.color('#cfd3d6', 0.42, 0.38);
  const inoxDark = mat.color('#a9aeb2', 0.45, 0.42);
  const seam = mat.color('#80868b', 0.5, 0.45);
  const black = mat.color('#17191b', 0.1, 0.65);
  const dark = mat.color('#22282c', 0.2, 0.5);
  const panelGreen = mat.color('#1d3b2b', 0.1, 0.55); // тёмно-зелёная лицевая панель блока
  const yellow = mat.color('#f2c230', 0.1, 0.45);
  const white = mat.color('#f2f2ef', 0.02, 0.6);
  const pipe = mat.color('#3a3e42', 0.2, 0.7); // трубы в чёрной изоляции
  const blue = mat.color('#2a5bd6', 0.05, 0.45);
  const debagRed = mat.color('#2b2f33', 0.2, 0.5);
  // дисплей и индикатор: светятся зелёным, пока камера работает (anim-display)
  const glowGreen = new THREE.MeshStandardMaterial({ color: '#0f2a18', emissive: '#4dff8a', emissiveIntensity: 1.1, roughness: 0.3 });
  const ledGreen = new THREE.MeshStandardMaterial({ color: '#0f3a1c', emissive: '#2dff6a', emissiveIntensity: 1.6, roughness: 0.3 });

  const parts = [];

  // ---- корпус камеры из панелей
  parts.push(box(W - 0.01, BODY_H, BF - Z0, inox, 0, 0, (BF + Z0) / 2, 'корпус'));
  // вертикальные стыки панелей на лицевой и боковых сторонах
  for (const sx of [X0 + 0.7, -0.27]) parts.push(box(0.008, BODY_H - 0.02, 0.008, seam, sx, 0.01, BF + 0.004));
  for (const sz of [Z0 + 0.55, Z0 + 1.1]) {
    parts.push(box(0.008, BODY_H - 0.02, 0.008, seam, X1 - 0.004, 0.01, sz));
    parts.push(box(0.008, BODY_H - 0.02, 0.008, seam, X0 + 0.004, 0.01, sz));
  }
  // угловые нащельники и цоколь
  for (const sx of [X0 + 0.025, X1 - 0.025]) parts.push(box(0.05, BODY_H, 0.05, inoxDark, sx, 0, BF - 0.02));
  parts.push(box(W, 0.06, 0.012, inoxDark, 0, 0, BF + 0.006, 'цоколь'));
  parts.push(box(W, 0.03, BF - Z0, inoxDark, 0, BODY_H - 0.03, (BF + Z0) / 2, 'карниз'));

  // ---- дверь справа: утеплённое полотно, рама, петли, ручка, отбойные полосы
  const DX0 = -0.2;
  const DX1 = X1 - 0.08;
  const DC = (DX0 + DX1) / 2;
  const DW = DX1 - DX0;
  const DH = 1.98;
  parts.push(box(DW + 0.08, DH + 0.06, 0.02, inoxDark, DC, 0.03, BF + 0.01, 'рама двери'));
  parts.push(box(DW, DH, 0.07, inox, DC, 0.06, BF + 0.055, 'дверь'));
  parts.push(box(DW - 0.04, 0.006, 0.004, seam, DC, 0.06 + DH - 0.02, BF + 0.092)); // кромка
  // три чёрные петли по левой кромке двери
  for (const hy of [0.28, 1.0, 1.72]) {
    parts.push(box(0.06, 0.2, 0.05, black, DX0 - 0.01, hy, BF + 0.045, 'петля'));
    parts.push(box(0.03, 0.18, 0.02, dark, DX0 + 0.02, hy + 0.01, BF + 0.09));
  }
  // рычажная ручка справа: кронштейн, чёрный рычаг, стержень вверх
  const HX = DX1 - 0.09;
  parts.push(box(0.05, 0.12, 0.04, inoxDark, HX, 1.0, BF + 0.11, 'кронштейн ручки'));
  parts.push(cyl(0.014, 0.3, inoxDark, HX, 1.1, BF + 0.12, 12)); // стержень
  parts.push(cyl(0.02, 0.08, black, HX, 1.4, BF + 0.12, 12)); // наконечник
  parts.push(rodZ(0.05, 0.05, black, HX - 0.02, 1.02, BF + 0.14, 24)); // чёрный рычаг замка
  parts.push(box(0.03, 0.06, 0.004, white, HX + 0.03, 0.98, BF + 0.093)); // табличка замка
  // две чёрные отбойные полосы внизу двери
  for (const sy of [0.28, 0.72]) {
    parts.push(box(DW - 0.02, 0.1, 0.02, black, DC, sy, BF + 0.1, 'отбойник'));
    for (const bx of [-0.35, 0, 0.35]) parts.push(rodZ(0.007, 0.004, inoxDark, DC + bx, sy + 0.05, BF + 0.112, 10));
  }
  // лист-инструкция на двери
  parts.push(box(0.3, 0.24, 0.003, white, DC + 0.12, 1.5, BF + 0.092, 'инструкция'));
  // зелёная лампа над дверью справа
  parts.push(box(0.05, 0.1, 0.05, black, DX1 - 0.04, BODY_H - 0.16, BF + 0.025, 'корпус лампы'));
  const lamp = cyl(0.016, 0.03, ledGreen, DX1 - 0.04, BODY_H - 0.14, BF + 0.055, 16);
  lamp.rotation.x = Math.PI / 2;
  lamp.name = 'anim-status';
  lamp.material = mat.color('#2a6e3a', 0.1, 0.4);
  parts.push(lamp);

  // ---- блок управления DEBAG слева
  const CX = X0 + 0.48;
  const CY0 = 1.25;
  const CW = 0.44;
  const CH = 0.3;
  parts.push(box(CW, CH, 0.1, inox, CX, CY0, BF + 0.05, 'блок управления'));
  parts.push(box(CW - 0.06, 0.13, 0.006, panelGreen, CX, CY0 + 0.12, BF + 0.103, 'лицевая панель'));
  const disp = box(0.11, 0.07, 0.006, glowGreen, CX - 0.01, CY0 + 0.15, BF + 0.107, 'anim-display');
  parts.push(disp);
  const led = rodZ(0.012, 0.006, ledGreen, CX - 0.12, CY0 + 0.2, BF + 0.108, 16);
  led.name = 'anim-display-led';
  parts.push(led);
  parts.push(box(0.016, 0.012, 0.006, white, CX - 0.12, CY0 + 0.15, BF + 0.107)); // кнопка под индикатором
  parts.push(rodZ(0.035, 0.008, dark, CX + 0.12, CY0 + 0.185, BF + 0.108, 24)); // поворотная ручка
  parts.push(rodZ(0.022, 0.012, inoxDark, CX + 0.12, CY0 + 0.185, BF + 0.112, 20));
  parts.push(rodZ(0.008, 0.006, inoxDark, CX, CY0 + 0.27, BF + 0.103, 12)); // замок крышки
  // надпись DEBAG на блоке
  const cap = 0.026;
  const word = label('DEBAG', cap, debagRed, { stroke: 0.2, gap: 0.12, depth: 0.002 });
  word.position.set(CX + CW / 2 - 0.03 - word.userData.width, CY0 + 0.02, BF + 0.1);
  parts.push(word);
  // вертикальный короб от блока к крыше
  parts.push(box(0.1, BODY_H - (CY0 + CH), 0.07, inox, CX + 0.08, CY0 + CH, BF + 0.035, 'короб кабеля'));
  // живой экран — на месте листа-инструкции над блоком управления
  parts.push(box(0.27, 0.35, 0.004, white, CX - 0.08, 1.64, BF + 0.002, 'рамка экрана'));
  parts.push(infoScreen(0.25, 0.32, CX - 0.08, 1.815, BF + 0.0045));
  // листок рядом с блоком и предупреждающий знак
  parts.push(box(0.16, 0.22, 0.003, white, CX + 0.33, CY0 + 0.04, BF + 0.0015, 'листок'));
  const tri = new THREE.Shape();
  tri.moveTo(-0.06, 0); tri.lineTo(0.06, 0); tri.lineTo(0, 0.1); tri.closePath();
  const sign = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.003, bevelEnabled: false }), yellow);
  sign.position.set(-0.42, 1.75, BF + 0.001);
  sign.name = 'знак';
  parts.push(sign);

  // ---- трубы холодильного агрегата на крыше
  const TY = BODY_H + 0.035;
  parts.push(rodX(0.035, 1.5, pipe, -0.05, TY, Z0 + 0.35, 16));
  parts.push(rodX(0.025, 1.2, pipe, 0.1, TY, Z0 + 0.5, 16));
  parts.push(rodZ(0.03, 0.9, pipe, X0 + 0.25, TY, Z0 + 0.8, 16));
  for (const [px, pz] of [[X0 + 0.25, BF - 0.15], [X0 + 0.45, Z0 + 0.35], [0.6, Z0 + 0.5]]) {
    parts.push(cyl(0.03, 0.035, pipe, px, BODY_H, pz, 16)); // вводы в крышу
  }
  parts.push(box(0.3, 0.06, 0.2, inoxDark, 0.7, BODY_H, Z0 + 0.2, 'клеммная коробка'));
  parts.push(rodZ(0.02, 0.02, blue, X0 + 0.2, BODY_H - 0.06, BF + 0.01, 12)); // синий датчик над блоком

  return group(parts);
}

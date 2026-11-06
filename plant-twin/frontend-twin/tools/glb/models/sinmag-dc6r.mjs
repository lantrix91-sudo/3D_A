/**
 * Расстоечная камера SINMAG DC-6R (две проходные камеры в одном блоке) — модель по фотографии заказчика.
 * Габариты по данным заказчика (Ш × Г × В): 2190 × 2000 × 2290 мм (высота — с компрессорами на крыше).
 * Лицевая сторона: два шкафа из нержавейки, у каждого козырёк с чёрной панелью управления (надпись SINMAG,
 * красный индикатор, жёлтые светодиоды, кнопки, зелёный индикатор «Работа»), распашная дверь с белым
 * отбойником по кромке и белой планкой внизу; у левого шкафа табличка «II». Задняя сторона такая же,
 * но без панелей управления (камера проходная). На крыше по краям — два компрессора с конденсаторами,
 * как у бытовых холодильников.
 *
 * Узлы для анимации в двойнике (соглашение anim-*, см. tools/glb/PHOTO_GUIDE.md):
 *   anim-display — красные индикаторы и зелёные светодиоды «Работа» горят, только пока камера работает;
 *   anim-steam   — точки выхода пара над каждой камерой (пар идёт, пока камера работает);
 *   anim-status  — светодиод состояния на панели окрашивается в цвет состояния.
 * Оси: X — ширина, Y — вверх, Z — глубина, лицевая сторона в +Z, низ на y = 0.
 */
export const meta = {
  name: 'Расстоечная камера SINMAG DC-6R',
  units: 'm',
  note: 'По фото заказчика; габариты 2190 × 2000 × 2290 мм (Ш × Г × В)',
};

export function build({ THREE, mat, box, cyl, group, label, infoScreen }) {
  const W = 2.19;
  const D = 2.0;
  const X0 = -W / 2;
  const X1 = W / 2;
  const ZF = D / 2;
  const ZB = -D / 2;
  const BODY_H = 1.84; // корпус под козырьком
  const HOOD0 = 1.84;
  const HOOD1 = 2.16; // верх козырька (крыша); компрессоры — до 2,29
  const OVER = 0.05; // козырёк выступает над дверями

  const inox = mat.color('#cfd3d6', 0.4, 0.36);
  const inoxDark = mat.color('#aeb3b7', 0.4, 0.4);
  const seam = mat.color('#8a9095', 0.4, 0.45);
  const white = mat.color('#eef0f1', 0.05, 0.5);
  const glass = mat.color('#121416', 0.3, 0.2);
  const paper = mat.color('#f7f7f5', 0, 0.8);
  const black = mat.color('#1a1c1e', 0.2, 0.6);
  const copper = mat.color('#b87333', 0.6, 0.4);

  const parts = [];

  // два шкафа и центральная стойка между ними
  const UNITS = [
    { x0: X0, x1: -0.125, panel: true, plaque: true },
    { x0: 0.135, x1: X1, panel: true, plaque: false },
  ];
  const BF = ZF - OVER - 0.028; // лицевая плоскость дверей (козырёк с панелью — до ZF)
  const BB = ZB + OVER + 0.028; // задняя плоскость дверей

  // общий корпус (между лицевой и задней дверями)
  parts.push(box(W, HOOD1, BF - BB - 0.04, inox, 0, 0, 0, 'корпус')); // корпус до крыши — без зазора между козырьками
  // центральная стойка между шкафами (утоплена)
  parts.push(box(0.26, HOOD1, BF - BB - 0.06, inoxDark, 0.005, 0, 0, 'стойка'));

  for (const side of [1, -1]) {
    // side = 1 — лицевая сторона (+Z), -1 — задняя (−Z, без панелей управления)
    const zFace = side > 0 ? BF : BB;
    const out = (dz) => zFace + side * dz; // смещение наружу от плоскости дверей
    for (const [ui, u] of UNITS.entries()) {
      const uc = (u.x0 + u.x1) / 2;
      const uw = u.x1 - u.x0;
      // рама шкафа вокруг двери
      parts.push(box(uw, BODY_H, 0.03, inox, uc, 0, out(-0.005)));
      parts.push(box(0.006, BODY_H - 0.04, 0.004, seam, u.x0 + 0.05, 0.02, out(0.012)));
      parts.push(box(0.006, BODY_H - 0.04, 0.004, seam, u.x1 - 0.05, 0.02, out(0.012)));
      // дверь: петли у внешнего края, отбойник — у внутреннего (к стойке)
      const DX0 = u.x0 + 0.06;
      const DX1 = u.x1 - 0.02;
      const DC = (DX0 + DX1) / 2;
      const DW = DX1 - DX0;
      parts.push(box(DW, 1.8, 0.035, inox, DC, 0.02, out(0.028), 'дверь'));
      // белый отбойник по кромке двери у стойки (на всю высоту)
      const bumperX = ui === 0 ? DX1 - 0.02 : DX0 + 0.02;
      parts.push(box(0.05, 1.82, 0.05, white, bumperX, 0.0, out(0.05), 'отбойник'));
      // белая планка внизу двери
      parts.push(box(DW - 0.12, 0.11, 0.025, white, DC + (ui === 0 ? -0.03 : 0.03), 0.22, out(0.055), 'планка'));
      // петли — у внешнего края шкафа
      for (const y of [0.55, 1.45]) parts.push(box(0.015, 0.09, 0.02, seam, ui === 0 ? DX0 + 0.012 : DX1 - 0.012, y, out(0.052)));
      // листы-инструкции на лицевых дверях
      if (side > 0) {
        if (ui === 0) parts.push(box(0.32, 0.22, 0.003, paper, DC - 0.12, 1.44, out(0.047), 'инструкция'));
        else {
          parts.push(box(0.2, 0.3, 0.003, paper, DC - 0.25, 1.36, out(0.047), 'инструкция'));
          parts.push(box(0.2, 0.3, 0.003, paper, DC - 0.02, 1.36, out(0.047)));
          parts.push(box(0.15, 0.18, 0.003, mat.color('#f2c230', 0.05, 0.6), DC + 0.3, 1.52, out(0.047), 'наклейка'));
        }
      }

      // козырёк с панелью управления (только спереди панель; сзади — гладкий)
      parts.push(box(uw, HOOD1 - HOOD0, OVER + 0.03, inox, uc, HOOD0, out(OVER / 2 - 0.015 + 0.02), 'козырёк'));
      parts.push(box(uw - 0.01, 0.006, 0.004, seam, uc, HOOD0 + 0.004, out(OVER + 0.022)));
      if (side > 0 && u.panel) {
        const pz = out(OVER + 0.022);
        const PW = 0.6;
        const PH = 0.14;
        const PY = 1.95;
        const pcx = uc - 0.04;
        parts.push(box(PW, PH, 0.006, glass, pcx, PY, pz, 'панель управления'));
        // надпись SINMAG (белая, слева на панели)
        const word = label('SINMAG', 0.026, mat.color('#e8e8e8', 0.1, 0.5), { stroke: 0.2, gap: 0.12, depth: 0.0015 });
        word.position.set(pcx - PW / 2 + 0.03, PY + PH - 0.05, pz + 0.003);
        word.name = 'надпись SINMAG';
        parts.push(word);
        // красный индикатор (горит в работе) и жёлтые светодиоды
        const red = new THREE.MeshStandardMaterial({ color: '#3a0606', emissive: '#ff2a1a', emissiveIntensity: 1.3, roughness: 0.3 });
        const disp = box(0.075, 0.03, 0.002, red, pcx - 0.08, PY + PH - 0.055, pz + 0.004, `anim-display-${ui}-red`);
        parts.push(disp);
        for (const dx of [-0.085, -0.065]) parts.push(box(0.012, 0.007, 0.002, mat.color('#f0b020', 0.1, 0.4), pcx + dx, PY + 0.055, pz + 0.004));
        // зелёный индикатор «Работа»
        const green = new THREE.MeshStandardMaterial({ color: '#0b2a14', emissive: '#28e06a', emissiveIntensity: 1.4, roughness: 0.3 });
        const led = cylZ(THREE, 0.008, 0.004, green, pcx - 0.02, PY + 0.055, pz + 0.004);
        led.name = `anim-display-${ui}-green`;
        parts.push(led);
        // светодиод состояния (цвет состояния)
        const st = cylZ(THREE, 0.005, 0.004, new THREE.MeshStandardMaterial({ color: '#2fbf71', emissive: '#2fbf71', emissiveIntensity: 1 }), pcx + 0.025, PY + 0.104, pz + 0.004);
        st.name = `anim-status-${ui}`;
        parts.push(st);
        // живой экран на панели управления (правее надписи SINMAG)
        parts.push(infoScreen(0.4, 0.12, pcx + 0.09, PY + PH / 2, pz + 0.012, `info-screen-${ui}`));
        // ряд кнопок и белые значки
        for (let i = 0; i < 7; i++) parts.push(box(0.022, 0.016, 0.002, mat.color('#3a3d40', 0.2, 0.5), pcx - 0.06 + i * 0.03, PY + 0.022, pz + 0.004));
        parts.push(box(0.03, 0.03, 0.002, mat.color('#3a3d40', 0.2, 0.5), pcx + 0.06, PY + 0.085, pz + 0.004));
        parts.push(box(0.016, 0.02, 0.002, mat.color('#3a3d40', 0.2, 0.5), pcx - 0.01, PY + 0.098, pz + 0.004));
        if (u.plaque) {
          // табличка «II» справа от панели
          parts.push(box(0.09, 0.1, 0.004, white, pcx + PW / 2 + 0.07, PY + 0.02, pz + 0.001, 'табличка II'));
          for (const dx of [-0.015, 0.015]) parts.push(box(0.012, 0.07, 0.002, black, pcx + PW / 2 + 0.07 + dx, PY + 0.035, pz + 0.004));
          parts.push(box(0.06, 0.008, 0.002, black, pcx + PW / 2 + 0.07, PY + 0.031, pz + 0.004));
          parts.push(box(0.06, 0.008, 0.002, black, pcx + PW / 2 + 0.07, PY + 0.101, pz + 0.004));
        }
      }
    }
  }

  // крыша: плита
  parts.push(box(W, 0.01, D - 0.01, inoxDark, 0, HOOD1 - 0.01, 0, 'крыша'));

  // два компрессора с конденсаторами по краям (как у бытового холодильника)
  for (const sx of [-1, 1]) {
    const cx = sx * (X1 - 0.25);
    const g = new THREE.Group();
    g.name = 'холодильный агрегат';
    // опорная плита
    g.add(box(0.42, 0.01, 0.5, inoxDark, cx, HOOD1, 0));
    // компрессор: чёрная «капсула» на амортизаторах
    for (const [dx, dz] of [[-0.07, -0.06], [0.07, -0.06], [-0.07, 0.06], [0.07, 0.06]]) g.add(cyl(0.012, 0.015, black, cx + dx - sx * 0.05, HOOD1 + 0.01, dz, 8));
    const can = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.03, 6, 16), black);
    can.position.set(cx - sx * 0.05, HOOD1 + 0.072, 0);
    can.scale.set(1, 0.72, 0.9);
    can.name = 'компрессор';
    g.add(can);
    // патрубки
    g.add(cyl(0.006, 0.03, copper, cx - sx * 0.05 + 0.03, HOOD1 + 0.1, 0.03, 8));
    g.add(cyl(0.006, 0.03, copper, cx - sx * 0.05 - 0.03, HOOD1 + 0.1, -0.03, 8));
    // конденсатор: решётка из трубок и рёбер на стойке
    const CX = cx + sx * 0.13;
    const coil = new THREE.Group();
    for (let i = 0; i < 6; i++) coil.add(box(0.008, 0.11, 0.42, copper, CX + (i - 2.5) * 0.012, HOOD1 + 0.015, 0));
    for (let j = 0; j < 9; j++) coil.add(box(0.075, 0.003, 0.42, black, CX, HOOD1 + 0.02 + j * 0.012, 0));
    coil.name = 'конденсатор';
    g.add(coil);
    g.add(box(0.09, 0.008, 0.44, inoxDark, CX, HOOD1 + 0.125, 0));
    parts.push(g);
  }

  // точки выхода пара над каждой камерой
  for (const u of UNITS) {
    const st = new THREE.Group();
    st.name = 'anim-steam';
    st.position.set((u.x0 + u.x1) / 2 + (u.x0 < 0 ? 0.15 : -0.15), HOOD1 + 0.01, 0);
    parts.push(st);
  }

  return group(parts);
}

/** Короткий цилиндр с осью вдоль Z */
function cylZ(THREE, r, len, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

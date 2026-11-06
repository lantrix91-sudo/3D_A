import { makeLabel } from './font.mjs';

/** Набор примитивов и материалов для быстрого моделирования оборудования по фото (метры). */
export function makeKit(THREE) {
  const m = (color, metalness = 0.1, roughness = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const mat = {
    steel: m('#c3cbd2', 0.75, 0.32),
    steelDark: m('#7f8a94', 0.7, 0.4),
    brushed: m('#d7dde2', 0.6, 0.45),
    white: m('#e9edf0', 0.1, 0.5),
    paintBlue: m('#2f5d8c', 0.2, 0.5),
    paintRed: m('#b23a32', 0.2, 0.5),
    paintGreen: m('#3c7a4a', 0.2, 0.5),
    paintGrey: m('#6b737a', 0.3, 0.55),
    panel: m('#23292f', 0.2, 0.6),
    black: m('#15191d', 0.1, 0.8),
    rubber: m('#2b2f33', 0, 0.9),
    glass: m('#9fc4d8', 0, 0.08, { transparent: true, opacity: 0.3 }),
    screen: m('#0d1a20', 0, 0.4, { emissive: '#2a6f8f', emissiveIntensity: 0.6 }),
    dough: m('#ead9b8', 0, 0.95),
    yellow: m('#e0b02a', 0.2, 0.5),
    color: (c, metal = 0.2, rough = 0.5) => m(c, metal, rough),
  };
  const place = (mesh, x, y, z, name) => {
    mesh.position.set(x, y, z);
    if (name) mesh.name = name;
    return mesh;
  };
  /** Параллелепипед: центр (x, z), низ на высоте y0 */
  const box = (w, h, d, material, x = 0, y0 = 0, z = 0, name) =>
    place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), x, y0 + h / 2, z, name);
  /** Цилиндр вертикальный: центр основания (x, y0, z) */
  const cyl = (r, h, material, x = 0, y0 = 0, z = 0, seg = 32, name) =>
    place(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material), x, y0 + h / 2, z, name);
  /** Усечённый конус (бункер): rTop, rBottom */
  const cone = (rTop, rBottom, h, material, x = 0, y0 = 0, z = 0, seg = 32, name) =>
    place(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material), x, y0 + h / 2, z, name);
  /** Пирамидальный бункер прямоугольного сечения */
  const hopper = (wTop, dTop, wBot, dBot, h, material, x = 0, y0 = 0, z = 0) => {
    const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, true);
    g.rotateY(Math.PI / 4);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const top = pos.getY(i) > 0;
      pos.setX(i, Math.sign(pos.getX(i)) * (top ? wTop : wBot) / 2);
      pos.setZ(i, Math.sign(pos.getZ(i)) * (top ? dTop : dBot) / 2);
      pos.setY(i, top ? h : 0);
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.material.side = THREE.DoubleSide;
    return place(mesh, x, y0, z);
  };
  /** Горизонтальный вал/ролик вдоль X */
  const rodX = (r, len, material, x = 0, y = 0, z = 0, seg = 20) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
    mesh.rotation.z = Math.PI / 2;
    return place(mesh, x, y, z);
  };
  /** Горизонтальный вал/ролик вдоль Z */
  const rodZ = (r, len, material, x = 0, y = 0, z = 0, seg = 20) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), material);
    mesh.rotation.x = Math.PI / 2;
    return place(mesh, x, y, z);
  };
  /** Четыре опоры по углам прямоугольника w × d */
  const legs = (w, d, h, r, material, inset = 0.05) => {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(r, h, material, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 12));
    return g;
  };
  const group = (...children) => {
    const g = new THREE.Group();
    children.flat().forEach((c) => g.add(c));
    return g;
  };
  /** Надпись блочным шрифтом: высота заглавных h (м), левый нижний угол в (0, 0, 0) */
  const label = (text, h, material, opts) => makeLabel(THREE, text, h, material, opts);
  /** Патрубок дымохода/вытяжки на крыше: обечайка и тёмное отверстие; низ на y0 */
  const chimney = (r, h, material, x, y0, z) => {
    const g = new THREE.Group();
    g.add(cyl(r, h, material, x, y0, z, 32));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r - 0.005, 0.005, 8, 32), material);
    lip.rotation.x = Math.PI / 2;
    lip.position.set(x, y0 + h - 0.005, z); // валик вровень с верхом патрубка
    g.add(lip);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r - 0.014, 32), new THREE.MeshStandardMaterial({ color: '#0b0d0f', roughness: 0.9 }));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, y0 + h + 0.001, z);
    g.add(hole);
    g.name = 'дымоход';
    return g;
  };
  /**
   * «Живой» экран: плоскость, на которой двойник рисует позицию, показание и состояние оборудования.
   * Центр (x, y, z), лицом в +Z (rotY — поворот вокруг вертикали). Имя должно начинаться с info-screen.
   */
  const infoScreen = (w, h, x, y, z, name = 'info-screen', rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#0a1216' }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.name = name;
    return m;
  };
  return { THREE, mat, box, cyl, cone, hopper, rodX, rodZ, legs, group, label, chimney, infoScreen };
}

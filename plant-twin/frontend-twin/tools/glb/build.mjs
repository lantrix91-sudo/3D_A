/**
 * Сборка GLB-модели оборудования из описания на three.js (без браузера).
 *
 *   node tools/glb/build.mjs tools/glb/models/sample-divider.mjs models/sample-divider.glb
 *
 * Модуль модели экспортирует:
 *   meta  — { name, units: 'm', note }
 *   build(kit) → THREE.Object3D; kit = { THREE, mat, box, cyl, ... } из kit.mjs
 * Единицы — метры, Y — вверх, лицевая сторона смотрит в +Z, низ — на y = 0.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { makeKit } from './kit.mjs';

// GLTFExporter использует FileReader — в Node его нет
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); this.onload?.({ target: this }); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.(); this.onload?.({ target: this });
    });
  }
};

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Использование: node tools/glb/build.mjs <модель.mjs> <выход.glb>');
  process.exit(1);
}
const mod = await import(pathToFileURL(resolve(src)).href);
const root = mod.build(makeKit(THREE));
root.name = mod.meta?.name ?? 'equipment';
root.updateMatrixWorld(true);

const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3());
let tris = 0;
root.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });

const glb = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, Buffer.from(glb));
console.log(`${out}: ${(glb.byteLength / 1024).toFixed(0)} КБ; габариты ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} м (Ш × В × Г); треугольников ${Math.round(tris)}; низ y = ${box.min.y.toFixed(3)}`);

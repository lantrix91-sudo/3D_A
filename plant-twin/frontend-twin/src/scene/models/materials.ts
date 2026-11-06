import * as THREE from 'three';

/** Общие материалы упрощённых моделей (создаются один раз). */
export const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#c3cbd2', metalness: 0.75, roughness: 0.32 }),
  steelDark: new THREE.MeshStandardMaterial({ color: '#7f8a94', metalness: 0.7, roughness: 0.4 }),
  brushed: new THREE.MeshStandardMaterial({ color: '#d7dde2', metalness: 0.6, roughness: 0.45 }),
  panel: new THREE.MeshStandardMaterial({ color: '#23292f', metalness: 0.2, roughness: 0.6 }),
  black: new THREE.MeshStandardMaterial({ color: '#15191d', metalness: 0.1, roughness: 0.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#2b2f33', metalness: 0, roughness: 0.9 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: '#9fc4d8', metalness: 0, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.28,
  }),
  dough: new THREE.MeshStandardMaterial({ color: '#ead9b8', roughness: 0.95 }),
  bread: new THREE.MeshStandardMaterial({ color: '#c58a4a', roughness: 0.85 }),
  tray: new THREE.MeshStandardMaterial({ color: '#9aa3ab', metalness: 0.6, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: '#e9edf0', metalness: 0.1, roughness: 0.5 }),
  wood: new THREE.MeshStandardMaterial({ color: '#b08a5e', roughness: 0.8 }),
};

export const screenMaterial = (color: string) =>
  new THREE.MeshStandardMaterial({ color: '#0d1a20', emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });

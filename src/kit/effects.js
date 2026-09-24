import * as THREE from 'three';

// A soft round sprite for particles (steam, air, spray).
export function softDot(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2, grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size); return new THREE.CanvasTexture(c);
}

// A speckled greyscale texture; tint it with the material colour (bread crumb, stone, food).
export function speckleTexture({ size = 128, count = 420, repeat = 0.9 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const shade = 200 + Math.random() * 45 | 0; g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath(); g.ellipse(Math.random() * size, Math.random() * size, 1 + Math.random() * 2.5, 0.8 + Math.random() * 1.6, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
}

// A particle cloud. seed(i) returns per-particle data; call place(i, x, y, z) then commit().
export function createParticles(scene, count, { color = 0xffffff, size = 0.1, map = null, seed = () => ({}) } = {}) {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, map, transparent: true, opacity: 0, depthWrite: false });
  const points = new THREE.Points(geometry, material); scene.add(points);
  const seeds = Array.from({ length: count }, (_, i) => seed(i));
  return {
    points, material, seeds,
    place(i, x, y, z) { positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z; },
    commit() { geometry.attributes.position.needsUpdate = true; },
    // Ease the cloud's opacity toward target; returns true while it is worth updating.
    fade(target, rate) { material.opacity += (target - material.opacity) * rate; return material.opacity > 0.01; },
  };
}

// Colour of a heated wire: black → dull red → orange as glow goes 0 → 1. Writes into out.
const WARM = new THREE.Color(0x8a1a05).convertSRGBToLinear(), HOT = new THREE.Color(0xff6a1a).convertSRGBToLinear();
export function heatColor(glow, out) {
  return glow < 0.5 ? out.setRGB(0, 0, 0).lerp(WARM, glow * 2) : out.copy(WARM).lerp(HOT, glow * 2 - 1);
}

import * as THREE from 'three';

// Reusable surface looks. Each call makes new materials, so pages never share state.
export const LOOKS = {
  steel: { color: 0xd4d9de, metalness: 0.9, roughness: 0.22 },
  brushed: { color: 0xb8bec6, metalness: 0.7, roughness: 0.35 },
  aluminium: { color: 0xd5dae0, metalness: 0.7, roughness: 0.3 },
  copper: { color: 0xc4703a, metalness: 0.85, roughness: 0.3 },
  brass: { color: 0xd6a44a, metalness: 0.85, roughness: 0.3 },
  iron: { color: 0x4a525b, metalness: 0.6, roughness: 0.5 },
  plastic: { color: 0x252c33, metalness: 0.1, roughness: 0.55 },
  dark: { color: 0x14181c, metalness: 0.2, roughness: 0.7 },
  rubber: { color: 0x1c1f22, metalness: 0, roughness: 0.9 },
  wire: { color: 0xc43a3a, roughness: 0.6 },
};

// Hex colours are sRGB. A PBR stage renders in linear light, so convert for it.
export const linear = hex => new THREE.Color(hex).convertSRGBToLinear();

// defs: { name: 'steel' | { look?: 'steel', ...materialParams } }. pbr converts colours to linear.
export function createMaterials(defs, { pbr = false } = {}) {
  const out = {};
  for (const [name, def] of Object.entries(defs)) {
    const { look, ...params } = typeof def === 'string' ? { look: def } : def;
    if (look && !LOOKS[look]) throw new Error(`Unknown look "${look}" for material "${name}"`);
    const material = new THREE.MeshStandardMaterial({ ...(look ? LOOKS[look] : {}), ...params });
    if (pbr) material.color.convertSRGBToLinear();
    out[name] = material;
  }
  return out;
}

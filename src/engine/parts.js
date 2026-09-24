import * as THREE from 'three';

const BLACK = new THREE.Color(0x000000);

// A registry of named, explodable parts. Each part has a home position and an
// offset it moves along as the explode amount goes from 0 to 1.
export function createParts(root, { shadows = false } = {}) {
  const parts = {};

  function add(name, object, home, offset, parent = root) {
    const group = new THREE.Group(); group.add(object); group.position.copy(home); parent.add(group);
    const meshes = [];
    object.traverse(item => {
      if (!item.isMesh) return;
      meshes.push(item);
      if (shadows) { item.castShadow = !item.userData.noShadow; item.receiveShadow = !item.userData.noShadow; }
    });
    parts[name] = { group, home: home.clone(), offset: offset.clone(), meshes };
    return group;
  }

  function explode(amount) {
    Object.values(parts).forEach(p => p.group.position.copy(p.home).addScaledVector(p.offset, amount));
  }

  // Each mesh gets its own material copy, so opacity and glow can differ per part.
  function materials(mesh) {
    if (!mesh.userData.ownMaterial) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
      mesh.userData.ownMaterial = true;
    }
    return [].concat(mesh.material);
  }

  // style.opacity(name, mesh, hot) -> 0..1; style.decorate(material, {name, mesh, hot}) is optional.
  // Without decorate, focused parts glow faintly in their own colour.
  function applyFocus(focus, { opacity = () => 1, highlight = 0.2, decorate } = {}) {
    Object.entries(parts).forEach(([name, part]) => {
      const hot = focus.includes(name);
      part.meshes.forEach(mesh => {
        const alpha = opacity(name, mesh, hot);
        materials(mesh).forEach(material => {
          material.transparent = alpha < 0.99; material.opacity = alpha; material.depthWrite = alpha > 0.9;
          if (decorate) decorate(material, { name, mesh, hot });
          else if (material.emissive) { material.emissive.copy(hot ? material.color : BLACK); material.emissiveIntensity = hot ? highlight : 0; }
        });
      });
    });
  }

  // One call per frame: ease the explode amount, move the parts, and reapply focus
  // so opacity follows the explode amount while it animates.
  function update(state, style, rate = 0.09) {
    state.explode += (state.targetExplode - state.explode) * rate;
    explode(state.explode);
    applyFocus(state.focus, style);
  }

  return { parts, add, explode, applyFocus, update, materials };
}

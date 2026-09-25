import * as THREE from 'three';

const BLACK = new THREE.Color(0x000000);

// A registry of named, explodable parts. Each part has a home position and an
// offset it moves along as the explode amount goes from 0 to 1.
// lively: true gives each part its own springy, slightly staggered explode, fades focus
// changes instead of cutting, and makes focused parts breathe with a soft glow.
export function createParts(root, { shadows = false, lively = false } = {}) {
  const parts = {};
  let order = 0, clock = 0;

  function add(name, object, home, offset, parent = root) {
    const group = new THREE.Group(); group.add(object); group.position.copy(home); parent.add(group);
    const meshes = [];
    object.traverse(item => {
      if (!item.isMesh) return;
      meshes.push(item);
      if (shadows) { item.castShadow = !item.userData.noShadow; item.receiveShadow = !item.userData.noShadow; }
    });
    // Stagger: parts further down the list move a little later and settle a little softer.
    const lag = (order++ % 7) / 7;
    parts[name] = { group, home: home.clone(), offset: offset.clone(), meshes, amount: lively ? 1.3 : 0, speed: 0, stiffness: 0.075 - lag * 0.03 };
    return group;
  }

  function explode(amount) {
    Object.values(parts).forEach(p => { p.amount = amount; p.speed = 0; p.group.position.copy(p.home).addScaledVector(p.offset, amount); });
  }

  // Each part follows the target on a damped spring, so it overshoots a little and settles.
  function springExplode(target) {
    Object.values(parts).forEach(p => {
      p.speed = p.speed * 0.76 + (target - p.amount) * p.stiffness;
      p.amount += p.speed;
      p.group.position.copy(p.home).addScaledVector(p.offset, p.amount);
    });
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
  // fade (0..1] eases opacity and glow toward their targets; 1 applies them at once.
  function applyFocus(focus, { opacity = () => 1, highlight = 0.2, decorate } = {}, fade = 1) {
    const pulse = lively && fade < 1 ? 0.7 + 0.3 * Math.sin(clock * 3) : 1;
    Object.entries(parts).forEach(([name, part]) => {
      const hot = focus.includes(name);
      part.meshes.forEach(mesh => {
        const target = opacity(name, mesh, hot);
        const shown = mesh.userData.alpha ?? target;
        const alpha = fade >= 1 || Math.abs(target - shown) < 0.004 ? target : shown + (target - shown) * fade;
        mesh.userData.alpha = alpha;
        const glowTarget = hot ? highlight * pulse : 0;
        const glow = fade >= 1 || mesh.userData.glow === undefined ? glowTarget : mesh.userData.glow + (glowTarget - mesh.userData.glow) * fade;
        mesh.userData.glow = glow;
        materials(mesh).forEach(material => {
          material.transparent = alpha < 0.99; material.opacity = alpha; material.depthWrite = alpha > 0.9;
          if (decorate) decorate(material, { name, mesh, hot });
          else if (material.emissive) { material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow; }
        });
      });
    });
  }

  // One call per frame: ease the explode amount, move the parts, and reapply focus
  // so opacity follows the explode amount while it animates.
  function update(state, style, rate = 0.09) {
    state.explode += (state.targetExplode - state.explode) * rate;
    if (lively && rate < 1) {
      clock += 1 / 60;
      springExplode(state.explode);
      applyFocus(state.focus, style, 0.12);
    } else {
      explode(state.explode);
      applyFocus(state.focus, style);
    }
  }

  return { parts, add, explode, applyFocus, update, materials };
}

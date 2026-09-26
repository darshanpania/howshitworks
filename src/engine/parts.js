import * as THREE from 'three';
import { themeUniforms } from './studio.js';

const BLACK = new THREE.Color(0x000000);

// X-ray look for parts that step back: as a part fades, its faces go clear and its
// silhouette edges (where the surface turns away from the camera) keep a blueprint-ink
// outline. Parts in focus get a warm rim light on the same edges. Both are uniforms,
// so every material shares one compiled program.
const XRAY = /* glsl */`
  float hswFres = 1.0 - abs( dot( normal, geometry.viewDir ) );
  float hswEdge = pow( hswFres, 2.0 );
  outgoingLight = mix( outgoingLight, mix( outgoingLight * 0.2 + uGhostTint * 0.18, uGhostTint, hswEdge ), uGhost );
  diffuseColor.a = mix( diffuseColor.a, clamp( diffuseColor.a * 3.0, 0.0, 1.0 ) * ( 0.025 + 0.85 * hswEdge ), uGhost );
  outgoingLight += uRimTint * pow( hswFres, 3.5 ) * uRim * 0.8;
  gl_FragColor = vec4( outgoingLight, diffuseColor.a );`;
export function xray(material) {
  if (!material.isMeshStandardMaterial || material.userData.xray) return material;
  const ghost = { value: 0 }, rim = { value: 0 };
  material.userData.xray = { ghost, rim };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { uGhost: ghost, uRim: rim, uGhostTint: themeUniforms.ghostTint, uRimTint: themeUniforms.rimTint });
    shader.fragmentShader = `uniform float uGhost, uRim;\nuniform vec3 uGhostTint, uRimTint;\n${shader.fragmentShader
      .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', XRAY)}`;
  };
  material.customProgramCacheKey = () => 'hsw-xray';
  return material;
}
// How far a part at this opacity has turned to x-ray: solid at 1, fully ghosted by 0.4.
export const ghostAmount = alpha => Math.min(1, Math.max(0, (0.97 - alpha) / 0.57));

// A step looks inside when it cuts the case open or pulls the parts apart. Only then do the
// parts out of focus fade to x-ray; otherwise the appliance stays solid and the part in
// focus is marked by its copper rim and the callout.
export const looksInside = state => !!state.cut || state.explode > 0.12;

// The first view of every appliance is solid: while the intro assembles the model, focus
// and cutaways wait, then the first step opens up. A tap, a key or ?capture skips the wait.
// It counts animation time (the capped frame time), so a slow first frame on a phone that
// is still compiling shaders does not use it up before anything is on screen.
const INTRO_S = 2.4;

// A registry of named, explodable parts. Each part has a home position and an
// offset it moves along as the explode amount goes from 0 to 1.
// lively: true gives each part its own springy, slightly staggered explode, fades focus
// changes instead of cutting, and makes focused parts breathe with a soft glow.
export function createParts(root, { shadows = false, lively = false } = {}) {
  const parts = {};
  let order = 0, clock = 0;
  const capture = /[?&]capture\b/.test(globalThis.location?.search ?? '');
  let holdLeft = lively && !capture ? INTRO_S : 0;
  if (holdLeft && typeof document !== 'undefined') {
    const skip = () => { holdLeft = 0; };
    ['pointerdown', 'keydown'].forEach(type => document.addEventListener(type, skip, { once: true, capture: true }));
  }

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
    parts[name] = { group, root, home: home.clone(), offset: offset.clone(), meshes, amount: lively ? 1.3 : 0, speed: 0, stiffness: 0.075 - lag * 0.03 };
    return group;
  }

  function explode(amount) {
    Object.values(parts).forEach(p => { p.amount = amount; p.speed = 0; p.group.position.copy(p.home).addScaledVector(p.offset, amount); });
  }

  // Each part follows the target on a damped spring, so it overshoots a little and settles.
  // Tuned per 60 Hz frame and scaled by dt, so 120 Hz screens and slow phones move alike.
  function springExplode(target, dt) {
    const damp = Math.exp(-16.5 * dt);
    Object.values(parts).forEach(p => {
      p.speed = p.speed * damp + (target - p.amount) * p.stiffness * 3600 * dt;
      p.amount += p.speed * dt;
      p.group.position.copy(p.home).addScaledVector(p.offset, p.amount);
    });
  }

  // Each mesh gets its own material copy, so opacity, glow and x-ray can differ per part.
  function materials(mesh) {
    if (!mesh.userData.ownMaterial) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => xray(m.clone())) : xray(mesh.material.clone());
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
        const ghost = mesh.userData.noGhost ? 0 : ghostAmount(alpha);
        const rim = highlight > 0 ? Math.min(1, glow / highlight) * 0.9 : 0;
        materials(mesh).forEach(material => {
          material.transparent = alpha < 0.99; material.opacity = alpha; material.depthWrite = alpha > 0.9;
          if (material.userData.xray) { material.userData.xray.ghost.value = ghost; material.userData.xray.rim.value = rim; }
          if (decorate) decorate(material, { name, mesh, hot });
          else if (material.emissive) { material.emissive.copy(glow > 0.001 ? material.color : BLACK); material.emissiveIntensity = glow; }
        });
      });
    });
  }

  // One call per frame: ease the explode amount, move the parts, and reapply focus
  // so opacity follows the explode amount while it animates. rate is the share of the
  // way covered in one 60 Hz frame; dt (seconds) scales it to the real frame time.
  function update(state, style, rate = 0.09, dt = 1 / 60) {
    dt = Math.min(dt, 0.1);
    const per = r => (r >= 1 ? 1 : 1 - (1 - r) ** (dt * 60));
    state.explode += (state.targetExplode - state.explode) * per(rate);
    // During the intro the page's own style sees no focus and no cutaway, so it draws the
    // appliance whole, with the same rules for water, flames and the rest.
    const holding = holdLeft > 0;
    holdLeft -= dt;
    const { focus, cut } = state;
    if (holding) { state.focus = []; state.cut = false; }
    if (lively && rate < 1) {
      clock += dt;
      springExplode(state.explode, dt);
      applyFocus(state.focus, style, per(0.12));
    } else {
      explode(state.explode);
      applyFocus(state.focus, style);
    }
    if (holding) { state.focus = focus; state.cut = cut; }
  }

  return { parts, add, explode, applyFocus, update, materials };
}

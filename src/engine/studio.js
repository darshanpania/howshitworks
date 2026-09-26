import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';
import { onThemeChange } from '../site.js';

// The photo studio every appliance stands in: soft-box reflections, a three-light rig,
// a floor grid that fades into the backdrop, and a soft contact shadow under the model.
// The backdrop itself is CSS (a radial gradient behind the transparent canvas).

// Colours that follow the theme. Hex values are sRGB; the ghost and rim tints feed a
// shader that works in linear light, so they are converted.
// pool is a soft patch of light on the floor under the model. On the pale paper the floor is
// already lit; on blueprint navy a black shadow has nothing to darken without it.
export const PALETTE = {
  light: { grid: '#8c8474', ghost: '#2c5a8c', rim: '#e0823f', shadow: 0.62, pool: '#ffffff', poolOpacity: 0 },
  dark: { grid: '#4fb3e6', ghost: '#7cc8f2', rim: '#f39a52', shadow: 1, pool: '#8cc8ff', poolOpacity: 0.24 },
};
export const themeUniforms = {
  ghostTint: { value: new THREE.Color() },
  rimTint: { value: new THREE.Color() },
};
const themed = new Set();
let palette = PALETTE.light;
onThemeChange(theme => {
  palette = PALETTE[theme] ?? PALETTE.light;
  themeUniforms.ghostTint.value.set(palette.ghost).convertSRGBToLinear();
  themeUniforms.rimTint.value.set(palette.rim).convertSRGBToLinear().multiplyScalar(1.6);
  themed.forEach(fn => fn(palette));
});
// Calls fn(palette) now and on every theme change.
export function onPalette(fn) { themed.add(fn); fn(palette); }

// A studio made of glowing panels: a big soft box overhead, a key strip on one side,
// a weaker fill on the other and a bright rim behind. Metals pick up long clean highlights.
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.BoxGeometry(12, 8, 12);
  const colors = [], pos = room.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + 4) / 8; // 0 at the floor, 1 at the ceiling
    const c = 0.05 + 0.3 * t;
    colors.push(c, c * 0.98, c * 0.95);
  }
  room.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const panel = (w, h, intensity, [x, y, z], look, tint = 0xffffff) => {
    const m = new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide });
    m.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set(x, y, z); mesh.lookAt(...look); env.add(mesh);
  };
  panel(7, 5, 3.2, [0, 3.9, 0], [0, 0, 0]);                      // overhead soft box
  panel(2.2, 5, 6, [-5.9, 1.2, 1.5], [0, 0.5, 0], 0xfff1df);     // warm key strip
  panel(2.5, 4, 1.6, [5.9, 0.8, 2], [0, 0.5, 0], 0xe4ecff);      // cool fill
  panel(8, 1.4, 7, [0, 2.4, -5.9], [0, 0.5, 0]);                 // rim strip behind
  panel(4, 1, 2.5, [0, -1.5, 5.9], [0, 0, 0]);                   // low front bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return texture;
}

// Warm key (casts the shadows), cool fill, and a strong rim from behind that lifts
// silhouettes off the pale backdrop. key is the key light position; extent sizes its shadow box.
export function addStudioLights(stage, { key = [5, 8, 5], extent = 6, far = 25, scale = 1, shadowMap = 1024 } = {}) {
  const { scene } = stage;
  const hemi = new THREE.HemisphereLight(0xfdfaf4, 0x2a3440, 0.3); scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xfff0dc, 1.55);
  keyLight.position.set(...key);
  if (stage.pbr) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(shadowMap, shadowMap); keyLight.shadow.bias = -0.0005; keyLight.shadow.normalBias = 0.02 * scale;
    Object.assign(keyLight.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: scale, far });
  }
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight(0xdce7ff, 0.35);
  fill.position.set(-key[0], key[1] * 0.3, key[2]); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-key[0] * 0.6, key[1] * 0.7, -Math.abs(key[2]) * 1.4); scene.add(rim);
  return { hemi, key: keyLight, fill, rim };
}

// A floor grid drawn in a shader: minor lines every cell, major lines every five, and
// both fade out with distance so the floor melts into the backdrop instead of ending.
export function gridFloor(size, { cell = 1, opacity = 0.18, center = [0, 0] } = {}) {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    extensions: { derivatives: true },
    uniforms: {
      uColor: { value: new THREE.Color() }, uOpacity: { value: opacity },
      uCell: { value: cell }, uFade: { value: size / 2 }, uCenter: { value: new THREE.Vector2(...center) },
    },
    vertexShader: /* glsl */`
      varying vec2 vXZ;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vXZ = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uCell, uFade; uniform vec2 uCenter;
      varying vec2 vXZ;
      float line(vec2 p, float width) {
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - min(min(g.x, g.y) / width, 1.0);
      }
      void main() {
        vec2 p = (vXZ - uCenter) / uCell;
        float minor = line(p, 1.0);
        float major = line(p / 5.0, 1.3);
        float fade = 1.0 - smoothstep(uFade * 0.2, uFade, length(vXZ - uCenter));
        float a = max(minor * 0.45, major) * fade * uOpacity * 2.2;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  onPalette(p => material.uniforms.uColor.value.set(p.grid));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(center[0], 0, center[1]);
  mesh.userData.noContactShadow = true; mesh.renderOrder = -2;
  return mesh;
}

// A white disc that fades to nothing at its edge.
function radialTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2, grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// A soft contact shadow, after three.js's webgl_shadow_contact example: an orthographic
// camera looks up from the floor, renders the model's depth as darkness, and a two-pass
// blur softens it. Parts close to the floor get a dark, tight shadow; high parts a faint wide one.
export function contactShadow(stage, parent, { size = 10, height = 5, blur = 3, darkness = 1.2, center = [0, 0], resolution } = {}) {
  const { renderer, scene } = stage;
  const res = resolution ?? (globalThis.matchMedia?.('(pointer: coarse)').matches ? 256 : 512);
  const target = new THREE.WebGLRenderTarget(res, res); target.texture.generateMipmaps = false;
  const targetBlur = new THREE.WebGLRenderTarget(res, res); targetBlur.texture.generateMipmaps = false;
  const group = new THREE.Group(); group.position.set(center[0], 0.002, center[1]); parent.add(group);
  const plane = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
  const shown = new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(plane, shown); mesh.scale.y = -1; mesh.renderOrder = -1; group.add(mesh);
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, toneMapped: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.7, size * 0.7).rotateX(-Math.PI / 2), poolMat);
  pool.position.y = -0.001; pool.renderOrder = -1.5; pool.userData.noContactShadow = true; group.add(pool);
  const blurPlane = new THREE.Mesh(plane); blurPlane.visible = false; group.add(blurPlane);
  const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
  camera.rotation.x = Math.PI / 2; group.add(camera);

  const depth = new THREE.MeshDepthMaterial();
  depth.userData.darkness = { value: darkness };
  depth.onBeforeCompile = shader => {
    shader.uniforms.darkness = depth.userData.darkness;
    shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );')}`;
  };
  depth.depthTest = false; depth.depthWrite = false;
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); hBlur.depthTest = false;
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader); vBlur.depthTest = false;
  onPalette(p => {
    shown.opacity = p.shadow;
    poolMat.color.set(p.pool); poolMat.opacity = p.poolOpacity; pool.visible = p.poolOpacity > 0;
  });

  function blurPass(amount) {
    blurPlane.visible = true;
    blurPlane.material = hBlur; hBlur.uniforms.tDiffuse.value = target.texture; hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(targetBlur); renderer.render(blurPlane, camera);
    blurPlane.material = vBlur; vBlur.uniforms.tDiffuse.value = targetBlur.texture; vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(target); renderer.render(blurPlane, camera);
    blurPlane.visible = false;
  }
  // Particles, glows, the floor itself and parts faded to x-ray stay out of the shadow.
  const hidden = [];
  const skip = o => {
    if (o.isPoints || o.isLine || o.isSprite || o.userData.noContactShadow) return true;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    return !!m && (m.blending === THREE.AdditiveBlending || m.opacity < 0.5);
  };
  stage.beforeRender(() => {
    hidden.length = 0;
    scene.traverseVisible(o => { if (skip(o)) hidden.push(o); });
    hidden.forEach(o => { o.visible = false; });
    mesh.visible = false;
    const autoShadows = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    const background = scene.background; scene.background = null;
    scene.overrideMaterial = depth;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    blurPass(blur);
    blurPass(blur * 0.4);
    renderer.setRenderTarget(null);
    scene.background = background;
    renderer.shadowMap.autoUpdate = autoShadows;
    mesh.visible = true;
    hidden.forEach(o => { o.visible = true; });
  });
  return group;
}

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const v3 = p => (p && p.isVector3 ? p : new THREE.Vector3(...(p || [0, 0, 0])));

// A box mesh at pos. Edges are bevelled by default (18% of the thinnest side), so they catch
// a highlight like a machined or moulded part. Large wooden or structural pieces should pass
// a small radius of their own (about 1.5 mm); pass 0 for a sharp box.
export const BEVEL = 0.18;
export function box(size, mat, pos, radius = Math.min(...size.map(Math.abs)) * BEVEL) {
  const geo = radius > 0 ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geo, mat); mesh.position.copy(v3(pos)); return mesh;
}

// A cylinder mesh along Y. Pass rTop !== rBottom for a cone frustum.
export function cylinder(rTop, rBottom, height, mat, pos, { segments = 32, open = false } = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, open), mat);
  mesh.position.copy(v3(pos)); return mesh;
}

// A rounded rectangle outline centred on (cx, cy). Pass a THREE.Path to use it as a hole.
export function roundedRect(w, h, r, cx = 0, cy = 0, path = new THREE.Shape()) {
  const x = cx - w / 2, y = cy - h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path;
}

// Extrude a shape drawn in the XZ plane (shape y = world -z) upward along +Y, starting at y.
export function extrudeUp(shape, height, mat, y = 0, bevel = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 12 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
  return new THREE.Mesh(geo, mat);
}

// Spin a profile of [radius, y] points around the Y axis: pots, lids, bowls, domes.
export function lathe(profile, mat, { segments = 64 } = {}) {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), mat);
}

// A helix of `turns` turns and radius r, `length` long along the axis ('x' or 'y'), centred on 0.
export function helixCurve(length, turns, r, axis = 'y') {
  return new (class extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2 * turns, along = -length / 2 + t * length;
      return axis === 'x'
        ? target.set(along, Math.sin(a) * r, Math.cos(a) * r)
        : target.set(Math.cos(a) * r, along, Math.sin(a) * r);
    }
  })();
}

// A wire coil (heating element, spring) as tube geometry.
export function coilGeometry({ length, turns, radius, wire, axis = 'y', segmentsPerTurn = 12, radial = 6 }) {
  return new THREE.TubeGeometry(helixCurve(length, turns, radius, axis), Math.ceil(turns * segmentsPerTurn), wire, radial, false);
}

// A vertical spring that starts at y = 0 and is `length` tall. Rebuild it as it compresses.
export function springGeometry(length, { turns = 7, radius = 0.16, wire = 0.035 } = {}) {
  const geo = coilGeometry({ length, turns, radius, wire, segmentsPerTurn: 24 });
  geo.translate(0, length / 2, 0);
  return geo;
}

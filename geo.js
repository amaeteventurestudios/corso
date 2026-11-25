// Geometry helpers for Aja, the robot Cane Corso. Everything is built from code: shell plates cut from lofted
// surfaces (with a rounded rim and a short skirt), pistons, joint hubs, bolts, gears, cables.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { THREE, RoundedBoxGeometry };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const sgnpow = (s, p) => s * Math.pow(s * s + 1e-5, (p - 1) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };

/** piecewise linear table: pts = [[x, y], ...] ascending in x */
export function tab(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
    const s = t * t * (3 - 2 * t); // eased, so lofts stay smooth
    return lerp(pts[i - 1][1], pts[i][1], s);
  }
  return pts[pts.length - 1][1];
}

/**
 * A loft along x: cross sections are superellipses. prof(x) -> {yc, h, w, n, zc}.
 * Angle t: 0 = top, PI/2 = +z side, PI = bottom, -PI/2 = -z side.
 */
export function loftX(prof) {
  return (x, t) => {
    const p = prof(x), e = 2 / (p.n || 2.5);
    return V(x, p.yc + p.h * sgnpow(Math.cos(t), e), (p.zc || 0) + p.w * sgnpow(Math.sin(t), e));
  };
}
/** the same, along -y (for leg segments): prof(s) with s = 0..L down the bone, angle 0 = +x (front), PI/2 = +z */
export function loftY(prof) {
  return (s, t) => {
    const p = prof(s), e = 2 / (p.n || 2.2);
    return V((p.xc || 0) + p.a * sgnpow(Math.cos(t), e), -s, p.b * sgnpow(Math.sin(t), e));
  };
}

/**
 * A plate cut out of a surface: fn(u, v) -> Vector3. The outer face has a rolled rim (so the highlight catches the
 * edge) and a short skirt that gives it thickness. Normals point away from `center` (a point or fn(u,v)).
 */
export function shellPatch(fn, u0, u1, v0, v1, o = {}) {
  const nu = o.nu || 10, nv = o.nv || 10, thick = o.thick ?? 0.007, bev = o.bevel ?? 0.004;
  const h = 1e-4;
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const lenU = fn(uc + h, vc).distanceTo(fn(uc - h, vc)) / (2 * h) || 1;
  const lenV = fn(uc, vc + h).distanceTo(fn(uc, vc - h)) / (2 * h) || 1;
  const eu = Math.min((u1 - u0) * 0.3, bev * 1.6 / lenU), ev = Math.min((v1 - v0) * 0.3, bev * 1.6 / lenV);
  const us = [u0], vs = [v0];
  for (let i = 0; i <= nu; i++) us.push(lerp(u0 + eu, u1 - eu, i / nu)); us.push(u1);
  for (let j = 0; j <= nv; j++) vs.push(lerp(v0 + ev, v1 - ev, j / nv)); vs.push(v1);
  const center = o.center || null;
  const normalAt = (u, v) => {
    const pu = fn(u + h, v).sub(fn(u - h, v)), pv = fn(u, v + h).sub(fn(u, v - h));
    return pu.cross(pv).normalize();
  };
  // orientation from the patch centre
  let sign = 1;
  if (center) {
    const c = typeof center === 'function' ? center(uc, vc) : center;
    if (normalAt(uc, vc).dot(fn(uc, vc).sub(c)) < 0) sign = -1;
  }
  if (o.flip) sign *= -1;
  const NI = us.length, NJ = vs.length;
  const pos = [], nrm = [], ring = [];
  const P = [], N = [];
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    const u = us[i], v = vs[j];
    const n = normalAt(u, v).multiplyScalar(sign);
    const p = fn(u, v);
    const edge = i === 0 || j === 0 || i === NI - 1 || j === NJ - 1;
    if (edge) p.addScaledVector(n, -bev);
    P.push(p); N.push(n);
    pos.push(p.x, p.y, p.z);
  }
  const idx = [];
  const id = (i, j) => i * NJ + j;
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ - 1; j++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    if (sign > 0) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  outer.setIndex(idx);
  outer.computeVertexNormals();
  // skirt around the boundary
  for (let i = 0; i < NI; i++) ring.push(id(i, 0));
  for (let j = 1; j < NJ; j++) ring.push(id(NI - 1, j));
  for (let i = NI - 2; i >= 0; i--) ring.push(id(i, NJ - 1));
  for (let j = NJ - 2; j > 0; j--) ring.push(id(0, j));
  const sp = [], si = [];
  ring.forEach((k) => {
    const p = P[k], n = N[k];
    sp.push(p.x, p.y, p.z);
    const q = p.clone().addScaledVector(n, -(thick - bev));
    sp.push(q.x, q.y, q.z);
  });
  const R = ring.length;
  for (let k = 0; k < R; k++) {
    const a = 2 * k, b = 2 * ((k + 1) % R);
    if (sign > 0) si.push(a, a + 1, b, b, a + 1, b + 1); else si.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  skirt.setIndex(si);
  skirt.computeVertexNormals();
  const g = mergeGeometries([outer, skirt]);
  g.computeBoundingSphere();
  return g;
}

/** an annulus with thickness, axis along +z, centred on z = 0 */
export function ringGeo(r0, r1, depth, seg = 40, bevel = 0.15) {
  const b = Math.min(depth, r1 - r0) * bevel;
  const pts = [
    [r0, -depth / 2], [r1 - b, -depth / 2], [r1, -depth / 2 + b], [r1, depth / 2 - b], [r1 - b, depth / 2], [r0 + b, depth / 2], [r0, depth / 2 - b], [r0, -depth / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
/** a disc with rounded edge (lathe), axis +z, front face at +depth/2 */
export function discGeo(r, depth, seg = 36, dome = 0) {
  const pts = [new THREE.Vector2(0, -depth / 2), new THREE.Vector2(r * 0.97, -depth / 2), new THREE.Vector2(r, -depth / 2 + depth * 0.2),
    new THREE.Vector2(r, depth / 2 - depth * 0.25), new THREE.Vector2(r * 0.94, depth / 2)];
  const steps = 6;
  for (let i = 1; i <= steps; i++) { const a = i / steps; pts.push(new THREE.Vector2(r * 0.94 * Math.cos(a * Math.PI / 2), depth / 2 + dome * Math.sin(a * Math.PI / 2))); }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
export function cylGeo(r0, r1, len, seg = 20) { return new THREE.CylinderGeometry(r1, r0, len, seg); }
export function boltGeo(r = 0.004, h = 0.004) { const g = new THREE.CylinderGeometry(r, r, h, 6); g.rotateX(Math.PI / 2); return g; }
export function domeGeo(r, depth, seg = 28) {
  const g = new THREE.SphereGeometry(r, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  g.rotateX(Math.PI / 2); g.scale(1, 1, depth / r);
  return g;
}
export function gearGeo(r, teeth, depth, hole = 0.3) {
  const s = new THREE.Shape();
  const ri = r * 0.82;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2, da = Math.PI * 2 / teeth;
    const pts = [[ri, a0], [r, a0 + da * 0.2], [r, a0 + da * 0.5], [ri, a0 + da * 0.7]];
    pts.forEach(([rr, a], k) => { const x = rr * Math.cos(a), y = rr * Math.sin(a); if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  const hp = new THREE.Path(); hp.absarc(0, 0, r * hole, 0, Math.PI * 2, true); s.holes.push(hp);
  // spokes: four windows
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Path(); const a = k * Math.PI / 2 + Math.PI / 4;
    const cx = Math.cos(a) * r * 0.56, cy = Math.sin(a) * r * 0.56;
    w.absarc(cx, cy, r * 0.13, 0, Math.PI * 2, true); s.holes.push(w);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.15, bevelSize: depth * 0.15, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function tubeGeo(points, r, seg = 24) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V(...p))));
  return new THREE.TubeGeometry(c, seg, r, 6, false);
}
/** a rounded slab from a 2D outline (in x, y), extruded along z */
export function slabGeo(outline, depth, bevel = 0.003) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}
export function rbox(w, h, d, r = 0.004, seg = 2) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)); }

/** quaternion that turns +y onto the direction a -> b */
export function alignY(a, b) {
  const d = b.clone().sub(a).normalize();
  return new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
}
export { V };

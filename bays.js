// Flank, Back and Jaw close-ups, built the same way as the eye: a window opens in the painted shell and a set of
// mechanisms, made for the job and placed under the painted spot, slides out layer by layer along one line so each
// layer can be read. Positions are in the rig frame of the standing dog (read off the scan).
import * as THREE from 'three';
import { ringGeo, discGeo, gearGeo, tubeGeo, rbox, V } from './geo.js';
import { pxRig, JOINTS } from './scan.js';

const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const span = (k, a, b) => ease((k - a) / (b - a));

export function buildBays(dog) {
  const M = dog.M;
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a650, metalness: 1, roughness: 0.3 });
  const led = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.5 });
  const coolant = new THREE.MeshStandardMaterial({ color: 0x3f7f8c, metalness: 0.4, roughness: 0.3 });
  const mesh = (g, m, parent, p, r) => { const o = new THREE.Mesh(g, m); if (p) o.position.copy(p); if (r) o.rotation.set(...r); parent.add(o); return o; };
  const anchor = (name, parent, p) => { const a = new THREE.Object3D(); a.position.copy(p); parent.add(a); dog.anchors[name] = a; return a; };
  /** a group under `parent`, sitting at world point P with world-aligned axes and world scale 1 (at the bind pose) */
  const rootAt = (parent, P) => {
    const g = new THREE.Group(); parent.add(g);
    g.position.copy(parent.worldToLocal(P.clone()));
    const q = new THREE.Quaternion(); parent.getWorldQuaternion(q); g.quaternion.copy(q.invert());
    const s = new THREE.Vector3(); parent.getWorldScale(s); g.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    return g;
  };
  const piston = (parent, a, b, r, matBarrel = M.gun) => {
    const g = new THREE.Group(); parent.add(g); g.position.copy(a);
    const d = b.clone().sub(a), L = d.length();
    g.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    mesh(new THREE.CylinderGeometry(r, r, L * 0.55, 18), matBarrel, g, V(0, L * 0.3, 0));
    mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, L * 0.5, 12), M.steel, g, V(0, L * 0.72, 0));
    mesh(ringGeo(r * 0.5, r * 1.1, r * 1.2), M.copper, g, V(0, 0, 0), [0, Math.PI / 2, 0]);
    mesh(ringGeo(r * 0.5, r * 1.1, r * 1.2), M.copper, g, V(0, L, 0), [0, Math.PI / 2, 0]);
    mesh(ringGeo(r * 0.95, r * 1.2, r * 0.5), M.copper, g, V(0, L * 0.58, 0), [Math.PI / 2, 0, 0]);
    return g;
  };
  const MODS = {};
  /** a module: layers slide out along `dir` (world), each by its own distance, outermost first */
  function mod(id, o) {
    const m = { id, roots: [], layers: [], grow: o.grow || 1, ...o };
    m.layer = (root, dist, delay, dir) => {
      const g = new THREE.Group(); root.add(g);
      if (!m.roots.includes(root)) m.roots.push(root);
      m.layers.push({ g, dist, delay, dir: (dir || o.dir).clone().normalize() });
      return g;
    };
    MODS[id] = m; return m;
  }

  // ------------------------------------------------------------------ flank: the electronics bay
  {
    const R = rootAt(dog.inner, V(-0.03, 0.5, -0.12));
    const F = mod('flank', { dir: V(-0.55, 0.85, -0.25), cut: { a: V(-0.2, 0.5, -0.06), b: V(0.15, 0.5, -0.06), r: 0.11, side: V(0, 0, -1), off: -0.25 } });
    F.cutA = anchor('fxCutA', R, F.cut.a.clone().sub(V(-0.03, 0.5, -0.12))); F.cutB = anchor('fxCutB', R, F.cut.b.clone().sub(V(-0.03, 0.5, -0.12)));
    // 1 wiring harness, deepest
    const h = F.layer(R, 0.05, 0);
    [[0.0, 0.03, M.copper], [0.012, 0.0, M.copperB], [-0.01, -0.03, M.gun]].forEach(([z, y, m]) =>
      mesh(tubeGeo([V(-0.17, y, z), V(-0.06, y + 0.02, z), V(0.06, y - 0.015, z), V(0.16, y + 0.01, z)], 0.006, 30), m, h));
    for (const x of [-0.12, 0.0, 0.11]) mesh(rbox(0.026, 0.09, 0.022, 0.004), M.dark, h, V(x, 0, 0));
    anchor('fxHarness', h, V(0.15, 0.01, 0));
    // 2 battery: six cells in a tray
    const b = F.layer(R, 0.2, 0.06);
    mesh(rbox(0.29, 0.11, 0.05, 0.006), M.gun, b, V(0, 0, 0.012));
    for (let i = 0; i < 6; i++) {
      const x = -0.115 + i * 0.046;
      mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.09, 24), M.cell, b, V(x, 0, -0.016));
      mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.006, 24), M.copper, b, V(x, 0.045, -0.016));
      mesh(new THREE.CylinderGeometry(0.0195, 0.0195, 0.006, 24), M.copper, b, V(x, -0.045, -0.016));
    }
    mesh(rbox(0.25, 0.008, 0.006, 0.002), M.copper, b, V(0, 0.051, -0.016));
    mesh(rbox(0.25, 0.008, 0.006, 0.002), M.copper, b, V(0, -0.051, -0.016));
    anchor('fxBattery', b, V(-0.07, 0.02, -0.036));
    // 3 power board: heat sink, capacitors, coils
    const p = F.layer(R, 0.36, 0.12);
    mesh(rbox(0.22, 0.11, 0.004, 0.002), M.pcb, p);
    for (let i = 0; i < 12; i++) mesh(rbox(0.004, 0.06, 0.022, 0.001), M.steel, p, V(-0.09 + i * 0.008, 0.012, -0.013));
    for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.026, 18), M.dark, p, V(0.03 + i * 0.026, 0.025, -0.015), [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 2; i++) mesh(new THREE.TorusGeometry(0.011, 0.005, 10, 20), M.copper, p, V(0.04 + i * 0.035, -0.028, -0.006));
    mesh(rbox(0.2, 0.006, 0.004, 0.001), M.copper, p, V(0, -0.05, -0.004));
    anchor('fxPower', p, V(-0.06, 0.042, -0.024));
    // 4 control board: the brain
    const c = F.layer(R, 0.53, 0.18);
    mesh(rbox(0.26, 0.14, 0.004, 0.002), M.pcb, c);
    mesh(rbox(0.05, 0.05, 0.005, 0.002), M.chip, c, V(-0.04, 0.01, -0.004));
    mesh(rbox(0.036, 0.036, 0.002, 0.001), M.steel, c, V(-0.04, 0.01, -0.0075));
    for (let i = 0; i < 4; i++) mesh(rbox(0.014, 0.022, 0.003, 0.001), M.chip, c, V(0.0 + i * 0.019, 0.032, -0.0035));
    mesh(rbox(0.018, 0.018, 0.003, 0.001), M.chip, c, V(0.085, -0.03, -0.0035));
    for (let i = 0; i < 14; i++) mesh(rbox(0.003, 0.006, 0.004, 0.0005), gold, c, V(-0.105 + i * 0.006, -0.058, -0.004));
    mesh(rbox(0.09, 0.012, 0.008, 0.002), M.dark, c, V(-0.075, -0.058, -0.008));
    for (let i = 0; i < 16; i++) mesh(rbox(0.004, 0.0025, 0.002, 0.0005), M.dark, c, V(0.02 + (i % 8) * 0.009, -0.01 - Math.floor(i / 8) * 0.01, -0.003));
    [0x5be37a, 0xffb347, 0x5be37a].forEach((col, i) => mesh(new THREE.SphereGeometry(0.0028, 10, 8), led(col), c, V(0.105, 0.05 - i * 0.012, -0.004)));
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 24), M.dark, c, V(-0.04, 0.01, -0.013), [Math.PI / 2, 0, 0]);
    anchor('fxBoard', c, V(-0.04, 0.01, -0.016));
    anchor('fxImu', c, V(0.085, -0.03, -0.006));
    // 5 the side plate, outermost
    const s = F.layer(R, 0.5, 0.0, V(0.55, 0.95, -0.3));
    mesh(rbox(0.3, 0.16, 0.012, 0.006), M.ivory, s, V(0, 0, -0.02));
    for (const [x, y] of [[-0.13, 0.065], [0.13, 0.065], [-0.13, -0.065], [0.13, -0.065]]) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 6), M.steel, s, V(x, y, -0.027), [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.28, 12), M.copper, s, V(0, 0.082, -0.02), [0, 0, Math.PI / 2]);
    anchor('fxPlate', s, V(0.1, 0.03, -0.027));
    F.view = anchor('fxView', R, V(-0.04, 0.24, -0.1));
  }

  // ------------------------------------------------------------------ back: the spine, from the bones up
  {
    const R = rootAt(dog.inner, V(-0.08, 0.63, 0));
    const B = mod('back', { dir: V(0.0, 1, -0.4), cut: { a: V(-0.32, 0.56, 0), b: V(0.18, 0.58, 0), r: 0.135, side: V(0, 1, 0), off: -0.3 } });
    B.cutA = anchor('bxCutA', R, B.cut.a.clone().sub(V(-0.08, 0.63, 0))); B.cutB = anchor('bxCutB', R, B.cut.b.clone().sub(V(-0.08, 0.63, 0)));
    const xs = []; for (let i = 0; i < 12; i++) xs.push(-0.27 + i * 0.045);
    // 1 vertebrae with copper discs
    const v = B.layer(R, 0.06, 0);
    xs.forEach((x, i) => {
      mesh(rbox(0.032, 0.03, 0.05, 0.006), M.gun, v, V(x, 0, 0));
      mesh(rbox(0.012, 0.03, 0.012, 0.003), M.gun, v, V(x, 0.024, 0));
      if (i < xs.length - 1) mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 18), M.copper, v, V(x + 0.0225, 0, 0), [0, 0, Math.PI / 2]);
    });
    anchor('bxSpine', v, V(-0.1, 0.03, -0.02));
    // 2 cable trunk and coolant loop
    const c = B.layer(R, 0.16, 0.05);
    [[-0.012, M.copper], [0.0, M.dark], [0.012, M.copperB]].forEach(([z, m]) => mesh(tubeGeo([V(-0.3, 0, z), V(-0.1, 0.006, z), V(0.1, -0.004, z), V(0.27, 0.01, z)], 0.0055, 30), m, c));
    mesh(tubeGeo([V(-0.22, 0, -0.035), V(0.0, 0.01, -0.035), V(0.22, 0, -0.035), V(0.24, 0, 0.035), V(0.0, 0.01, 0.035), V(-0.22, 0, 0.035)], 0.004, 40), coolant, c);
    mesh(rbox(0.04, 0.026, 0.03, 0.006), M.gun, c, V(0.24, 0, 0));
    anchor('bxCables', c, V(-0.15, 0.004, -0.012));
    anchor('bxPump', c, V(0.24, 0.012, -0.015));
    // 3 copper actuators along each side
    const a = B.layer(R, 0.27, 0.1);
    for (const z of [-0.04, 0.04]) { piston(a, V(-0.28, 0, z), V(-0.02, 0.0, z), 0.011); piston(a, V(0.0, 0, z), V(0.24, 0.0, z), 0.011); }
    anchor('bxAct', a, V(-0.15, 0.012, -0.04));
    // 4 saddle plates
    const s = B.layer(R, 0.4, 0.16);
    for (let i = 0; i < 4; i++) {
      const x = -0.24 + i * 0.15;
      const pl = mesh(rbox(0.13, 0.012, 0.14, 0.006), M.ivory, s, V(x, 0, 0));
      pl.rotation.z = 0.04 * (i - 1.5);
      for (const z of [-0.05, 0.05]) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 6), M.steel, s, V(x, 0.008, z));
    }
    anchor('bxSaddle', s, V(0.06, 0.008, -0.06));
    B.view = anchor('bxView', R, V(0, 1, -0.4).normalize().multiplyScalar(0.2));
  }

  // ------------------------------------------------------------------ jaw: hinge motor, pistons, tooth rail, bite sensor
  {
    const hinge = pxRig(JOINTS.hinge).setZ(-0.07), mouth = pxRig(JOINTS.mouth).setZ(-0.05);
    const H = rootAt(dog.head, hinge), J = rootAt(dog.jaw, hinge);
    const Jm = mod('jaw', { dir: V(0.15, -0.3, -1), grow: 1.1, cut: null });
    // 1 hinge motor and ring gear
    const m1 = Jm.layer(H, 0.08, 0, V(-0.3, 0.5, -1));
    mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 28), M.gun, m1, V(0, 0, 0), [Math.PI / 2, 0, 0]);
    mesh(gearGeo(0.033, 26, 0.006, 0.6), M.copper, m1, V(0, 0, -0.018));
    mesh(ringGeo(0.008, 0.014, 0.008), M.steel, m1, V(0, 0, -0.024));
    anchor('jxMotor', m1, V(0, 0.02, -0.02));
    // 2 the two copper pistons that pull the jaw shut
    const m2 = Jm.layer(H, 0.13, 0.06, V(-0.8, 0.2, -0.6));
    piston(m2, V(-0.03, 0.06, 0), V(0.05, -0.012, 0), 0.008, M.copper);
    piston(m2, V(-0.045, 0.045, 0.012), V(0.035, -0.022, 0.012), 0.008, M.copper);
    anchor('jxPistons', m2, V(0.01, 0.024, -0.008));
    // 3 bite sensor board in the jaw
    const m3 = Jm.layer(J, 0.1, 0.1, V(-0.2, -0.8, -0.6));
    const d = mouth.clone().sub(hinge);
    mesh(rbox(0.05, 0.022, 0.003, 0.001), M.pcb, m3, V(d.x * 0.45, d.y * 0.45 - 0.02, 0));
    mesh(rbox(0.012, 0.012, 0.003, 0.001), M.chip, m3, V(d.x * 0.45, d.y * 0.45 - 0.02, -0.003));
    anchor('jxSensor', m3, V(d.x * 0.45, d.y * 0.45 - 0.012, -0.004));
    // 4 tooth rail: a steel bar with the lower teeth
    const m4 = Jm.layer(J, 0.15, 0.14, V(0.3, -0.9, -0.5));
    const rail = mesh(rbox(d.length() * 0.85, 0.01, 0.01, 0.003), M.steel, m4);
    rail.position.set(d.x * 0.55, d.y * 0.55 - 0.03, 0); rail.rotation.z = Math.atan2(d.y, d.x);
    for (let i = 0; i < 7; i++) {
      const f = 0.2 + i * 0.12, big = i === 6;
      mesh(new THREE.ConeGeometry(big ? 0.007 : 0.0045, big ? 0.03 : 0.014, 10), M.tooth, m4, V(d.x * f, d.y * f - 0.03 + (big ? 0.02 : 0.012), 0));
    }
    mesh(rbox(d.length() * 0.8, 0.006, 0.014, 0.003), M.gum, m4, V(d.x * 0.55, d.y * 0.55 - 0.024, 0)).rotation.z = Math.atan2(d.y, d.x);
    anchor('jxTeeth', m4, V(d.x * 0.7, d.y * 0.7 - 0.01, 0));
    anchor('jxFang', m4, V(d.x * 0.92, d.y * 0.92 + 0.0, 0));
    Jm.view = anchor('jxView', H, V(0.02, -0.07, -0.06));
    Jm.cutA = anchor('jxCutA', H, V(0, 0, 0.035)); Jm.cutB = anchor('jxCutB', J, mouth.clone().sub(hinge).setZ(0.035).multiplyScalar(0.9));
    Jm.cut = { r: 0.06, side: V(0, 0, -1), off: -0.25 };
  }

  for (const id in MODS) MODS[id].roots.forEach((r) => { r.visible = false; });
  const tq = new THREE.Quaternion(), tmp = new THREE.Vector3();
  void tmp;
  return {
    has: (id) => !!MODS[id],
    update(id, k, active) {
      for (const n in MODS) {
        const m = MODS[n], on = n === id && active && k > 0.001;
        m.roots.forEach((r) => { r.visible = on; });
        if (!on) continue;
        const grow = 1 + (m.grow - 1) * span(k, 0.3, 1);
        m.layers.forEach((L) => {
          // the layer's line is a world direction: turn it into the root's frame
          L.g.parent.getWorldQuaternion(tq);
          tmp.copy(L.dir).applyQuaternion(tq.invert());
          const s = L.g.parent.getWorldScale(new THREE.Vector3()).x;
          L.g.position.copy(tmp).multiplyScalar(L.dist * grow * span(k, 0.25 + L.delay, 0.65 + L.delay) / s);
          L.g.scale.setScalar(grow);
        });
      }
    },
    cut(id, A, B, S) {
      const m = MODS[id];
      m.cutA.getWorldPosition(A); m.cutB.getWorldPosition(B);
      S.copy(m.cut.side);
      return { r: m.cut.r, off: m.cut.off };
    },
  };
}

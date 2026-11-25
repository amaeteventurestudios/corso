// Aja M-9, a robot Cane Corso, built from code. Units are metres; x points forward (nose), y up, z to the dog's
// right. The near side (the side the camera opens on) is -z.
//
// The real-world sizes it follows (a big male Cane Corso): 66 cm at the shoulder, about 46 kg, a deep chest down to the
// elbow, a broad blocky head with a short square muzzle, cropped upright ears, a docked-length tail.
//
// Every mesh is one part: it is counted, it flies out on its own in the teardown, and it can carry its own offsets for
// the close-up sections (eye, ear, paw, back, flank).
import { THREE, V, loftX, loftY, shellPatch, ringGeo, discGeo, cylGeo, boltGeo, domeGeo, gearGeo, tubeGeo, slabGeo, rbox, alignY, tab, lerp } from './geo.js';

export const BODY_Y = 0.56;
export const NECK0 = V(0.34, 0.63, 0);
export const NECK1 = V(0.455, 0.725, 0);

export function materials() {
  const side = THREE.DoubleSide;
  return {
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xddd4c5, roughness: 0.36, clearcoat: 0.65, clearcoatRoughness: 0.2, side }),
    ivoryIn: new THREE.MeshStandardMaterial({ color: 0xc9c0b1, roughness: 0.6, side }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd7743a, metalness: 0.82, roughness: 0.3 }),
    copperB: new THREE.MeshStandardMaterial({ color: 0xc0632f, metalness: 0.9, roughness: 0.36 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8cbd0, metalness: 1, roughness: 0.26 }),
    gun: new THREE.MeshStandardMaterial({ color: 0x3a3c41, metalness: 0.75, roughness: 0.42 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x232427, metalness: 0.45, roughness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.72 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.07, clearcoat: 1, depthWrite: false }),
    smoke: new THREE.MeshPhysicalMaterial({ color: 0x5a4a3e, roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false, side }),
    iris: new THREE.MeshStandardMaterial({ color: 0xe0902f, emissive: 0xc0600e, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2 }),
    pcb: new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: 0.5, metalness: 0.2 }),
    chip: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4 }),
    cell: new THREE.MeshStandardMaterial({ color: 0x2c4b56, metalness: 0.5, roughness: 0.35 }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xe4e6ea, metalness: 0.95, roughness: 0.16 }),
    gum: new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 0.5, metalness: 0.2 }),
    tongue: new THREE.MeshStandardMaterial({ color: 0x3b3a3d, roughness: 0.62, metalness: 0.1 }),
  };
}

function pcbTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#16191a'; g.fillRect(0, 0, 512, 256);
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.strokeStyle = '#b8642f'; g.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    let x = r() * 512, y = r() * 256; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { if (k % 2) x += (r() - 0.5) * 220; else y += (r() - 0.5) * 120; g.lineTo(x, y); }
    g.globalAlpha = 0.35 + r() * 0.5; g.stroke();
  }
  g.globalAlpha = 1; g.fillStyle = '#c9783c';
  for (let i = 0; i < 160; i++) { g.beginPath(); g.arc(r() * 512, r() * 256, 2.2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#d98a48';
  for (let i = 0; i < 24; i++) g.fillRect(40 + i * 18, 236, 10, 14);
  g.font = '600 20px Inter, sans-serif'; g.fillStyle = '#d6cfc2'; g.globalAlpha = 0.85;
  g.fillText('AJA M-9  MOTION CONTROL', 26, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildDog(opt = {}) {
  const M = materials();
  const parts = [];
  const anchors = {};
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.set(0, BODY_Y, 0); root.add(body);
  const inner = new THREE.Group(); inner.position.set(0, -BODY_Y, 0); body.add(inner);

  /** add one part */
  function add(geo, mat, parent, tag, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (o.p) m.position.copy(o.p);
    if (o.q) m.quaternion.copy(o.q);
    if (o.r) m.rotation.set(...o.r);
    if (o.s) m.scale.set(...o.s);
    m.userData.tag = tag;
    m.userData.offs = o.offs || {};
    parent.add(m);
    parts.push(m);
    return m;
  }
  const anchor = (name, parent, p) => { const a = new THREE.Object3D(); a.position.copy(p); parent.add(a); anchors[name] = a; return a; };

  // ------------------------------------------------------------------ torso
  // Drawn in design units, then stretched to the measured body: the owner's side view puts the chest front at +0.46 m
  // and the rump at -0.49 m (shoulder 0.66 m), and the front view gives a broad chest.
  const TX = 1.13, TZ = 1.1, TOX = 0.03;
  const torsoG = new THREE.Group(); torsoG.position.x = TOX; torsoG.scale.set(TX, 1, TZ); inner.add(torsoG);
  const TOP = [[-0.445, 0.598], [-0.425, 0.612], [-0.345, 0.62], [-0.204, 0.645], [-0.071, 0.652], [0.062, 0.662], [0.195, 0.7], [0.31, 0.728], [0.365, 0.69]];
  const BOT = [[-0.445, 0.572], [-0.425, 0.5], [-0.345, 0.468], [-0.204, 0.41], [-0.071, 0.38], [0.062, 0.335], [0.195, 0.33], [0.31, 0.38], [0.365, 0.52]];
  const tp = (x) => {
    const t = tab(TOP, x), b = tab(BOT, x);
    return { yc: (t + b) / 2, h: (t - b) / 2, w: tab([[-0.445, 0.03], [-0.425, 0.1], [-0.345, 0.135], [-0.204, 0.118], [-0.071, 0.122], [0.062, 0.135], [0.195, 0.148], [0.31, 0.135], [0.365, 0.04]], x), n: 2.6 };
  };
  const T = loftX(tp);
  const tCenter = (x) => { const p = tp(x); return V(x, p.yc, 0); };
  const plateT = (x0, x1, t0, t1, parent, tag, o = {}) =>
    add(shellPatch(T, x0, x1, t0, t1, { center: (u) => tCenter(u), nu: o.nu || 12, nv: o.nv || 12, thick: 0.008, bevel: 0.0045 }), M.ivory, parent, tag, o);
  /** z of the torso surface at (x, y) on side s */
  const sideZ = (x, y, s) => {
    let a = 0, b = Math.PI;
    for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (T(x, m).y > y) a = m; else b = m; }
    return T(x, (a + b) / 2).z * s;
  };

  // dark core, in six sections
  const coreP = (x) => { const p = tp(x); return { ...p, h: p.h * 0.86, w: p.w * 0.84 }; };
  const C = loftX(coreP);
  const cx = [-0.445, -0.32, -0.19, -0.06, 0.07, 0.2, 0.365];
  for (let i = 0; i < cx.length - 1; i++) add(shellPatch(C, cx[i], cx[i + 1] - 0.004, -Math.PI, Math.PI, { center: (u) => tCenter(u), nu: 8, nv: 28, thick: 0.004, bevel: 0.001 }), M.dark, torsoG, 'core');
  // frame rings between the core sections
  for (let i = 1; i < cx.length - 1; i++) {
    const p = coreP(cx[i]);
    const g = new THREE.TorusGeometry(1, 0.06, 6, 40); g.rotateY(Math.PI / 2);
    add(g, M.gun, torsoG, 'frame', { p: V(cx[i], p.yc, 0), s: [1, p.h * 1.03, p.w * 1.03] });
  }
  // vertebrae along the top
  const spineP = [];
  for (let i = 0; i < 14; i++) {
    const x = lerp(-0.4, 0.3, i / 13), p = tp(x);
    const y = p.yc + p.h * 0.86;
    spineP.push(V(x, y, 0));
    add(rbox(0.036, 0.026, 0.05, 0.006), M.gun, torsoG, 'spine', { p: V(x, y, 0), offs: { back: { p: V(0, 0.03, 0), d: 0 } } });
    add(cylGeo(0.008, 0.008, 0.07, 10), M.steel, torsoG, 'spine', { p: V(x + 0.025, y + 0.004, 0), r: [Math.PI / 2, 0, 0], offs: { back: { p: V(0, 0.03, 0), d: 0 } } });
  }
  anchor('spine', torsoG, V(-0.05, 0.69, -0.03));

  // pistons: barrel, rod, two eye ends. Each one is four parts.
  function piston(parent, a, b, r, tag, offs) {
    const q = alignY(a, b), L = a.distanceTo(b), d = b.clone().sub(a).normalize();
    const pAt = (f) => a.clone().addScaledVector(d, L * f);
    add(cylGeo(r, r, L * 0.58, 14), M.copper, parent, tag, { p: pAt(0.33), q, offs });
    add(cylGeo(r * 0.45, r * 0.45, L * 0.5, 8), M.steel, parent, tag, { p: pAt(0.7), q, offs });
    add(cylGeo(r * 1.15, r * 1.15, L * 0.07, 14), M.gun, parent, tag, { p: pAt(0.05), q, offs });
    add(cylGeo(r * 1.0, r * 1.0, L * 0.06, 14), M.gun, parent, tag, { p: pAt(0.95), q, offs });
  }
  const onCore = (x, t, k = 1.0) => { const p = coreP(x); const e = 2 / 2.6; return V(x, p.yc + p.h * k * Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), e), p.w * k * Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), e)); };
  // back rows (seen between the saddle plates), upper side rows, belly rows
  const rows = [
    { t: 0.215, xs: [-0.4, -0.29, -0.18, -0.07, 0.04, 0.15, 0.26], r: 0.0105, k: 1.07, tag: 'spine' },
    { t: 0.3, xs: [-0.37, -0.255, -0.14, -0.025, 0.09, 0.2, 0.3], r: 0.0105, k: 1.08, tag: 'torso' },
    { t: 0.385, xs: [-0.4, -0.29, -0.18, -0.07, 0.04, 0.15, 0.27], r: 0.0105, k: 1.09, tag: 'torso' },
    { t: 0.47, xs: [-0.37, -0.255, -0.14, -0.025, 0.09, 0.2, 0.3], r: 0.0105, k: 1.09, tag: 'torso' },
    { t: 0.56, xs: [-0.16, -0.06, 0.04], r: 0.0105, k: 1.08, tag: 'torso' },
    { t: 1.7, xs: [-0.16, -0.06, 0.04, 0.12], r: 0.0105, k: 1.06, tag: 'torso' },
    { t: 1.84, xs: [-0.14, -0.04, 0.06, 0.13], r: 0.0105, k: 1.05, tag: 'torso' },
    { t: 2.6, xs: [-0.2, -0.1, 0.0, 0.1], r: 0.009, k: 1.04, tag: 'torso' },
  ];
  rows.forEach((row) => [1, -1].forEach((s) => {
    for (let i = 0; i < row.xs.length - 1; i++) {
      const a = onCore(row.xs[i] + 0.008, s * row.t, row.k), b = onCore(row.xs[i + 1] - 0.008, s * row.t, row.k);
      piston(torsoG, a, b, row.r, row.tag, row.tag === 'spine' ? { back: { p: V(0, 0.05, s * 0.02), d: 0.1 } } : {});
    }
  }));
  // cable bundles along the back
  [-0.012, 0.012].forEach((z, k) => {
    const pts = spineP.map((p) => V(p.x, p.y + 0.02, z));
    add(tubeGeo(pts, 0.0045, 40), k ? M.copperB : M.rubber, torsoG, 'spine', { offs: { back: { p: V(0, 0.07, z * 2), d: 0.1 } } });
  });
  [1, -1].forEach((s) => {
    const pts = [-0.38, -0.2, 0, 0.2, 0.3].map((x) => onCore(x, s * 0.36, 1.05));
    add(tubeGeo(pts, 0.004, 30), M.rubber, torsoG, 'torso');
  });

  // ivory plates on both sides
  const both = (x0, x1, t0, t1, tag, extra = () => ({})) => [1, -1].forEach((s) => {
    const a = s > 0 ? t0 : -t1, b = s > 0 ? t1 : -t0;
    plateT(x0, x1, a, b, torsoG, tag, extra(s));
  });
  both(0.065, 0.315, 0.5, 1.08, 'torso');            // shoulder pad, upper
  both(0.065, 0.2, 1.12, 1.72, 'torso');             // shoulder pad, lower back
  both(0.205, 0.315, 1.12, 1.72, 'torso');           // shoulder pad, lower front
  both(0.13, 0.325, 1.79, 2.55, 'torso');            // lower chest
  both(-0.43, -0.17, 0.46, 1.12, 'torso');           // hip pad, upper
  both(-0.43, -0.29, 1.16, 1.86, 'torso');           // hip pad, lower back
  both(-0.285, -0.17, 1.16, 1.86, 'torso');          // hip pad, lower front
  both(-0.1, 0.07, 1.98, 2.42, 'torso');             // belly side
  both(0.3, 0.362, 0.85, 2.6, 'torso');              // front of the chest
  plateT(0.24, 0.35, 2.62, Math.PI * 2 - 2.62, torsoG, 'torso');   // sternum
  plateT(-0.06, 0.2, 2.55, Math.PI * 2 - 2.55, torsoG, 'torso');   // under the ribs
  // flank: the far side is a fixed plate, the near side is hinged and covers the electronics
  plateT(-0.145, 0.04, 0.53, 1.56, torsoG, 'torso');
  const hingeP = T(-0.052, -0.515).clone();
  const flankHinge = new THREE.Group(); flankHinge.position.copy(hingeP); torsoG.add(flankHinge);
  {
    const g = shellPatch(T, -0.145, 0.04, -1.56, -0.53, { center: (u) => tCenter(u), nu: 12, nv: 12, thick: 0.008, bevel: 0.0045 });
    g.translate(-hingeP.x, -hingeP.y, -hingeP.z);
    add(g, M.ivory, flankHinge, 'flank');
    // hinge knuckles
    [-0.12, -0.05, 0.02].forEach((x) => add(cylGeo(0.006, 0.006, 0.03, 12), M.steel, flankHinge, 'flank', { p: V(x + 0.052, 0, 0), r: [0, 0, Math.PI / 2] }));
  }
  anchor('flankPlate', flankHinge, V(-0.02, -0.06, -0.03));
  // saddle plates down the back: they lift one after another in the Back section
  const backX = [[0.19, 0.285], [0.075, 0.17], [-0.04, 0.055], [-0.155, -0.06], [-0.27, -0.175], [-0.395, -0.29]];
  const backPlates = [];
  backX.forEach(([x0, x1], i) => {
    const m = plateT(x0, x1, -0.19, 0.19, torsoG, 'back', { offs: { back: { p: V(0, 0.16 + i * 0.012, 0), r: V(0, 0, (i % 2 ? 1 : -1) * 0.25), d: i * 0.1 } } });
    backPlates.push(m);
  });
  // bolts on the big plates
  const boltAt = (x, t, parent, tag, offs) => {
    const p = T(x, t), n = T(x, t + 0.01).sub(T(x, t - 0.01)).cross(T(x + 0.01, t).sub(T(x - 0.01, t))).normalize();
    if (n.dot(p.clone().sub(tCenter(x))) < 0) n.negate();
    add(boltGeo(0.0042, 0.006), M.steel, parent, tag, { p: p.addScaledVector(n, 0.003), q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n), offs });
  };
  [1, -1].forEach((s) => {
    [[0.09, 0.7], [0.29, 0.7], [0.09, 1.55], [0.29, 1.5], [0.15, 2.35], [0.3, 2.3], [-0.4, 0.7], [-0.2, 0.7], [-0.4, 1.7], [-0.2, 1.7], [-0.09, 1.8], [0.07, 1.8], [0.33, 1.2], [0.33, 2.2]]
      .forEach(([x, t]) => boltAt(x, s * t, torsoG, 'torso'));
    if (s > 0) [[-0.13, 0.7], [0.025, 0.7], [-0.13, 1.4], [0.025, 1.4]].forEach(([x, t]) => boltAt(x, t, torsoG, 'torso'));
  });
  backX.forEach(([x0, x1], i) => [-0.12, 0.12].forEach((t) => boltAt((x0 + x1) / 2, t, torsoG, 'back', { back: { p: V(0, 0.16 + i * 0.012, 0), d: i * 0.1 } })));

  // ------------------------------------------------------------------ battery tray and control board (near side)
  const tray = new THREE.Group();
  const trayZ = -(tp(-0.05).w * 0.84) + 0.012;
  tray.position.set(-0.052, 0.545, trayZ); torsoG.add(tray);
  add(rbox(0.18, 0.115, 0.012, 0.003), M.gun, tray, 'flank', { p: V(0, 0, 0.008) });
  [-1, 1].forEach((k) => add(rbox(0.18, 0.006, 0.03, 0.002), M.steel, tray, 'flank', { p: V(0, k * 0.058, -0.004) }));
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) for (let lay = 0; lay < 2; lay++) {
    const p = V(-0.042 + col * 0.084, -0.034 + row * 0.024, -0.004 - lay * 0.0) + 0;
    const pp = V(-0.042 + col * 0.084, -0.034 + row * 0.024 + lay * 0.0, -0.006 - lay * 0.0);
    if (lay) continue;
    add(cylGeo(0.0105, 0.0105, 0.072, 18), M.cell, tray, 'flank', { p: pp, r: [0, 0, Math.PI / 2] });
    add(cylGeo(0.0108, 0.0108, 0.006, 18), M.steel, tray, 'flank', { p: pp.clone().add(V(0.038, 0, 0)), r: [0, 0, Math.PI / 2] });
    add(cylGeo(0.0108, 0.0108, 0.006, 18), M.copper, tray, 'flank', { p: pp.clone().add(V(-0.038, 0, 0)), r: [0, 0, Math.PI / 2] });
  }
  // bus bars
  [-0.042, 0.042].forEach((x) => add(rbox(0.005, 0.07, 0.003, 0.001), M.copper, tray, 'flank', { p: V(x + 0.04, -0.01, -0.019) }));
  // control board above the cells
  const board = new THREE.Group(); board.position.set(0, 0.044, -0.016); tray.add(board);
  {
    const g = new THREE.BoxGeometry(0.17, 0.034, 0.003);
    add(g, [M.chip, M.chip, M.chip, M.chip, M.pcb, M.pcb], board, 'flank', { r: [0, Math.PI, 0] });
    add(rbox(0.026, 0.02, 0.006, 0.001), M.chip, board, 'flank', { p: V(-0.02, 0.0, -0.004) });
    add(rbox(0.018, 0.014, 0.003, 0.001), M.copper, board, 'flank', { p: V(-0.02, 0.0, -0.008) });
    [[-0.06, 0.006], [-0.05, -0.008], [0.015, 0.008], [0.03, -0.006], [0.05, 0.006], [0.068, -0.006]].forEach(([x, y]) =>
      add(rbox(0.01, 0.008, 0.004, 0.001), M.chip, board, 'flank', { p: V(x, y, -0.003) }));
    add(rbox(0.04, 0.006, 0.006, 0.001), M.steel, board, 'flank', { p: V(0.045, -0.013, -0.004) });
  }
  // looms from the tray into the body
  [[0.07, 0.03], [0.07, -0.03], [-0.08, 0.04]].forEach(([x, y], k) =>
    add(tubeGeo([V(x, y, -0.01), V(x + 0.02 * Math.sign(x), y + 0.03, 0.01), V(x + 0.05 * Math.sign(x), y + 0.05, 0.04)], 0.0035, 12), k === 1 ? M.copperB : M.rubber, tray, 'flank'));
  anchors.tray = anchor('tray', tray, V(0.0, -0.01, -0.02));
  anchor('board', board, V(-0.02, 0.0, -0.01));

  // ------------------------------------------------------------------ neck
  const neckDir = NECK1.clone().sub(NECK0).normalize();
  const nUp = V(-neckDir.y, neckDir.x, 0);
  const nZ = V(0, 0, 1);
  const neckR = (f) => ({ a: lerp(0.112, 0.09, f), b: lerp(0.104, 0.084, f) });
  const NL = NECK0.distanceTo(NECK1) + 0.03;
  const neckFn = (u, v) => {
    const f = u / NL, r = neckR(f);
    return NECK0.clone().addScaledVector(neckDir, u - 0.02).addScaledVector(nUp, r.a * Math.cos(v)).addScaledVector(nZ, r.b * Math.sin(v));
  };
  const neckC = (u) => NECK0.clone().addScaledVector(neckDir, u - 0.02);
  const NS = 7;
  for (let i = 0; i < NS; i++) {
    const u0 = (i / NS) * NL, u1 = ((i + 1) / NS) * NL - 0.011;
    add(shellPatch(neckFn, u0, u1, -2.05, 2.05, { center: neckC, nu: 4, nv: 14, thick: 0.008, bevel: 0.004 }), M.ivory, inner, 'neck');
    // dark ring under each collar
    const c = neckC((u0 + u1) / 2), r = neckR((u0 + u1) / 2 / NL);
    const g = new THREE.TorusGeometry(1, 0.1, 6, 30);
    const m = add(g, i % 2 ? M.gun : M.copper, inner, 'neck', { p: c });
    m.quaternion.setFromUnitVectors(V(0, 0, 1), neckDir);
    m.scale.set(r.a * 0.97, r.b * 0.97, 0.12);
    m.rotateZ(Math.PI / 2);
  }
  // throat pistons and cables
  [-2.6, -2.2, -1.8, -1.25, -0.6, 0.6, 1.25, 1.8, 2.2, 2.6].forEach((v) => {
    const a = neckFn(0.01, v).lerp(neckC(0.01), 0.09), b = neckFn(NL - 0.02, v).lerp(neckC(NL - 0.02), 0.09);
    piston(inner, a, b, 0.0095, 'neck');
  });
  [-2.9, 2.9, 3.14].forEach((v, k) => add(tubeGeo([neckFn(0.0, v).lerp(neckC(0), 0.2), neckFn(NL * 0.5, v).lerp(neckC(NL * 0.5), 0.1), neckFn(NL, v).lerp(neckC(NL), 0.2)], 0.005, 16), k === 2 ? M.copperB : M.rubber, inner, 'neck'));

  // ------------------------------------------------------------------ head
  // Measured off the owner's side and front views (head-local, metres from the neck joint): skull top +0.09, a sharp stop
  // at x 0.19, a deep square muzzle 0.15 tall, jowls hanging to -0.15, nose at x 0.26, skull 0.24 wide.
  const head = new THREE.Group(); head.position.copy(NECK1); inner.add(head);
  const hp = (x) => {
    const top = tab([[-0.075, -0.02], [-0.05, 0.05], [0.0, 0.088], [0.09, 0.097], [0.135, 0.088], [0.165, 0.066], [0.19, 0.03], [0.215, 0.02], [0.245, 0.014], [0.262, -0.008], [0.274, -0.045]], x);
    const bot = tab([[-0.075, -0.06], [-0.04, -0.12], [0.03, -0.148], [0.12, -0.152], [0.19, -0.146], [0.24, -0.136], [0.262, -0.11], [0.274, -0.075]], x);
    return { yc: (top + bot) / 2, h: (top - bot) / 2, w: tab([[-0.075, 0.03], [-0.05, 0.095], [0.02, 0.122], [0.1, 0.12], [0.16, 0.1], [0.2, 0.094], [0.245, 0.086], [0.262, 0.072], [0.274, 0.024]], x), n: 2.8 };
  };
  const H = loftX(hp);
  const hC = (x) => V(x, hp(x).yc, 0);
  const plateH = (x0, x1, t0, t1, parent, tag, o = {}) => add(shellPatch(H, x0, x1, t0, t1, { center: hC, nu: 10, nv: 10, thick: 0.007, bevel: 0.002 }), M.ivory, parent, tag, o);
  const hcore = loftX((x) => { const p = hp(x); return { ...p, h: p.h * 0.93, w: p.w * 0.92 }; });
  // the core leaves the mouth open: skull and nape all round, the muzzle only above the lips
  add(shellPatch(hcore, -0.072, 0.07, -Math.PI, Math.PI, { center: hC, nu: 10, nv: 28, thick: 0.003, bevel: 0.001 }), M.dark, head, 'head');
  add(shellPatch(hcore, 0.07, 0.272, -2.2, 2.2, { center: hC, nu: 12, nv: 24, thick: 0.003, bevel: 0.001 }), M.dark, head, 'head');
  const snarl = (s, dy, dz, rx = 0) => ({ snarl: { p: V(-0.004, dy, s * dz), r: V(s * rx, 0, 0), d: 0 } });
  plateH(-0.05, 0.133, -0.83, 0.83, head, 'head');           // skull cap
  plateH(0.135, 0.19, -0.66, 0.66, head, 'head');            // forehead between the brows
  plateH(0.192, 0.262, -0.72, 0.72, head, 'head');           // muzzle bridge
  [1, -1].forEach((s) => {
    const r = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    plateH(-0.05, 0.088, ...r(0.85, 1.53), head, 'head');    // temple
    plateH(-0.04, 0.088, ...r(1.545, 2.32), head, 'head');   // cheek: the big chewing muscle
    plateH(0.091, 0.19, ...r(0.68, 1.33), head, 'head');     // round the eye
    plateH(0.091, 0.19, ...r(1.345, 1.75), head, 'head', { offs: snarl(s, 0.012, 0.004) }); // under the eye
    plateH(0.192, 0.262, ...r(0.735, 1.5), head, 'head', { offs: snarl(s, 0.01, 0.004, -0.05) }); // upper lip
    plateH(0.192, 0.262, ...r(1.515, 2.3), head, 'head', { offs: snarl(s, 0.02, 0.01, -0.12) }); // jowl: peels back in a snarl
    plateH(0.091, 0.19, ...r(1.765, 2.0), head, 'head', { offs: snarl(s, 0.012, 0.006) }); // muzzle side
    plateH(0.091, 0.19, ...r(2.015, 2.3), head, 'head', { offs: snarl(s, 0.018, 0.01, -0.1) }); // flews
    // heavy brow, angled down toward the nose: the frown
    add(rbox(0.075, 0.024, 0.042, 0.009), M.ivory, head, 'head', { p: V(0.15, 0.072, s * 0.07), r: [s * 0.32, s * -0.42, -0.42] });
    add(rbox(0.05, 0.016, 0.03, 0.006), M.ivory, head, 'head', { p: V(0.172, 0.064, s * 0.034), r: [s * 0.2, s * -0.2, -0.55] });
    // wrinkle ridges on the forehead
    for (let k = 0; k < 2; k++) add(rbox(0.05, 0.008, 0.012, 0.004), M.ivory, head, 'head', { p: V(0.11 + k * 0.025, 0.1 - k * 0.006, s * 0.022), r: [0, s * 0.5, -0.1] });
    // whisker pores
    for (let i = 0; i < 9; i++) {
      const x = 0.2 + (i % 3) * 0.019, t = s * (1.12 + Math.floor(i / 3) * 0.2), p = H(x, t);
      add(boltGeo(0.0028, 0.004), M.gloss, head, 'head', { p, q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(0.25, 0, s).normalize()), offs: snarl(s, 0.03, 0.014) });
    }
    // jaw hinge: hub and a pair of copper pistons that drive the bite
    hubSmall(head, V(0.03, -0.1, s * 0.112), s, 0.022, 'head');
    piston(head, V(-0.04, -0.03, s * 0.1), V(0.03, -0.1, s * 0.106), 0.008, 'head');
  });
  // front of the muzzle under the nose
  add(shellPatch(H, 0.2625, 0.2735, -2.2, 2.2, { center: hC, nu: 4, nv: 24, thick: 0.006, bevel: 0.002 }), M.ivory, head, 'head', { offs: snarl(1, 0.01, 0) });
  // nose: big, dark, flat-fronted
  add(rbox(0.05, 0.05, 0.1, 0.018), M.gloss, head, 'head', { p: V(0.264, -0.006, 0), r: [0, 0, -0.15] });
  [1, -1].forEach((s) => add(boltGeo(0.008, 0.005), M.dark, head, 'head', { p: V(0.289, -0.016, s * 0.02), q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(1, -0.25, s * 0.45).normalize()) }));
  // palate over the mouth
  add(rbox(0.19, 0.006, 0.13, 0.003), M.dark, head, 'head', { p: V(0.165, -0.084, 0) }).userData.mouth = true;
  // teeth: 20 upper, 22 lower, as in a real dog. Steel, with the canines long and hooked.
  const teeth = { up: 0, lo: 0 };
  const arcP = (f, y, scale = 1) => { // f: 0 at the back of the row, 1 at the front centre
    const a = f * Math.PI / 2;
    return V(lerp(0.105, 0.248, Math.sin(a)) - 0.004 * (1 - scale), y, 0.064 * Math.cos(a) * scale);
  };
  const tooth = (parent, pos, len, r, down, tag) => {
    const g = new THREE.ConeGeometry(r, len, 10); if (down) g.rotateX(Math.PI);
    const m = add(g, M.tooth, parent, tag, { p: pos.clone().add(V(0, down ? -len / 2 : len / 2, 0)) });
    return m;
  };
  [1, -1].forEach((s) => {
    for (let k = 0; k < 6; k++) { const p = arcP(0.12 + k * 0.1, -0.087); p.z *= s; tooth(head, p, 0.014 + (k === 5 ? 0.008 : 0), 0.0055, true, 'teeth'); teeth.up++; }
    const c = arcP(0.82, -0.087); c.z *= s; tooth(head, c, 0.044, 0.0085, true, 'teeth'); teeth.up++;
    for (let k = 0; k < 3; k++) { const p = arcP(0.89 + k * 0.035, -0.087); p.z *= s; tooth(head, p, 0.013, 0.004, true, 'teeth'); teeth.up++; }
  });
  // upper gum line
  [1, -1].forEach((s) => add(tubeGeo([0, 0.25, 0.5, 0.75, 1].map((f) => { const p = arcP(f, -0.085); p.z *= s; return p; }), 0.006, 14), M.gum, head, 'teeth'));

  // lower jaw: hinged at the back of the cheek, drops open in a snarl
  const JP = V(0.03, -0.1, 0);
  const jaw = new THREE.Group(); jaw.position.copy(JP); head.add(jaw);
  {
    const g = shellPatch(H, 0.03, 0.262, Math.PI - 0.74, Math.PI + 0.74, { center: hC, nu: 12, nv: 8, thick: 0.007, bevel: 0.0035 });
    g.translate(-JP.x, -JP.y, -JP.z);
    add(g, M.ivory, jaw, 'head');
    // jaw floor and tongue
    add(rbox(0.2, 0.008, 0.11, 0.003), M.dark, jaw, 'head', { p: V(0.14 - JP.x, -0.132 - JP.y, 0) }).userData.mouth = true;
    const tg = new THREE.SphereGeometry(1, 24, 12); tg.scale(0.085, 0.014, 0.042);
    add(tg, M.tongue, jaw, 'head', { p: V(0.15 - JP.x, -0.122 - JP.y, 0) }).userData.mouth = true;
    [1, -1].forEach((s) => {
      for (let k = 0; k < 7; k++) { const p = arcP(0.08 + k * 0.095, -0.128, 0.92); p.z *= s; tooth(jaw, p.sub(JP), 0.013 + (k === 6 ? 0.006 : 0), 0.005, false, 'teeth'); teeth.lo++; }
      const c = arcP(0.8, -0.128, 0.92); c.z *= s; tooth(jaw, c.sub(JP), 0.038, 0.008, false, 'teeth'); teeth.lo++;
      for (let k = 0; k < 3; k++) { const p = arcP(0.88 + k * 0.04, -0.128, 0.9); p.z *= s; tooth(jaw, p.sub(JP), 0.012, 0.0038, false, 'teeth'); teeth.lo++; }
      add(tubeGeo([0, 0.25, 0.5, 0.75, 1].map((f) => { const p = arcP(f, -0.13, 0.92); p.z *= s; return p.sub(JP); }), 0.0055, 14), M.gum, jaw, 'teeth');
    });
  }
  anchor('skull', head, V(0.04, 0.1, -0.05));
  anchor('jaw', jaw, V(0.2 - JP.x, -0.14 - JP.y, -0.07));
  anchor('fang', head, V(0.22, -0.12, -0.05));
  anchor('jawPiston', head, V(-0.005, -0.065, -0.104));
  anchor('teeth', jaw, V(0.12 - JP.x, -0.125 - JP.y, -0.06));

  // ------------------------------------------------------------------ camera eyes
  const eyes = [];
  [1, -1].forEach((s) => {
    const e = new THREE.Group(); e.position.set(0.152, 0.036, s * 0.1);
    e.quaternion.setFromUnitVectors(V(0, 0, 1), V(0.72, 0.02, s * 0.69).normalize());
    head.add(e); eyes.push(e);
    const near = s < 0;
    const o = (z) => ({ eye: { p: V(0, 0, near ? z : 0), d: 0 } });
    add(ringGeo(0.016, 0.024, 0.012), M.gun, e, 'eye', { p: V(0, 0, -0.002), offs: o(0.012) });
    const eRing = add(ringGeo(0.0118, 0.018, 0.007), M.copper, e, 'eye', { p: V(0, 0, 0.004), offs: o(0.085) });
    for (let k = 0; k < 3; k++) add(ringGeo(0.0088, 0.0118, 0.004), M.gloss, e, 'eye', { p: V(0, 0, -0.002 - k * 0.0045), offs: o(0.035 + k * 0.016) });
    const eIris = add(discGeo(0.011, 0.002, 32, 0.0), M.iris, e, 'eye', { p: V(0, 0, 0.003), offs: o(0.11) });
    add(domeGeo(0.0058, 0.004), M.gloss, e, 'eye', { p: V(0, 0, 0.004), offs: o(0.135) });
    const eGlass = add(domeGeo(0.0155, 0.008), M.glass, e, 'eye', { p: V(0, 0, 0.006), offs: o(0.165) });
    const eBoard = add(rbox(0.018, 0.018, 0.003, 0.001), M.pcb, e, 'eye', { p: V(0, 0, -0.018), offs: o(0.035) });
    if (near) { anchor('eyeGlass', eGlass, V(0, 0, 0.008)); anchor('eyeIris', eIris, V(0, 0, 0)); anchor('eyeRing', eRing, V(0, 0.016, 0)); anchor('eyeBoard', eBoard, V(0, 0, 0)); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(boltGeo(0.0018, 0.003), M.steel, e, 'eye', { p: V(Math.cos(a) * 0.021, Math.sin(a) * 0.021, 0.004), offs: o(0.012) }); }
    if (near) anchor('eye', e, V(0, 0, 0.01));
  });

  // ------------------------------------------------------------------ ears (cropped, upright)
  const ears = [];
  [1, -1].forEach((s) => {
    const ear = new THREE.Group(); ear.position.set(0.035, 0.088, s * 0.082);
    ear.rotation.set(s * -0.38, s * -0.4, 0.2, 'YXZ');
    head.add(ear);
    const near = s < 0;
    const tri = [[-0.026, 0], [0.026, 0], [-0.004, 0.085]];
    const roundTri = (pts, r) => { // shrink for the inner window
      const c = pts.reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
      return pts.map(([x, y]) => [c[0] + (x - c[0]) * r, c[1] + (y - c[1]) * r]);
    };
    const frameShape = new THREE.Shape(tri.map(([x, y]) => new THREE.Vector2(x, y)));
    const hole = new THREE.Path(roundTri(tri, 0.66).map(([x, y]) => new THREE.Vector2(x, y)).reverse());
    frameShape.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(frameShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
    fg.translate(0, 0, -0.004);
    const o = (p, r) => ({ ear: near ? { p, r: r || V(0, 0, 0), d: 0 } : { p: V(), d: 0 } });
    add(fg, M.ivory, ear, 'ear', { offs: o(V(0, 0.0, s * 0.0)) });
    add(slabGeo(roundTri(tri, 0.8), 0.004, 0.001), M.dark, ear, 'ear', { p: V(0, 0, -s * 0.006), offs: o(V(0, 0, -s * 0.006)) });
    // smoked membrane, hinged at the front edge, swings open in the Ear section
    const memb = new THREE.Group(); memb.position.set(0.02, 0.0, s * 0.006); ear.add(memb);
    const mg = slabGeo(roundTri(tri, 0.72).map(([x, y]) => [x - 0.02, y]), 0.0025, 0.0008);
    const eMemb = add(mg, M.smoke, memb, 'ear', { offs: o(V(0, 0, s * 0.02)) });
    if (near) anchor('earMemb', eMemb, V(-0.02, 0.04, 0));
    // gears inside
    const gears = [];
    [[-0.006, 0.026, 0.0115, 12, M.steel], [0.006, 0.045, 0.008, 9, M.copper], [-0.009, 0.058, 0.0065, 8, M.steel]].forEach(([x, y, r, n, m], k) => {
      const g = add(gearGeo(r, n, 0.003), m, ear, 'ear', { p: V(x, y, 0), offs: o(V(0, 0, s * (0.01 + k * 0.008))) });
      g.userData.spin = (k % 2 ? -1 : 1) * (12 / n);
      if (near && k === 0) anchor('earGear', g, V(0, 0, 0));
      gears.push(g);
      add(boltGeo(0.0018, 0.005), M.copper, ear, 'ear', { p: V(x, y, s * 0.002), offs: o(V(0, 0, s * (0.014 + k * 0.008))) });
    });
    // pivot hub at the base
    add(cylGeo(0.012, 0.012, 0.03, 18), M.gun, ear, 'ear', { p: V(0, -0.004, 0), r: [0, 0, Math.PI / 2] });
    add(ringGeo(0.009, 0.0135, 0.006), M.copper, ear, 'ear', { p: V(0.016, -0.004, 0), r: [0, Math.PI / 2, 0] });
    ears.push({ ear, memb, gears, s, base: ear.rotation.clone() });
    if (near) { anchor('ear', ear, V(-0.006, 0.06, s * 0.008)); anchor('earPivot', ear, V(0.01, -0.004, s * 0.01)); }
  });

  // ------------------------------------------------------------------ joint hubs
  function hubSmall(parent, p, s, r, tag, offs) {
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(0, 0, s));
    const z = (d) => p.clone().add(V(0, 0, s * d));
    add(ringGeo(r * 0.62, r, r * 0.42), M.copper, parent, tag, { p: z(0), q, offs });
    add(discGeo(r * 0.64, r * 0.3, 28, r * 0.06), M.dark, parent, tag, { p: z(0.0), q, offs });
    add(discGeo(r * 0.26, r * 0.3, 18, r * 0.12), M.steel, parent, tag, { p: z(r * 0.12), q, offs });
    const nb = r > 0.025 ? 8 : 6;
    for (let k = 0; k < nb; k++) { const a = (k / nb) * Math.PI * 2; add(boltGeo(r * 0.06, r * 0.18), M.steel, parent, tag, { p: z(r * 0.15).add(V(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0)), q, offs }); }
  }

  // ------------------------------------------------------------------ legs
  const legs = [];
  const LEGS = [
    { key: 'FL', front: true, s: -1 }, { key: 'FR', front: true, s: 1 },
    { key: 'HL', front: false, s: -1 }, { key: 'HR', front: false, s: 1 },
  ];
  LEGS.forEach(({ key, front, s }) => {
    const Hp = front ? V(0.29, 0.5, s * 0.112) : V(-0.36, 0.52, s * 0.108);
    const L1 = front ? 0.225 : 0.25, L2 = front ? 0.24 : 0.26, L3 = front ? 0.1 : 0.14;
    const hip = new THREE.Group(); hip.position.copy(Hp); inner.add(hip);
    const knee = new THREE.Group(); knee.position.set(0, -L1, 0); hip.add(knee);
    const ankle = new THREE.Group(); ankle.position.set(0, -L2, 0); knee.add(ankle);
    const paw = new THREE.Group(); paw.position.set(0, -L3, 0); ankle.add(paw);
    const tag = 'leg';
    const near = s < 0 && front;
    const pawOff = (p) => (near ? { paw: { p, d: 0 } } : {});
    const segs = front
      ? [
        { g: hip, L: L1, a: [[0, 0.062], [0.12, 0.054], [L1, 0.042]], b: [[0, 0.05], [L1, 0.04]], xc: [[0, 0.0], [L1, -0.004]] },
        { g: knee, L: L2, a: [[0, 0.046], [0.08, 0.043], [L2, 0.032]], b: [[0, 0.04], [L2, 0.031]], xc: [[0, 0], [L2, 0]] },
        { g: ankle, L: L3, a: [[0, 0.033], [L3, 0.03]], b: [[0, 0.032], [L3, 0.031]], xc: [[0, 0], [L3, 0.004]] },
      ]
      : [
        { g: hip, L: L1, a: [[0, 0.088], [0.08, 0.08], [L1, 0.04]], b: [[0, 0.058], [L1, 0.036]], xc: [[0, 0.01], [L1, 0.0]] },
        { g: knee, L: L2, a: [[0, 0.056], [0.08, 0.047], [L2, 0.032]], b: [[0, 0.043], [L2, 0.031]], xc: [[0, -0.004], [L2, -0.004]] },
        { g: ankle, L: L3, a: [[0, 0.035], [L3, 0.03]], b: [[0, 0.032], [L3, 0.031]], xc: [[0, 0], [L3, 0.003]] },
      ];
    segs.forEach((sg, si) => {
      const prof = (u) => ({ a: tab(sg.a, u), b: tab(sg.b, u), xc: tab(sg.xc, u), n: 2.4 });
      const F = loftY(prof);
      const cen = (u) => V(tab(sg.xc, u), -u, 0);
      const offs = si === 2 ? pawOff(V(0, 0, s * 0.035)) : (near ? { paw: { p: V(0, 0, s * 0.02 * si), d: 0 } } : {});
      // inner strut
      add(rbox(0.024, sg.L * 0.92, 0.026, 0.006), M.gun, sg.g, tag, { p: V(tab(sg.xc, sg.L / 2) - 0.004, -sg.L / 2, 0), offs });
      // outer shell plates: two along the bone
      const tA = s > 0 ? -0.35 : -2.45, tB = s > 0 ? 2.45 : 0.35;
      const cut = sg.L * (si === 0 ? 0.55 : 0.5);
      const u0 = si === 0 ? 0.02 : 0.018;
      add(shellPatch(F, u0, cut - 0.004, tA, tB, { center: cen, nu: 8, nv: 12, thick: 0.007, bevel: 0.004 }), M.ivory, sg.g, tag, { offs });
      add(shellPatch(F, cut + 0.004, sg.L - 0.016, tA, tB, { center: cen, nu: 8, nv: 12, thick: 0.007, bevel: 0.004 }), M.ivory, sg.g, tag, { offs });
      // inner side plate (narrow), leaves the mechanism showing
      const iA = s > 0 ? 3.3 : -3.95, iB = s > 0 ? 3.95 : -3.3;
      add(shellPatch(F, 0.03, sg.L - 0.03, iA, iB, { center: cen, nu: 6, nv: 4, thick: 0.006, bevel: 0.003 }), M.ivory, sg.g, tag, { offs });
      // piston down the back of the bone
      const bx = -tab(sg.a, sg.L / 2) * 0.82 + tab(sg.xc, sg.L / 2);
      piston(sg.g, V(bx, -0.03, s * 0.01), V(bx * 0.9, -sg.L + 0.03, s * 0.01), si === 0 ? 0.0095 : 0.0075, tag, offs);
      // cable on the inside
      add(tubeGeo([V(0.004, -0.01, -s * 0.02), V(0.008, -sg.L * 0.5, -s * 0.024), V(0.004, -sg.L + 0.01, -s * 0.02)], 0.0032, 10), si === 1 ? M.copperB : M.rubber, sg.g, tag, { offs });
      // bolts on the shell
      [0.3, 0.75].forEach((f) => {
        const u = sg.L * f, t = s * 1.1, p = F(u, t);
        add(boltGeo(0.0035, 0.005), M.steel, sg.g, tag, { p: p.add(V(0, 0, s * 0.003)), q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(0, 0, s)), offs });
      });
    });
    // hubs: the big one at the shoulder or hip sits on the torso pad; smaller ones at the knee and ankle
    const padZ = Math.abs(sideZ((Hp.x - TOX) / TX, Hp.y, 1)) * TZ + 0.004;
    hubSmall(hip, V(0, 0, s * (padZ - Math.abs(Hp.z))), s, front ? 0.046 : 0.05, tag, near ? { paw: { p: V(0, 0, s * 0.012), d: 0 } } : {});
    hubSmall(knee, V(0, 0, s * (tab(segs[1].b, 0) + 0.006)), s, front ? 0.026 : 0.03, tag, near ? { paw: { p: V(0, 0, s * 0.03), d: 0 } } : {});
    hubSmall(ankle, V(0, 0, s * (tab(segs[2].b, 0) + 0.006)), s, 0.021, tag, near ? { paw: { p: V(0, 0, s * 0.045), d: 0 } } : {});
    // paw: base plate, heel pad, four toes with pads, caps, rings and claws
    const P0 = { p: V(0.016, -0.004, 0) };
    add(rbox(0.07, 0.024, 0.068, 0.01), M.ivory, paw, tag, { p: P0.p, offs: pawOff(V(0, 0.01, s * 0.03)) });
    add(rbox(0.042, 0.022, 0.05, 0.01), M.rubber, paw, tag, { p: V(-0.004, -0.024, 0), offs: pawOff(V(-0.02, -0.03, 0)) });
    add(ringGeo(0.022, 0.03, 0.01), M.copper, paw, tag, { p: V(0, 0.006, 0), r: [Math.PI / 2, 0, 0], offs: pawOff(V(0, 0.03, 0)) });
    [-0.027, -0.009, 0.009, 0.027].forEach((z, k) => {
      const x = 0.044 + (k === 1 || k === 2 ? 0.008 : 0);
      const spread = V(0.022, 0, z * 0.9);
      const ball = new THREE.SphereGeometry(0.0155, 18, 12);
      add(ball, M.rubber, paw, tag, { p: V(x, -0.02, z), s: [1.18, 0.95, 1], offs: pawOff(spread.clone().add(V(0, -0.012, 0))) });
      add(rbox(0.026, 0.012, 0.016, 0.005), M.ivory, paw, tag, { p: V(x - 0.006, -0.005, z), r: [0, 0, -0.35], offs: pawOff(spread.clone().add(V(0, 0.012, 0))) });
      add(new THREE.TorusGeometry(0.0072, 0.0022, 6, 16), M.copper, paw, tag, { p: V(x - 0.017, -0.009, z), offs: pawOff(spread.clone().add(V(-0.008, 0.004, 0))) });
      const cl = new THREE.ConeGeometry(0.0038, 0.017, 8); cl.rotateZ(-Math.PI / 2 - 0.5);
      add(cl, M.steel, paw, tag, { p: V(x + 0.017, -0.025, z), offs: pawOff(spread.clone().add(V(0.02, -0.006, 0))) });
    });
    if (near) { anchor('wrist', ankle, V(0.0, 0.0, s * 0.04)); anchor('paw', paw, V(0.04, -0.01, s * 0.03)); anchor('shoulder', hip, V(0, 0, s * 0.16)); }
    if (key === 'HL') { anchor('knee', knee, V(0, 0, s * 0.05)); anchor('hipH', hip, V(0, 0, s * 0.12)); anchor('hock', ankle, V(0, 0, s * 0.04)); anchor('hindPaw', paw, V(0.04, -0.01, s * 0.03)); }
    if (near && front) anchor('elbow', knee, V(0, 0, s * 0.045));
    legs.push({ key, front, s, hip, knee, ankle, paw, H: Hp, L1, L2, L3 });
  });

  // ------------------------------------------------------------------ tail
  const tail = [];
  {
    let parent = inner, p = V(-0.48, 0.6, 0);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); g.position.copy(p); parent.add(g);
      g.rotation.z = i === 0 ? 1.15 : (i < 4 ? -0.02 : 0.05);
      const f = i / (n - 1), r = lerp(0.027, 0.014, f), L = 0.05;
      const prof = [new THREE.Vector2(0, 0.004), new THREE.Vector2(r * 0.9, 0.006), new THREE.Vector2(r, 0.012), new THREE.Vector2(r * 0.97, L - 0.01), new THREE.Vector2(r * 0.84, L - 0.004), new THREE.Vector2(0, L - 0.003)];
      add(new THREE.LatheGeometry(prof, 24), M.ivory, g, 'tail');
      add(new THREE.TorusGeometry(r * 0.82, r * 0.16, 8, 22), M.copper, g, 'tail', { r: [Math.PI / 2, 0, 0], p: V(0, 0.001, 0) });
      add(cylGeo(r * 0.55, r * 0.55, 0.008, 14), M.gun, g, 'tail', { p: V(0, -0.001, 0) });
      // inside: the joint servo with its copper output horn, the signal cable, and a board in the first three
      const servo = add(rbox(r * 1.15, 0.022, r * 0.95, 0.003), M.gun, g, 'tail', { p: V(0, 0.022, 0) });
      add(cylGeo(r * 0.32, r * 0.32, 0.004, 14), M.copper, g, 'tail', { p: V(0, 0.022, -r * 0.5), r: [Math.PI / 2, 0, 0] });
      const cable = add(cylGeo(r * 0.16, r * 0.16, L * 0.92, 8), M.copperB, g, 'tail', { p: V(r * 0.42, L / 2, r * 0.2) });
      let board = null;
      if (i < 3) board = add(rbox(r * 1.3, 0.028, 0.0028, 0.001), M.pcb, g, 'tail', { p: V(0, 0.024, -r * 0.62) });
      if (i === 1) anchor('tailServo', servo, V(0, 0, -r * 0.5));
      if (i === 3) anchor('tailCable', cable, V(0, 0, 0));
      if (i === 0) anchor('tailBoard', board, V(0, 0, -0.002));
      if (i === 0) anchor('tailRoot', g, V(0, 0, 0));
      tail.push(g);
      parent = g; p = V(0, L, 0);
    }
    const tip = new THREE.SphereGeometry(0.012, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    add(tip, M.ivory, parent, 'tail', { p: V(0, 0.048, 0) });
    anchors.tail = anchor('tail', tail[4], V(0, 0.02, -0.02));
    anchor('tailTip', parent, V(0, 0.05, 0));
  }

  anchor('head', head, V(0.08, 0.14, -0.02));
  anchor('flank', inner, V(-0.03, 0.5, -0.16));
  anchor('back', inner, V(0.16, 0.71, 0));
  anchor('center', inner, V(0, 0.5, 0));
  // ends of the back and flank cutaways (inner frame = world at the standing pose)
  anchor('backA', inner, V(-0.42, 0.6, 0)); anchor('backB', inner, V(0.25, 0.63, 0));
  anchor('flankA', inner, V(-0.3, 0.47, 0)); anchor('flankB', inner, V(0.18, 0.47, 0));

  return { root, body, inner, torsoG, head, jaw, teeth, eyes, ears, legs, tail, flankHinge, tray, backPlates, parts, anchors, M };
}

/** Teardown directions, worked out once in the standing pose. Every part flies outward from the body's centre. */
export function computeExplode(dog) {
  dog.root.updateMatrixWorld(true);
  const C = new THREE.Vector3(0, 0.48, 0);
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const box = new THREE.Box3(), wc = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  dog.parts.forEach((m) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); box.getCenter(wc);
    const d = wc.clone().sub(C);
    const tagBoost = { head: 1.25, eye: 1.4, ear: 1.4, tail: 1.3, leg: 1.0, back: 1.15 }[m.userData.tag] || 1;
    d.y *= 1.25; d.x *= 1.1;
    const dir = d.clone().normalize().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.4, rnd() - 0.5).multiplyScalar(0.55)).normalize();
    const mag = (0.3 + d.length() * 1.05 + rnd() * 0.22) * tagBoost;
    // the code-built innards inside the chassis box are left out of the teardown: the chassis shows there instead
    m.userData.core = Math.abs(wc.z) < 0.115 && wc.y > 0.43 && wc.y < 0.64 && wc.x > -0.34 && wc.x < 0.28;
    const world = dir.multiplyScalar(mag);
    // into the parent's frame
    m.parent.matrixWorld.decompose(new THREE.Vector3(), q, sc);
    const local = world.applyQuaternion(q.invert()).divide(sc);
    m.userData.ex = { p: local, r: new THREE.Vector3((rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4), d: rnd() * 0.3 + Math.min(0.12, Math.abs(d.x) * 0.1) };
    m.userData.rest = { p: m.position.clone(), r: m.rotation.clone() };
  });
}

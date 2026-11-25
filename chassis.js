// The chassis: the steel box inside the body that everything bolts to. It shows whenever the body is opened (Back,
// Flank, Paw, Hind leg, Tail) and in the full Teardown, so the inside is never hollow. It holds the battery pack, the
// main board and the power and signal lines, and it carries the four leg motors on the hips and shoulders, the spine
// shaft, the neck motor with the jaw cable and the tail motor. The motors' gears turn with the joints they drive.
import * as THREE from 'three';
import { gearGeo, ringGeo, tubeGeo, rbox, V } from './geo.js';
import { NECK0, NECK1 } from './dog.js';

export function buildChassis(dog) {
  const M = dog.M;
  const coolant = new THREE.MeshStandardMaterial({ color: 0x3f7f8c, metalness: 0.4, roughness: 0.3 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x6d6f75, metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide });
  const led = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.2 });
  const mesh = (g, m, parent, p, r) => { const o = new THREE.Mesh(g, m); if (p) o.position.copy(p); if (r) o.rotation.set(...r); parent.add(o); return o; };
  const anchor = (name, parent, p) => { const a = new THREE.Object3D(); a.position.copy(p); parent.add(a); dog.anchors[name] = a; return a; };
  const bar = (parent, a, b, w, m) => {
    const d = b.clone().sub(a), L = d.length();
    const o = mesh(rbox(w, L, w, w * 0.3), m, parent, a.clone().add(b).multiplyScalar(0.5));
    o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return o;
  };
  // a root on the body with world-aligned axes, so everything below is written in the standing dog's frame
  const root = new THREE.Group(); dog.inner.add(root);
  { const P = V(0, 0, 0); root.position.copy(dog.inner.worldToLocal(P.clone())); const q = new THREE.Quaternion(); dog.inner.getWorldQuaternion(q); root.quaternion.copy(q.invert()); }

  // ---- the box: rails, posts, cross bars, a floor and the far wall (so the inside reads against it)
  const X0 = -0.31, X1 = 0.25, Y0 = 0.455, Y1 = 0.6, Z = 0.085;
  for (const y of [Y0, Y1]) for (const z of [-Z, Z]) bar(root, V(X0, y, z), V(X1, y, z), 0.016, M.steel);
  for (const x of [X0, -0.03, X1]) for (const z of [-Z, Z]) bar(root, V(x, Y0, z), V(x, Y1, z), 0.014, M.steel);
  for (const x of [X0, X1]) for (const y of [Y0, Y1]) bar(root, V(x, y, -Z), V(x, y, Z), 0.014, M.gun);
  bar(root, V(X0, Y0, -Z), V(-0.03, Y1, -Z), 0.008, M.copperB); bar(root, V(-0.03, Y0, -Z), V(X1, Y1, -Z), 0.008, M.copperB);
  mesh(rbox(X1 - X0, 0.006, 2 * Z, 0.002), plate, root, V((X0 + X1) / 2, Y0 + 0.004, 0));
  mesh(rbox(X1 - X0, Y1 - Y0, 0.005, 0.002), plate, root, V((X0 + X1) / 2, (Y0 + Y1) / 2, Z - 0.004));
  for (let i = 0; i < 8; i++) for (const y of [Y0, Y1]) mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 6), M.steel, root, V(X0 + 0.03 + i * 0.07, y, -Z - 0.009), [Math.PI / 2, 0, 0]);
  anchor('cxBox', root, V(X1, Y1, -Z));

  // ---- battery pack, low in the middle
  const bx = -0.16, by = Y0 + 0.045;
  mesh(rbox(0.21, 0.075, 0.13, 0.008), M.cell, root, V(bx, by, 0));
  for (let i = 0; i < 6; i++) for (const z of [-0.03, 0.03]) mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 18), M.copper, root, V(bx - 0.08 + i * 0.032, by + 0.04, z));
  mesh(rbox(0.19, 0.006, 0.008, 0.002), M.copper, root, V(bx, by + 0.045, -0.03));
  mesh(rbox(0.19, 0.006, 0.008, 0.002), M.copper, root, V(bx, by + 0.045, 0.03));
  mesh(rbox(0.12, 0.02, 0.002, 0.001), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.5 }), root, V(bx, by, -0.066));
  anchor('cxBattery', root, V(bx + 0.05, by + 0.02, -0.066));

  // ---- main board, upright in the front half, with its lights
  const mb = V(0.1, 0.53, 0.0);
  mesh(rbox(0.15, 0.09, 0.004, 0.002), M.pcb, root, mb);
  mesh(rbox(0.035, 0.035, 0.005, 0.002), M.chip, root, mb.clone().add(V(-0.03, 0.01, -0.004)));
  const leds = [0x5be37a, 0xffb347, 0x5be37a].map((c, i) => mesh(new THREE.SphereGeometry(0.003, 10, 8), led(c), root, mb.clone().add(V(0.055, 0.03 - i * 0.012, -0.004))));
  anchor('cxBoard', root, mb.clone().add(V(-0.03, 0.01, -0.008)));

  // ---- leg motors: one on each hip and shoulder, its ring gear turning with the leg, a pinion motor above it
  const drives = [];
  dog.legs.forEach((L) => {
    const h = L.hip.getWorldPosition(new THREE.Vector3());
    const s = Math.sign(h.z) || 1, z = s * 0.115, c = V(h.x, h.y, z);
    mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.05, 30), M.gun, root, c, [Math.PI / 2, 0, 0]);
    mesh(ringGeo(0.046, 0.054, 0.012), M.copper, root, c.clone().add(V(0, 0, s * 0.02)));
    const ring = mesh(gearGeo(0.056, 30, 0.008, 0.55), M.steel, root, c.clone().add(V(0, 0, -s * 0.03)));
    const pc = c.clone().add(V(0, 0.072, -s * 0.0));
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 20), M.dark, root, pc.clone().add(V(0, 0, s * 0.005)), [Math.PI / 2, 0, 0]);
    const pin = mesh(gearGeo(0.017, 10, 0.008), M.copper, root, pc.clone().add(V(0, 0, -s * 0.03)));
    // bracket up to the box, and power and signal lines back to the battery and board
    bar(root, c.clone().add(V(0, 0.03, -s * 0.0)), V(h.x > 0 ? X1 : X0, Y0 + 0.01, s * Z), 0.012, M.gun);
    mesh(tubeGeo([pc.clone().add(V(0, 0.018, 0)), V(h.x * 0.6, Y0 + 0.09, s * 0.06), V(bx + (h.x > 0 ? 0.1 : -0.1), by + 0.03, s * 0.05)], 0.0045, 20), M.copper, root);
    mesh(tubeGeo([pc.clone().add(V(0, 0.01, -s * 0.02)), V(h.x * 0.5, 0.56, s * 0.03), mb.clone().add(V(h.x > 0 ? 0.075 : -0.075, -0.03, 0))], 0.003, 20), M.dark, root);
    drives.push({ L, ring, pin, s, rest: L.hip.rotation.z });
    if (L.key === 'FL') anchor('cxShoulder', root, c.clone().add(V(0, 0.03, -s * 0.035)));
    if (L.key === 'HL') anchor('cxHip', root, c.clone().add(V(0, 0.03, -s * 0.035)));
  });

  // ---- spine shaft along the top, with a universal joint in the middle; the neck motor at the front, tail motor behind
  bar(root, V(-0.37, Y1 + 0.02, 0), V(0.3, Y1 + 0.02, 0), 0.012, M.steel);
  mesh(rbox(0.026, 0.026, 0.026, 0.005), M.copper, root, V(-0.03, Y1 + 0.02, 0));
  anchor('cxSpine', root, V(-0.2, Y1 + 0.028, 0));
  const nk = V(0.31, 0.62, 0);
  mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.06, 26), M.gun, root, nk, [Math.PI / 2, 0, 0]);
  const neckGear = mesh(gearGeo(0.04, 22, 0.008, 0.55), M.copper, root, nk.clone().add(V(0, 0, -0.035)));
  const nd = NECK1.clone().sub(NECK0).normalize();
  bar(root, nk, nk.clone().addScaledVector(nd, 0.14), 0.014, M.steel);
  // the jaw cable: from the neck motor, up the neck to the jaw hinge
  const hinge = dog.anchors.jawPiston ? dog.anchors.jawPiston.getWorldPosition(new THREE.Vector3()) : V(0.53, 0.64, -0.07);
  mesh(tubeGeo([nk.clone().add(V(0.01, 0.02, -0.03)), nk.clone().addScaledVector(nd, 0.09).add(V(0, 0.01, -0.04)), V(hinge.x - 0.03, hinge.y + 0.01, -0.05)], 0.004, 24), M.copper, root);
  anchor('cxNeck', root, nk.clone().add(V(0, 0.02, -0.04)));
  anchor('cxJaw', root, nk.clone().addScaledVector(nd, 0.09).add(V(0, 0.01, -0.044)));
  const tk = V(-0.37, 0.6, 0);
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 20), M.gun, root, tk, [Math.PI / 2, 0, 0]);
  const tailGear = mesh(gearGeo(0.026, 16, 0.006, 0.5), M.copper, root, tk.clone().add(V(0, 0, -0.024)));
  const tr = dog.tail[0].getWorldPosition(new THREE.Vector3());
  mesh(tubeGeo([tk, tk.clone().lerp(tr, 0.5).add(V(0, 0.01, -0.01)), tr], 0.004, 16), M.copper, root);
  anchor('cxTail', root, tk.clone().add(V(0, 0.02, -0.026)));

  // ---- coolant loop along the floor, with its pump
  mesh(tubeGeo([V(-0.28, Y0 + 0.012, -0.06), V(0.2, Y0 + 0.012, -0.06), V(0.22, Y0 + 0.012, 0.06), V(-0.28, Y0 + 0.012, 0.06)], 0.005, 40), coolant, root);
  mesh(rbox(0.04, 0.03, 0.035, 0.006), M.gun, root, V(0.2, Y0 + 0.02, -0.03));

  root.visible = false;
  return {
    root,
    update(on, t) {
      root.visible = on;
      if (!on) return;
      // gears follow the joints they drive (30:1 shows as 3:1 so the motion reads)
      drives.forEach((d) => { const a = (d.L.hip.rotation.z - d.rest) * 3; d.ring.rotation.z = a * d.s; d.pin.rotation.z = -a * d.s * 3.3; });
      neckGear.rotation.z = dog.jaw.rotation.z * 5;
      tailGear.rotation.z = (dog.tail[0].rotation.z + dog.tail[0].rotation.x) * 4;
      leds[0].material.emissiveIntensity = 1.4 + Math.sin(t * 6) * 0.9;
    },
  };
}

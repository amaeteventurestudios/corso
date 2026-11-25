// The eye and ear cutaways. The code-built eye and ear in dog.js are small and don't sit exactly where the painted
// ones are, so these two close-ups get their own mechanisms, built to the painted eye's and ear's size and placed on
// them (positions read off the owner's pictures through the scan, in the rig frame of the standing dog).
// Eye: a window opens over the painted eye, a machined socket shows behind it, and the camera module slides out and
// up along a line, layer by layer, growing as it comes so each layer reads.
// Ear: the near half of the painted ear is cut away down its middle (a half section), showing the frame, sound horn,
// microphone and the pivot drive in the skull; the moving parts then step out a little so each one reads.
import * as THREE from 'three';
import { ringGeo, discGeo, domeGeo, gearGeo, tubeGeo, slabGeo, rbox, V } from './geo.js';

// read off the scan (rig frame): the painted eye's surface and its facing, the painted ear's base and tip
const EYE = { p: V(0.604, 0.748, -0.068), n: V(0.7, 0.04, -0.62).normalize(), out: V(0.75, 0.42, -0.55).normalize() };
const EAR = { base: V(0.494, 0.778, -0.064), tip: V(0.5, 0.858, -0.059), out: V(0.08, 0, -1).normalize() };

const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const span = (k, a, b) => ease((k - a) / (b - a));

export function buildCutMods(dog) {
  const M = dog.M;
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.02 });
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe9ee, roughness: 0.03, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  const sockMat = new THREE.MeshStandardMaterial({ color: 0x2a2b2f, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a650, metalness: 1, roughness: 0.3 });
  const sensorMat = new THREE.MeshPhysicalMaterial({ color: 0x3b2f5c, metalness: 0.6, roughness: 0.15, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6 });
  const head = dog.head;
  const toHead = (worldPt) => head.worldToLocal(worldPt.clone());
  const dirToHead = (d) => { const q = new THREE.Quaternion(); head.getWorldQuaternion(q); return d.clone().applyQuaternion(q.invert()).normalize(); };
  const hs = head.scale.x;
  const mesh = (g, m, parent, p, r) => { const o = new THREE.Mesh(g, m); if (p) o.position.copy(p); if (r) o.rotation.set(...r); parent.add(o); return o; };
  const anchor = (name, parent, p) => { const a = new THREE.Object3D(); a.position.copy(p); parent.add(a); dog.anchors[name] = a; return a; };

  // ------------------------------------------------------------------ eye
  const eye = new THREE.Group(); head.add(eye);
  eye.position.copy(toHead(EYE.p));
  eye.quaternion.setFromUnitVectors(V(0, 0, 1), dirToHead(EYE.n));
  eye.scale.setScalar(1 / hs);
  // the socket stays in the head: a machined cup with a copper lip and four bolts
  const sock = new THREE.Group(); eye.add(sock);
  mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.034, 40, 1, true), sockMat, sock, V(0, 0, -0.017), [Math.PI / 2, 0, 0]);
  mesh(discGeo(0.021, 0.003), M.dark, sock, V(0, 0, -0.033));
  mesh(ringGeo(0.0245, 0.0295, 0.004), M.copper, sock, V(0, 0, -0.001));
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.003, 6), M.steel, sock, V(Math.cos(a) * 0.027, Math.sin(a) * 0.027, 0.0012), [Math.PI / 2, 0, 0]); }
  // a cable from the back of the socket into the head
  mesh(tubeGeo([V(0, -0.006, -0.03), V(0, -0.012, -0.045), V(-0.01, -0.02, -0.06)], 0.0025, 12), M.copper, sock);
  // the stack: comes out along `out` (up and forward from the eye), growing as it comes
  const stack = new THREE.Group(); eye.add(stack);
  const outL = EYE.out.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), EYE.n).invert()).normalize();
  const layers = [];
  const layer = (dist, z0, delay) => { const g = new THREE.Group(); g.position.set(0, 0, z0); stack.add(g); layers.push({ g, dist, z0, delay }); return g; };
  // 1 image board (deepest)
  const Lb = layer(0.03, -0.026, 0.0);
  mesh(rbox(0.03, 0.03, 0.003, 0.0012), M.pcb, Lb);
  mesh(rbox(0.014, 0.014, 0.0022, 0.0006), M.chip, Lb, V(0, 0, 0.0022));
  mesh(rbox(0.009, 0.009, 0.0008, 0.0002), sensorMat, Lb, V(0, 0, 0.0036));
  for (let k = 0; k < 8; k++) mesh(rbox(0.0016, 0.003, 0.0006, 0.0002), gold, Lb, V(-0.0105 + k * 0.003, -0.0135, 0.0016));
  for (let k = 0; k < 4; k++) mesh(rbox(0.003, 0.0018, 0.0016, 0.0004), M.dark, Lb, V(0.011, -0.006 + k * 0.004, 0.0018));
  const ribbon = mesh(rbox(0.012, 0.022, 0.0006, 0.0002), M.copperB, Lb, V(0, -0.024, -0.001));
  anchor('mEyeBoard', Lb, V(0.008, 0.008, 0.004));
  // 2 rear lens group in its holder
  const Lr = layer(0.06, -0.016, 0.06);
  mesh(ringGeo(0.0105, 0.0135, 0.004), M.gun, Lr);
  mesh(discGeo(0.0106, 0.003, 32, 0.0025), lensMat, Lr, V(0, 0, 0.0005));
  // 3 focus barrel: gunmetal tube, toothed copper focus ring, a small motor with its pinion
  const Lf = layer(0.092, -0.008, 0.12);
  mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.014, 36, 1, true), sockMat, Lf, V(0, 0, 0), [Math.PI / 2, 0, 0]);
  const fring = mesh(gearGeo(0.0175, 36, 0.005, 0.7), M.copper, Lf, V(0, 0, 0.001));
  const motor = mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, 18), M.steel, Lf, V(0.0225, 0, -0.004), [Math.PI / 2, 0, 0]);
  const pin = mesh(gearGeo(0.0052, 9, 0.004), M.copperB, Lf, V(0.0225, 0, 0.004));
  anchor('mEyeFocus', Lf, V(-0.016, 0.006, 0.002));
  // 4 front lens
  const Ll = layer(0.124, 0.0, 0.18);
  mesh(ringGeo(0.0115, 0.0145, 0.004), M.steel, Ll);
  mesh(discGeo(0.0116, 0.003, 32, 0.004), lensMat, Ll, V(0, 0, 0.0005));
  anchor('mEyeLens', Ll, V(0.006, -0.006, 0.004));
  // 5 iris: seven blades round an amber ring, the pupil open in the middle
  const Li = layer(0.156, 0.004, 0.24);
  mesh(ringGeo(0.0045, 0.0145, 0.0022), M.iris, Li);
  const blades = new THREE.Group(); Li.add(blades);
  for (let k = 0; k < 7; k++) {
    const b = mesh(slabGeo([[0, 0], [0.009, -0.002], [0.011, 0.003], [0.002, 0.004]], 0.0008, 0.0002), M.gun, blades, V(0, 0, 0.0016));
    b.rotation.z = (k / 7) * Math.PI * 2; b.position.x = Math.cos(b.rotation.z) * 0.0045; b.position.y = Math.sin(b.rotation.z) * 0.0045;
  }
  anchor('mEyeIris', Li, V(0.0, 0.011, 0.002));
  // 6 glass dome in its copper bezel
  const Ld = layer(0.19, 0.006, 0.3);
  mesh(ringGeo(0.0165, 0.0195, 0.0035), M.copper, Ld);
  mesh(domeGeo(0.0168, 0.01), domeMat, Ld, V(0, 0, 0.001));
  anchor('mEyeDome', Ld, V(0.004, 0.012, 0.009));
  // the camera's aim: the middle of the stack once it is out
  const eyeView = anchor('mEyeView', eye, V());
  // where the window opens
  const eyeCut = anchor('mEyeCut', eye, V(0, 0, -0.004));

  // ------------------------------------------------------------------ ear
  const ear = new THREE.Group(); head.add(ear);
  ear.position.copy(toHead(EAR.base));
  {
    // y up the ear (base to tip), z out of the near side of the head
    const y = dirToHead(EAR.tip.clone().sub(EAR.base));
    const zr = dirToHead(EAR.out); const x = new THREE.Vector3().crossVectors(y, zr).normalize(); const z = new THREE.Vector3().crossVectors(x, y);
    ear.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  ear.scale.setScalar(1 / hs);
  const H = EAR.tip.distanceTo(EAR.base); // about 8 cm
  const eparts = [];
  const epart = (dist, delay) => { const g = new THREE.Group(); ear.add(g); eparts.push({ g, dist, delay }); return g; };
  // frame: a copper triangle with two cross ribs, standing in the middle of the ear
  const Ef = epart(V(0, 0, 0.02), 0);
  {
    const tri = [[-0.024, 0.004], [0.022, 0.004], [0.001, H * 0.8]];
    const s = new THREE.Shape(tri.map(([a, b]) => new THREE.Vector2(a, b)));
    const c = [0, 1, 2].map((i) => tri[i]).reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]);
    s.holes.push(new THREE.Path(tri.map(([a, b]) => new THREE.Vector2(c[0] + (a - c[0]) * 0.72, c[1] + (b - c[1]) * 0.72)).reverse()));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
    g.translate(0, 0, -0.0015);
    mesh(g, M.copper, Ef);
    for (const f of [0.35, 0.62]) { const w = (1 - f) * 0.046 * 0.85; mesh(rbox(w, 0.0025, 0.0025, 0.0008), M.copperB, Ef, V(-0.001, H * 0.8 * f, 0)); }
    // the smoked membrane on the far side of the frame
    mesh(slabGeo(tri.map(([a, b]) => [c[0] + (a - c[0]) * 0.74, c[1] + (b - c[1]) * 0.74]), 0.0015, 0.0004), M.smoke, Ef, V(0, 0, -0.004));
  }
  anchor('mEarFrame', Ef, V(-0.013, H * 0.55, 0.002));
  anchor('mEarMemb', Ef, V(0.008, H * 0.7, -0.004));
  // sound horn and microphone: a flared copper bell facing out, the capsule behind it, the lead running down
  const Eh = epart(V(-0.075, 0.075, 0.06), 0.1);
  {
    const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.0035 + 0.0115 * t * t, t * 0.018)); }
    const bell = new THREE.LatheGeometry(prof, 32); bell.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(bell, new THREE.MeshStandardMaterial({ color: 0xd7743a, metalness: 0.85, roughness: 0.28, side: THREE.DoubleSide }));
    m.position.set(0, H * 0.36, -0.004); Eh.add(m);
    mesh(ringGeo(0.0128, 0.0152, 0.002), M.copperB, Eh, V(0, H * 0.36, 0.0146));
    mesh(discGeo(0.0128, 0.0008), M.steel, Eh, V(0, H * 0.36, 0.0142));
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (i * i + j * j <= 5) mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0016, 8), M.dark, Eh, V(i * 0.0042, H * 0.36 + j * 0.0042, 0.0153), [Math.PI / 2, 0, 0]);
  }
  anchor('mEarHorn', Eh, V(0.011, H * 0.36 + 0.009, 0.015));
  const Em = epart(V(0.075, 0.045, 0.05), 0.18);
  mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 20), M.steel, Em, V(0, H * 0.36, -0.006), [Math.PI / 2, 0, 0]);
  mesh(rbox(0.012, 0.016, 0.0015, 0.0005), M.pcb, Em, V(0, H * 0.36, -0.0115));
  mesh(tubeGeo([V(0.003, H * 0.36 - 0.008, -0.011), V(0.006, H * 0.18, -0.008), V(0.01, 0.002, -0.006), V(0.014, -0.02, -0.006)], 0.0012, 16), M.copperB, Em);
  anchor('mEarMic', Em, V(-0.004, H * 0.36 - 0.006, -0.006));
  // pivot in the skull: a ring gear round the ear's root, driven by a small motor and pinion
  const Ep = epart(V(-0.065, -0.05, 0.05), 0.26);
  {
    const ring = mesh(gearGeo(0.022, 32, 0.005, 0.72), M.steel, Ep, V(0, -0.004, 0), [Math.PI / 2, 0, 0]);
    mesh(ringGeo(0.0145, 0.018, 0.007), M.gun, Ep, V(0, -0.004, 0), [Math.PI / 2, 0, 0]);
    const pin = mesh(gearGeo(0.0075, 10, 0.005), M.copper, Ep, V(0.0285, -0.004, 0.006), [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.022, 20), M.gun, Ep, V(0.0285, -0.018, 0.006));
    mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.004, 20), M.copper, Ep, V(0.0285, -0.028, 0.006));
    Ep.userData.spin = [ring, pin];
  }
  anchor('mEarPivot', Ep, V(-0.016, -0.004, 0.008));
  anchor('mEarMotor', Ep, V(0.0335, -0.02, 0.012));
  const earView = anchor('mEarView', ear, V(0, H * 0.45, 0.03));
  const earA = anchor('mEarCutA', ear, V(0, -0.012, 0)), earB = anchor('mEarCutB', ear, V(0, H + 0.01, 0));

  eye.visible = false; ear.visible = false;
  const cutOut = new THREE.Vector3(), tq = new THREE.Quaternion();
  return {
    eye, ear,
    /** k: how far the section is open (0..1), t: seconds, for the turning parts */
    update(kEye, kEar, t, active) {
      eye.visible = kEye > 0.001 && active;
      ear.visible = kEar > 0.001 && active;
      if (eye.visible) {
        const grow = 1 + 0.6 * span(kEye, 0.3, 1);
        stack.scale.setScalar(grow);
        layers.forEach((L) => {
          const u = span(kEye, 0.25 + L.delay, 0.62 + L.delay);
          L.g.position.set(0, 0, L.z0).addScaledVector(outL, L.dist * 0.82 * u);
        });
        fring.rotation.z = t * 0.6; pin.rotation.z = -t * 0.6 * 36 / 9; blades.rotation.z = 0.25 * Math.sin(t * 0.8);
        eyeView.position.copy(outL).multiplyScalar(0.07 * grow * span(kEye, 0.25, 0.9));
      }
      if (ear.visible) {
        eparts.forEach((P) => { P.g.position.copy(P.dist).multiplyScalar(span(kEar, 0.35 + P.delay, 0.75 + P.delay)); });
        const [ring, pin] = Ep.userData.spin; ring.rotation.y = 0.3 * Math.sin(t * 0.7); pin.rotation.y = -0.3 * Math.sin(t * 0.7) * 32 / 10;
      }
    },
    /** the cut for each section: capsule ends, radius, the side it opens on and where the cut plane sits */
    cut(which, A, B, S) {
      if (which === 'eye') {
        dog.anchors.mEyeCut.getWorldPosition(A); B.copy(A);
        eye.getWorldQuaternion(tq); S.set(0, 0, 1).applyQuaternion(tq);
        return { r: 0.03, off: -0.35 };
      }
      earA.getWorldPosition(A); earB.getWorldPosition(B);
      ear.getWorldQuaternion(tq); S.set(0, 0, 1).applyQuaternion(tq);
      return { r: 0.042, off: 0.0 };
    },
  };
}

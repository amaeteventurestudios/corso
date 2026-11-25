// Aja's skin: the owner's own pictures of the dog, painted onto a 3D body.
// The body was made from the owner's front, back, left and right views (Hunyuan3D-2mv on their own machine, used as a
// tool), lined up in Blender, and each vertex was given a weight for each of the six views it can see (scan/aja.bin).
// Here it becomes a skinned mesh that follows the code-built rig in dog.js, so it walks, runs and opens its jaw.
import * as THREE from 'three';

// scan frame (metres, head +x, y up, ground 0) -> rig frame
export const SCAN = { sc: 1.1, ox: 0.02, oy: 0, oz: 0 };

// Joints read off the owner's right-side view (pixels in right.png), leg z from the body itself (scan units).
const RIGHT = { u: [1140.964, 825.0], v: [-1117.949, 892.0] };
export const JOINTS = {
  front: { hip: [1040, 440], knee: [1000, 545], ankle: [1060, 770], paw: [1070, 832], z: 0.155 },
  // hind: the robot's leg is one rigid plate from the hip disc to the hock disc, then the cannon down to the paw joint.
  // So the chain bends only at the real joints: hip disc, hock (the 'knee' node, bending back) and the paw.
  hind: { hip: [440, 500], knee: [300, 652], ankle: [270, 808], paw: [266, 828], z: 0.148, rigidAnkle: true },
  hinge: [1365, 245], mouth: [1500, 262], neck: [1300, 215], chest: [1120, 360], rump: [330, 330],
};
/** right-view pixel -> rig frame (x, y) */
export function pxRig([px, py]) {
  const x = (px - RIGHT.u[1]) / RIGHT.u[0], y = (py - RIGHT.v[1]) / RIGHT.v[0];
  return new THREE.Vector3(x * SCAN.sc + SCAN.ox, y * SCAN.sc + SCAN.oy, 0);
}
/** Move the code rig's joints onto the painted body, so the skin binds to a rig that has its shape. */
export function fitRig(dog) {
  dog.legs.forEach((L) => {
    const J = L.front ? JOINTS.front : JOINTS.hind;
    const z = L.s * J.z * SCAN.sc;
    const [h, k, a, p] = ['hip', 'knee', 'ankle', 'paw'].map((n) => pxRig(J[n]).setZ(z));
    L.H = h.clone(); L.hip.position.copy(h);
    L.L1 = h.distanceTo(k); L.L2 = k.distanceTo(a); L.L3 = a.distanceTo(p);
    L.knee.position.set(0, -L.L1, 0); L.ankle.position.set(0, -L.L2, 0); L.paw.position.set(0, -L.L3, 0);
    L.footX = p.x; L.footY = p.y; L.pA0 = Math.atan2(p.x - a.x, a.y - p.y);
    L.bendBack = true; L.rigidAnkle = !!J.rigidAnkle; // both knees (the front elbow and the hind hock) sit behind the line from hip to paw
  });
  // head: scale the code head so its jaw hinge and mouth sit on the painted ones
  const H = pxRig(JOINTS.hinge), N = pxRig(JOINTS.mouth);
  const JP = dog.jaw.position.clone();             // hinge in head space
  const front = new THREE.Vector3(0.27, JP.y, 0);  // front of the code mouth in head space
  const k = H.distanceTo(N) / front.distanceTo(JP);
  const rz = -0.07, ang = Math.atan2(N.y - H.y, N.x - H.x);
  dog.head.scale.setScalar(k);
  dog.head.userData.rest = rz;
  dog.head.userData.tilt = ang;                    // the painted mouth line's slope
  const off = JP.clone().multiplyScalar(k).applyAxisAngle(new THREE.Vector3(0, 0, 1), rz);
  dog.head.position.copy(H).sub(off);
  // tail root
  dog.tail[0].position.copy(pxRig([190, 268]));
}

export async function loadScan(base = './scan/') {
  const [meta, buf] = await Promise.all([
    fetch(base + 'aja.json').then((r) => r.json()),
    fetch(base + 'aja.bin').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      // some hosts won't serve .bin: fall back to the same bytes as base64 text
      .catch(() => fetch(base + 'aja.b64.txt').then((r) => r.text()).then((t) => Uint8Array.from(atob(t.trim()), (ch) => ch.charCodeAt(0)).buffer)),
  ]);
  const nv = meta.nv, ni = meta.ni;
  let o = 0;
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const w = new Uint8Array(buf, o, nv * 6); o += nv * 6;
  const idx = new Uint32Array(buf.slice(o, o + ni * 4));
  const tex = await new THREE.TextureLoader().loadAsync(base + 'atlas.jpg');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.flipY = false;
  return { meta, pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), w: Uint8Array.from(w), idx, tex };
}

const clampY = (y) => Math.min(1, Math.max(0, 1 - y / 0.8));
/** right-view pixel of a scan-frame point (for the jaw cut) */
function rightPx(meta, x, y) { const m = meta.map.right; return [m.u[0] * x + m.u[1], m.v[0] * y + m.v[1]]; }

export function buildSkin(data, dog) {
  const { meta, pos, nrm, w, idx, tex } = data;
  const nv = meta.nv;
  const { sc, ox, oy, oz } = SCAN;
  // ---- jaw: under the mouth line in the side view (owner's right view, pixels)
  const isJaw = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    const [px, py] = rightPx(meta, pos[i * 3], pos[i * 3 + 1]);
    if (px < 1376 || py > 305) continue;
    const line = 247 + (px - 1376) * (268 - 247) / (1515 - 1376);
    if (py > line && Math.abs(pos[i * 3 + 2]) < 0.1) isJaw[i] = 1;
  }
  // drop the triangles that straddle the mouth line, so the jaw can open cleanly
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = isJaw[idx[t]], b = isJaw[idx[t + 1]], c = isJaw[idx[t + 2]];
    if (a === b && b === c) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  // ---- positions into the rig frame
  const P = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { P[i * 3] = pos[i * 3] * sc + ox; P[i * 3 + 1] = pos[i * 3 + 1] * sc + oy; P[i * 3 + 2] = pos[i * 3 + 2] * sc + oz; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('w0', new THREE.BufferAttribute(new Uint8Array(nv * 4).map((_, k) => w[(k >> 2) * 6 + (k & 3)]), 4, true));
  g.setAttribute('w1', new THREE.BufferAttribute(new Uint8Array(nv * 2).map((_, k) => w[(k >> 1) * 6 + 4 + (k & 1)]), 2, true));
  g.setIndex(Array.from(idx));

  // ---- bones: one per rig node, each with a capsule (in world space, at the bind pose)
  dog.root.updateMatrixWorld(true);
  const wp = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
  const B = []; // {node, a, b, r}
  const add = (node, a, b, r, tag) => { B.push({ node, a, b, r, tag }); return B.length - 1; };
  add(dog.inner, pxRig(JOINTS.rump), pxRig(JOINTS.chest), 0.15, 'body');
  add(dog.inner, pxRig(JOINTS.chest), pxRig(JOINTS.neck).lerp(pxRig(JOINTS.chest), 0.35), 0.1, 'body');
  const headI = add(dog.head, pxRig(JOINTS.neck), pxRig(JOINTS.mouth), 0.08, 'head');
  const jawI = add(dog.jaw, wp(dog.jaw), pxRig(JOINTS.mouth), 0.04, 'jaw');
  dog.legs.forEach((L) => {
    const n0 = B.length;
    add(L.hip, wp(L.hip), wp(L.knee), L.front ? 0.075 : 0.105, 'leg');
    add(L.knee, wp(L.knee), wp(L.ankle), 0.05, 'leg');
    add(L.ankle, wp(L.ankle), wp(L.paw), 0.045, 'leg');
    add(L.paw, wp(L.paw), wp(L.paw, 0.07, -0.02), 0.045, 'paw');
    for (let k = n0; k < B.length; k++) B[k].leg = L.key;
  });
  dog.tail.forEach((s, i) => add(s, wp(s), wp(s, 0, 0.05), 0.035, 'tail'));

  const segD = (p, a, b) => {
    const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const legOf = new Uint8Array(nv); // 1..4 when a point hangs mostly from one leg
  const p = new THREE.Vector3();
  const sc4 = [];
  for (let i = 0; i < nv; i++) {
    p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (isJaw[i]) { si[i * 4] = jawI; sw[i * 4] = 1; continue; }
    sc4.length = 0;
    // which leg (if any) this point hangs from: below a line through the shoulder and hip discs, front or hind, near or far
    const [px, py] = rightPx(meta, pos[i * 3], pos[i * 3 + 1]);
    const legZone = px < 600 ? 'hind' : px > 900 ? 'front' : null;
    // the shoulder or hip disc turns with the leg; the plate around it stays on the body; the leg runs on from the disc.
    // A machine: every point belongs to one part (no soft blend), so plates turn at their joints and never stretch.
    let below = 0; // 0 = body, 1 = leg
    if (legZone) {
      const J = legZone === 'front' ? JOINTS.front : JOINTS.hind;
      const [hx, hy] = J.hip, [kx, ky] = J.knee;
      const R = legZone === 'front' ? 58 : 65;
      const dl = Math.hypot(kx - hx, ky - hy), t = ((px - hx) * (kx - hx) + (py - hy) * (ky - hy)) / dl;
      const inDisc = Math.hypot(px - hx, py - hy) < R;
      below = inDisc || t > R - 4 || py > (legZone === 'front' ? 540 : 615) ? 1 : 0;
    }
    const legKey = legZone ? (legZone === 'front' ? 'F' : 'H') + (p.z < 0 ? 'L' : 'R') : '';
    if (below > 0.5) legOf[i] = { FL: 1, FR: 2, HL: 3, HR: 4 }[legKey];
    for (let k = 0; k < B.length; k++) {
      const b = B[k]; if (b.tag === 'jaw') continue;
      const isLeg = b.tag === 'leg' || b.tag === 'paw';
      if (isLeg && b.leg !== legKey) continue;
      if (isLeg && below <= 0) continue;
      if (!isLeg && below >= 1) continue;
      const d = Math.max(0, segD(p, b.a, b.b) - b.r);
      sc4.push([k, (isLeg ? below : 1 - below) / Math.pow(d + 0.012, 6)]);
    }
    while (sc4.length < 3) sc4.push([0, 0]);
    sc4.sort((x, y) => y[1] - x[1]);
    let tot = 0; for (let k = 0; k < 3; k++) tot += sc4[k][1];
    if (legZone && below) { // leg parts are rigid: the nearest bone of this leg (by its centre line) takes the point
      let bk = sc4[0][0], bd = 1e9;
      for (let k = 0; k < B.length; k++) {
        const b = B[k]; if (b.leg !== legKey) continue;
        const d = segD(p, b.a, b.b); if (d < bd) { bd = d; bk = k; }
      }
      si[i * 4] = bk; sw[i * 4] = 1; si[i * 4 + 1] = si[i * 4 + 2] = 0; sw[i * 4 + 1] = sw[i * 4 + 2] = 0; continue;
    }
    for (let k = 0; k < 3; k++) { si[i * 4 + k] = sc4[k][0]; sw[i * 4 + k] = sc4[k][1] / tot; }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  // ---- teardown: cut the painted shell into plates (a grid of cells over the surface), each with its own flight
  const ng = g.toNonIndexed();
  // the mouth line: each triangle goes wholly to the jaw or wholly to the head, so the jaw opens with no gap or stretch
  {
    const SI = ng.attributes.skinIndex, SW = ng.attributes.skinWeight;
    for (let t = 0; t < idx.length / 3; t++) {
      const n = isJaw[idx[t * 3]] + isJaw[idx[t * 3 + 1]] + isJaw[idx[t * 3 + 2]];
      if (n === 0 || n === 3) continue;
      for (let j = 0; j < 3; j++) {
        const v = t * 3 + j, jaw = n >= 2;
        if (jaw) { SI.setXYZW(v, jawI, 0, 0, 0); SW.setXYZW(v, 1, 0, 0, 0); }
        else if (isJaw[idx[v]]) { SI.setXYZW(v, headI, 0, 0, 0); SW.setXYZW(v, 1, 0, 0, 0); }
      }
    }
  }
  // the scan joins the near and far legs with thin webs where they touch in the pictures: drop those triangles
  // (collapse them to a point) so the legs swing apart cleanly
  {
    const PA = ng.attributes.position, NA = ng.attributes.normal, SI = ng.attributes.skinIndex, SW = ng.attributes.skinWeight;
    for (let t = 0; t < idx.length / 3; t++) {
      const k = [legOf[idx[t * 3]], legOf[idx[t * 3 + 1]], legOf[idx[t * 3 + 2]]].filter(Boolean);
      if (k.length < 2 || k.every((x) => x === k[0])) continue;
      for (let j = 1; j < 3; j++) {
        const v = t * 3 + j, v0 = t * 3;
        PA.setXYZ(v, PA.getX(v0), PA.getY(v0), PA.getZ(v0)); NA.setXYZ(v, NA.getX(v0), NA.getY(v0), NA.getZ(v0));
        SI.setXYZW(v, SI.getX(v0), SI.getY(v0), SI.getZ(v0), SI.getW(v0)); SW.setXYZW(v, SW.getX(v0), SW.getY(v0), SW.getZ(v0), SW.getW(v0));
      }
    }
  }
  const NP = ng.attributes.position, nt = NP.count / 3;
  const CELL = 0.085;
  const cellOf = new Map(); const exOff = new Float32Array(NP.count * 3), exDel = new Float32Array(NP.count);
  const c = new THREE.Vector3(), q = new THREE.Vector3();
  const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const cen = new THREE.Vector3(0.0, 0.42, 0);
  for (let t = 0; t < nt; t++) {
    c.set(0, 0, 0);
    for (let j = 0; j < 3; j++) c.add(q.fromBufferAttribute(NP, t * 3 + j));
    c.multiplyScalar(1 / 3);
    // the jaw is its own piece
    const jaw = ng.attributes.skinIndex.getX(t * 3) === jawI && ng.attributes.skinWeight.getX(t * 3) > 0.99;
    const key = jaw ? 'jaw' : `${Math.floor(c.x / CELL)},${Math.floor(c.y / CELL)},${Math.floor(c.z / CELL)}`;
    let e = cellOf.get(key);
    if (!e) {
      const k = cellOf.size + 1;
      const cc = jaw ? c.clone() : new THREE.Vector3((Math.floor(c.x / CELL) + 0.5) * CELL, (Math.floor(c.y / CELL) + 0.5) * CELL, (Math.floor(c.z / CELL) + 0.5) * CELL);
      const dir = cc.clone().sub(cen); dir.y *= 0.8; dir.normalize();
      const dist = 0.35 + 0.75 * rnd(k);
      const off = dir.multiplyScalar(dist).add(new THREE.Vector3((rnd(k + 9) - 0.5) * 0.25, 0.15 + 0.35 * rnd(k + 3), (rnd(k + 5) - 0.5) * 0.25));
      e = { off, del: 0.05 + 0.3 * rnd(k + 7) + 0.12 * clampY(cc.y) };
      cellOf.set(key, e);
    }
    for (let j = 0; j < 3; j++) { const v = t * 3 + j; exOff[v * 3] = e.off.x; exOff[v * 3 + 1] = e.off.y; exOff[v * 3 + 2] = e.off.z; exDel[v] = e.del; }
  }
  ng.setAttribute('aEx', new THREE.BufferAttribute(exOff, 3));
  ng.setAttribute('aDel', new THREE.BufferAttribute(exDel, 1));

  // ---- projection uniforms: atlas uv = (PU . (scanPos,1), PV . (scanPos,1)), scanPos = (rigPos - o) / sc
  const [IW, IH] = meta.img;
  const PU = [], PV = [];
  meta.views.forEach((n, k) => {
    const m = meta.map[n], col = k % 2, row = Math.floor(k / 2);
    const u = new THREE.Vector4(), v = new THREE.Vector4();
    const off = [ox, oy, oz];
    // u_atlas = (col + px / IW) / 2, px = ku * (P[iu] - off) / sc + cu
    const ku = m.u[0] / sc / IW / 2, kv = m.v[0] / sc / IH / 3;
    u.setComponent(m.iu, ku); u.w = (col + (m.u[1] - m.u[0] * off[m.iu] / sc) / IW) / 2;
    v.setComponent(m.iv, kv); v.w = (row + (m.v[1] - m.v[0] * off[m.iv] / sc) / IH) / 3;
    PU.push(u); PV.push(v);
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: tex }, PU: { value: PU }, PV: { value: PV },
      lightDir: { value: new THREE.Vector3(0.4, 0.8, -0.45).normalize() }, ghost: { value: 1 }, gain: { value: 1.0 }, explode: { value: 0 },
      // the cutaway: a capsule (A to B, radius R) cut out of the shell, only on the side that faces `side`
      cutA: { value: new THREE.Vector3() }, cutB: { value: new THREE.Vector3() }, cutR: { value: 0 }, cutSide: { value: new THREE.Vector3() }, cutOff: { value: -0.25 },
    },
    transparent: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      attribute vec4 w0; attribute vec2 w1; attribute vec3 aEx; attribute float aDel; uniform float explode;
      varying vec3 vR; varying vec4 vW0; varying vec2 vW1; varying vec3 vN; varying vec3 vP;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        float ek = clamp((explode - aDel) / 0.55, 0., 1.); ek = ek * ek * (3. - 2. * ek);
        transformed += aEx * ek;
        vR = position; vW0 = w0; vW1 = w1;
        vN = normalize(mat3(modelMatrix) * objectNormal);
        vP = (modelMatrix * vec4(transformed, 1.)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D atlas; uniform vec4 PU[6]; uniform vec4 PV[6]; uniform vec3 lightDir; uniform float ghost; uniform float gain;
      uniform vec3 cutA; uniform vec3 cutB; uniform float cutR; uniform vec3 cutSide; uniform float cutOff;
      varying vec3 vR; varying vec4 vW0; varying vec2 vW1; varying vec3 vN; varying vec3 vP;
      vec3 tap(int k) { vec4 q = vec4(vR, 1.); return texture2D(atlas, vec2(dot(PU[k], q), dot(PV[k], q))).rgb; }
      void main() {
        // cutaway
        float rim = 0.;
        if (cutR > 0.) {
          vec3 ab = cutB - cutA; float h = clamp(dot(vP - cutA, ab) / max(dot(ab, ab), 1e-6), 0., 1.);
          vec3 q = cutA + ab * h; float d = length(vP - q);
          // cutOff: where the cut plane sits along cutSide, as a share of the radius (0 = through the axis: a half section)
          float sd = dot(vP - q, cutSide) - cutOff * cutR;
          float onSide = dot(cutSide, cutSide) < 0.25 ? 1. : step(0., sd);
          if (onSide > 0.5 && d < cutR) discard;
          rim = onSide * (1. - smoothstep(cutR, cutR + 0.007, d));
          // a half section also gets a copper line along the cut face
          if (dot(cutSide, cutSide) > 0.25 && d < cutR) rim = max(rim, 1. - smoothstep(-0.006, 0., sd));
        }
        float w[6]; w[0] = vW0.x; w[1] = vW0.y; w[2] = vW0.z; w[3] = vW0.w; w[4] = vW1.x; w[5] = vW1.y;
        vec3 c = vec3(0.); float t = 0.;
        for (int k = 0; k < 6; k++) { if (w[k] > 0.004) { c += tap(k) * w[k]; t += w[k]; } }
        c /= max(t, 1e-3);
        // parts no picture can see (the inside of the far legs): borrow the side picture rather than go black
        vec3 side = vN.z > 0. ? tap(0) : tap(1);
        c = mix(side * 0.8, c, smoothstep(0.05, 0.45, t));
        // the pictures already carry their own light: keep it, with a touch of the scene's light for the form when it moves
        float l = 0.86 + 0.22 * max(dot(normalize(vN), lightDir), 0.);
        // inside of the shell where it is cut: dark gunmetal; a copper line along the cut edge
        if (!gl_FrontFacing) c = mix(vec3(0.2, 0.19, 0.18), c * 0.42, 0.55); // the inside of the shell: the same plates, in shadow
        c = mix(c, vec3(0.78, 0.38, 0.16), rim * 0.85);
        gl_FragColor = vec4(c * l * gain, ghost);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.SkinnedMesh(ng, mat);
  mesh.userData.plates = cellOf.size;
  mesh.frustumCulled = false;
  const bones = B.map(() => new THREE.Bone());
  const inv = B.map((b) => b.node.matrixWorld.clone().invert());
  const skel = new THREE.Skeleton(bones, inv);
  mesh.bind(skel, new THREE.Matrix4());
  mesh.userData.sync = () => { B.forEach((b, k) => bones[k].matrixWorld.copy(b.node.matrixWorld)); };
  mesh.userData.bones = B;
  return mesh;
}

/** Two real eyes. The pictures' eyes don't line up between views (a painted body shows four or six of them), so the
 *  paint keeps no eyes and these sit where the front and side views agree, on the head bone. Call after fitRig. */
export function buildEyes(dog, skin) {
  const probe = new THREE.Mesh(skin.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); probe.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d'), C = 128;
  let gr = x.createRadialGradient(C, C, 10, C, C, 128);
  gr.addColorStop(0, '#2a1204'); gr.addColorStop(0.2, '#7a3008'); gr.addColorStop(0.36, '#e0761c');
  gr.addColorStop(0.62, '#ffad3d'); gr.addColorStop(0.86, '#b8500f'); gr.addColorStop(0.95, '#3a1a08'); gr.addColorStop(1, '#120a06');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { // fibres
    const a = (i / 90) * Math.PI * 2 + Math.sin(i * 7.3) * 0.03, r0 = 38 + (i % 3) * 4, r1 = 100 + (i % 5) * 5;
    x.strokeStyle = i % 2 ? 'rgba(255,210,120,0.35)' : 'rgba(90,30,0,0.35)'; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); x.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); x.stroke();
  }
  x.fillStyle = '#050403'; x.beginPath(); x.arc(C, C, 34, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(C - 22, C - 26, 11, 8, -0.5, 0, Math.PI * 2); x.fill();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const iris = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1, emissive: 0xff7a1a, emissiveIntensity: 0.3, emissiveMap: tex });
  const gun = new THREE.MeshStandardMaterial({ color: 0x6a645e, roughness: 0.3, metalness: 0.85 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xc8662e, roughness: 0.3, metalness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1 });
  dog.root.updateMatrixWorld(true);
  const k = dog.head.scale.x;
  const eyes = [];
  [1, -1].forEach((s) => {
    const p = new THREE.Vector3(0.4934, 0.684, s * 0.0467).multiplyScalar(SCAN.sc).add(new THREE.Vector3(SCAN.ox, SCAN.oy, SCAN.oz));
    const n = new THREE.Vector3(0.75, 0.06, s * 0.66).normalize();
    const g = new THREE.Group();
    const R = 0.0105;
    const socket = new THREE.Mesh(new THREE.TorusGeometry(R * 1.3, R * 0.3, 14, 40), gun);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.12, R * 0.12, 8, 40), copper);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.5, R * 1.3, R * 1.4, 32), gun); back.rotation.x = Math.PI / 2; back.position.z = -R * 0.8;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 40), iris); disc.position.z = 0.0005;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.55, 1); dome.position.z = 0.001;
    g.add(back, socket, ring, disc, dome);
    // point +z along n, then into head space
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    // sit the eye on the painted surface: cast in from outside along the eye's axis
    rc.set(p.clone().add(new THREE.Vector3(0.4, 0, 0)), new THREE.Vector3(-1, 0, 0)); // where the front picture puts the eye
    const hit = rc.intersectObject(probe, false)[0];
    g.position.copy(hit ? hit.point : p).addScaledVector(n, 0.003);
    const m = new THREE.Matrix4().compose(g.position, g.quaternion, new THREE.Vector3(1, 1, 1));
    m.premultiply(new THREE.Matrix4().copy(dog.head.matrixWorld).invert());
    m.decompose(g.position, g.quaternion, g.scale);
    dog.head.add(g); eyes.push(g);
    g.userData.k = k;
  });
  return eyes;
}

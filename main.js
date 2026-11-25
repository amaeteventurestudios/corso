// Aja M-9, the robot Cane Corso: scene, gait, sections, teardown, console.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildDog, computeExplode, BODY_Y } from './dog.js';
import { loadScan, buildSkin, fitRig, buildEyes } from './scan.js';
import { buildCutMods } from './cutmods.js';
import { buildBays } from './bays.js';
import { buildChassis } from './chassis.js';

const Q = new URLSearchParams(location.search);
const touch = matchMedia('(pointer: coarse)').matches;
const LITE = Q.has('lite') || touch;
const STILL = Q.has('still');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

// ------------------------------------------------------------------ the real numbers
const MASS = 48;            // kg, a big male Cane Corso
const G = 9.81;
const PACK_WH = 900;        // battery, watt-hours
const GAITS = {
  stand: { f: 0, duty: 1, S: 0, lift: 0, off: [0, 0.5, 0.25, 0.75], power: 45 },
  // lateral-sequence walk: hind left, fore left, hind right, fore right
  walk: { f: 1.7, duty: 0.62, S: 0.26, lift: 0.07, off: { FL: 0.25, FR: 0.75, HL: 0, HR: 0.5 }, power: 260 },
  // rotary gallop: both hinds, then both fores, with a moment in the air
  run: { f: 2.8, duty: 0.3, S: 0.34, lift: 0.13, off: { FL: 0.58, FR: 0.48, HL: 0, HR: 0.09 }, power: 1150 },
};
// jump from standing: crouch, push (fores leave first), flight, fores land, hinds land, absorb, stand. Seconds.
const JUMP = { T: 2.6, key: [0, 0.45, 0.7, 0.95, 1.22, 1.45, 2.0, 2.6],
  dy: [0, -0.1, 0.14, 0.5, 0.12, -0.08, 0, 0], pitch: [0, 0.07, 0.32, 0.04, -0.2, -0.03, 0, 0],
  air: { F: [0.5, 1.2], H: [0.7, 1.32] } };
function jumpAt(t) {
  const k = JUMP.key; let i = 0; while (i < k.length - 2 && t > k[i + 1]) i++;
  const u = smooth((t - k[i]) / (k[i + 1] - k[i]));
  return { dy: lerp(JUMP.dy[i], JUMP.dy[i + 1], u), pitch: lerp(JUMP.pitch[i], JUMP.pitch[i + 1], u) };
}
const airOf = (t, [a, b]) => clamp((t - a) / 0.09) * clamp((b - t) / 0.08);
const speedOf = (g) => (g.f ? g.S / (g.duty / g.f) : 0); // m/s: stride the foot sweeps in one stance

// ------------------------------------------------------------------ renderer
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: STILL });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
let PR = Math.min(devicePixelRatio, LITE ? 1.5 : 2);
renderer.setPixelRatio(PR);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 40);

// neutral studio light: a soft room with three white panels (warm light on a warm shell turns it skin-coloured)
{
  const pm = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x5a5a5c, side: THREE.BackSide }));
  box.position.y = 2; room.add(box);
  const panel = (w, h, p, look, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(...look); room.add(m); };
  panel(5, 3, [2.5, 5.5, -3.5], [0, 0, 0], 9);
  panel(3, 4, [-5.5, 2.5, 1.5], [0, 0, 0], 3.2);
  panel(6, 1.6, [-1, 3.5, 5.8], [0, 0, 0], 4.2);
  panel(10, 10, [0, -1.9, 0], [0, 10, 0], 0.9);
  scene.environment = pm.fromScene(room, 0.03).texture;
  scene.environmentIntensity = 0.95;
}
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 3, -2.2); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-2, 1.5, 2.5); scene.add(rim);

// ------------------------------------------------------------------ the dog
const dog = buildDog({ lite: LITE });
scene.add(dog.root);
const PARTS = dog.parts.length;
const TEETH = dog.teeth.up + dog.teeth.lo;

// soft shadows on the floor: one under the body, one under each paw, plus a moving floor for walk and run
function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,45,35,0.55)'); gr.addColorStop(0.5, 'rgba(60,45,35,0.22)'); gr.addColorStop(1, 'rgba(60,45,35,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
const BT = blobTex();
const blob = (w, d, o) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: BT, transparent: true, depthWrite: false, opacity: o })); m.rotation.x = -Math.PI / 2; m.position.y = 0.001; m.renderOrder = -1; scene.add(m); return m; };
const bodyShadow = blob(1.25, 0.55, 0.85);
const pawShadows = dog.legs.map(() => blob(0.16, 0.14, 0.9));
const floorTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(120,90,70,0.45)';
  for (let i = 0; i < 16; i++) g.fillRect(i * 32, 30, 12, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
})();
const floorLines = [];
[-0.32, 0.32].forEach((z) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.06), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false, opacity: 0, alphaMap: fadeAlpha() }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, 0.002, z); scene.add(m); floorLines.push(m);
});
function fadeAlpha() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 4; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#000'); gr.addColorStop(0.3, '#fff'); gr.addColorStop(0.7, '#fff'); gr.addColorStop(1, '#000');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 4); return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ post: ambient occlusion on desktop
let composer = null, gtao = null;
function setupComposer(w, h) {
  if (LITE || Q.has('noao')) return;
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w * PR, h * PR, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(PR);
  composer.addPass(new RenderPass(scene, camera, null, new THREE.Color(0, 0, 0), 0));
  gtao = new GTAOPass(scene, camera, w, h);
  gtao.updateGtaoMaterial({ radius: 0.06, distanceExponent: 1.4, thickness: 1, scale: 1.2, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.95;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ camera
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 0.3; controls.maxDistance = 6; controls.maxPolarAngle = Math.PI * 0.53;
controls.enablePan = false;
let userCam = false;
controls.addEventListener('start', () => { userCam = true; });
const cam = { t: new THREE.Vector3(0, 0.45, 0), az: 32, el: 10, d: 2.3, fov: 28 };
const camFrom = { ...cam, t: cam.t.clone() }, camTo = { ...cam, t: cam.t.clone() };
let camK = 1;
function camPlace(c) {
  const a = THREE.MathUtils.degToRad(c.az), e = THREE.MathUtils.degToRad(c.el);
  camera.position.set(c.t.x + c.d * Math.sin(a) * Math.cos(e), c.t.y + c.d * Math.sin(e), c.t.z - c.d * Math.cos(a) * Math.cos(e));
  controls.target.copy(c.t);
  camera.lookAt(c.t);
}
let VW = 1, VH = 1;
const portrait = () => VW / VH < 0.8;
const phoneLand = () => VH < 520 && VW / VH > 1.3;
function viewFor(v) {
  const o = { t: new THREE.Vector3(...(typeof v.t === 'function' ? v.t() : v.t)), az: v.az, el: v.el, d: v.d, fov: 28 };
  if (portrait()) { o.d *= v.pd || 1.75; o.fov = 34; o.t.y -= v.py ?? 0.02; o.t.x += v.px ?? 0.06; }
  else if (phoneLand()) { o.d *= 1.05; o.fov = 30; }
  return o;
}
const wpos = (name) => () => { dog.root.updateMatrixWorld(true); const p = new THREE.Vector3(); dog.anchors[name].getWorldPosition(p); return [p.x, p.y, p.z]; };

// ------------------------------------------------------------------ sections
const SECTIONS = [
  { id: 'overview', label: 'Overview', sub: ['48 kg (106 lb), 12 leg joints', '8 tail segments, 42 steel teeth'], gait: 'walk',
    view: { t: [0.02, 0.44, 0], az: 34, el: 8, d: 3.2, pd: 1.6 } },
  { id: 'eye', label: 'Eye', sub: ['Amber camera eyes', 'Under a heavy steel brow'], gait: 'stand', k: 'eye',
    view: { t: wpos('mEyeView'), az: 18, el: 4, d: 1.3, pd: 1.12, py: 0.0, px: 0.0 }, call: [['mEyeDome', 'Glass dome', 'sealed, wipes clean', 1], ['mEyeIris', 'Amber iris', '7 blades open and close', 1], ['mEyeFocus', 'Focus ring', 'a small motor turns it', -1], ['mEyeBoard', 'Image sensor', 'turns light into pictures', -1], ['mEyeLens', 'Front lens', 'glass, 22 mm', 1]] },
  { id: 'jaw', label: 'Jaw', sub: ['Lips peel back, jaw drops', `${TEETH} steel teeth, like a real dog`], gait: 'stand', k: 'snarl',
    view: { t: wpos('jxView'), az: 14, el: 4, d: 1.75, pd: 1.25, py: 0.0, px: 0.0 }, call: [['jxMotor', 'Jaw motor', 'turns the hinge, with a ring gear', -1], ['jxPistons', 'Jaw pistons', '2 copper pistons, one each side', 1], ['jxTeeth', `${TEETH} steel teeth`, 'on a steel rail, in rubber gums', 1], ['jxSensor', 'Bite sensor', 'feels how hard it bites', -1], ['jxFang', 'Fangs', 'steel canines, 4.4 cm', 1]] },
  { id: 'ear', label: 'Ear', sub: ['Cropped and upright', 'Copper rings inside'], gait: 'stand', k: 'ear',
    view: { t: wpos('mEarView'), az: 14, el: 12, d: 1.05, pd: 1.25, py: -0.01, px: 0.0 }, call: [['mEarHorn', 'Sound horn', 'gathers sound to the mic', 1], ['mEarPivot', 'Pivot ring', 'turns the ear to a sound', -1], ['mEarMic', 'Microphone', 'one in each ear', 1], ['mEarFrame', 'Ear frame', 'copper, cropped and upright', 1], ['mEarMotor', 'Pivot motor', 'drives the ring gear', 1]] },
  { id: 'paw', label: 'Paw', sub: ['Lifts and holds the paw', 'Rubber toes, steel claws'], gait: 'paw', k: 'paw',
    view: { t: [0.26, 0.42, -0.12], az: 40, el: 8, d: 2.8, pd: 1.6, py: 0.02, px: 0 }, call: [['shoulder', 'Shoulder drive', 'the biggest motor in the leg', -1], ['elbow', 'Elbow drive', 'folds the leg every step', -1], ['wrist', 'Wrist drive', 'keeps the paw flat', 1], ['paw', 'Toes', '4 rubber pads, steel claws', 1]] },
  { id: 'back', label: 'Back', sub: ['Copper actuators', 'Running down the spine'], gait: 'stand', k: 'back',
    view: { t: wpos('bxView'), az: 8, el: 34, d: 2.6, pd: 1.45, py: 0.0, px: 0.0 }, call: [['bxSaddle', 'Saddle plates', 'ivory steel, 2 bolts each', 1], ['bxAct', 'Spine actuators', '4 copper pistons bend the back', -1], ['bxCables', 'Cable trunk', 'power and signal, nose to tail', -1], ['bxSpine', 'Vertebrae', '12 blocks, copper discs between', 1], ['cxBox', 'Chassis box', 'the battery, board and motors sit in it', 1]] },
  { id: 'flank', label: 'Flank', sub: ['The circuit comes out', 'Board, power, battery, wiring'], gait: 'stand', k: 'flank',
    view: { t: wpos('fxView'), az: 12, el: 8, d: 2.4, pd: 1.5, py: 0.0, px: 0.0 }, call: [['fxBoard', 'Control board', 'reads 12 joints 1,000× a second', 1], ['fxBattery', 'Battery', '6 cells, 0.9 kWh', -1], ['fxPower', 'Power board', 'feeds the motors, cooled by fins', 1], ['fxPlate', 'Side plate', 'hinged along the top', 1], ['cxShoulder', 'Shoulder motor', 'geared to the front leg', -1]] },
  { id: 'hind', label: 'Hind leg', sub: ['The leg that pushes', 'Hip, stifle and hock drives'], gait: 'stand', k: 'hind',
    view: { t: [-0.34, 0.36, -0.12], az: 24, el: 8, d: 2.7, pd: 1.6, py: 0.02, px: 0 }, call: [['hipH', 'Hip drive', 'the strongest joint, it drives the push', -1], ['knee', 'Stifle drive', 'the knee, folds the leg', 1], ['hock', 'Hock drive', 'the ankle, springs each stride', -1], ['hindPaw', 'Hind paw', 'rubber pads, steel claws', 1]] },
  { id: 'tail', label: 'Tail', sub: ['8 segments', 'A servo in every joint'], gait: 'stand', k: 'tail',
    view: { t: wpos('tail'), az: 16, el: 14, d: 1.7, pd: 1.6, py: 0.02, px: 0 }, call: [['tailBoard', 'Tail boards', '3 boards read every joint', -1], ['tailServo', 'Joint servos', '8 small motors, one per segment', 1], ['tailCable', 'Signal cable', 'copper, back to the spine', -1], ['tail', 'Tail shell', '8 ivory segments', 1]] },
  { id: 'teardown', label: 'Teardown', sub: ['Every part apart', 'Turntable 360°'], gait: 'stand', k: 'ex',
    view: { t: [0, 0.5, 0], az: 30, el: 15, d: 4.1, pd: 1.6 }, call: [['cxBox', 'Chassis box', 'the steel frame everything bolts to', 1], ['cxBattery', 'Battery pack', '0.9 kWh, low in the middle', -1], ['cxHip', 'Hip motor', 'one per leg, its gear turns the leg', -1], ['cxJaw', 'Jaw cable', 'from the neck motor to the jaw', 1], ['cxSpine', 'Spine shaft', 'power to the neck and tail', 1]] },
  { id: 'walk', label: 'Walk', sub: ['Back on 4 feet', 'Walk: 1.7 strides a second'], gait: 'walk',
    view: { t: [0.0, 0.42, 0], az: 14, el: 8, d: 3.1, pd: 1.6 } },
  { id: 'run', label: 'Run', sub: ['Rotary gallop', 'All four feet leave the ground'], gait: 'run',
    view: { t: [0.0, 0.45, 0], az: 24, el: 7, d: 3.3, pd: 1.6 } },
  { id: 'jump', label: 'Jump', sub: ['Crouch, push, fly, land', 'Front paws leave first, land first'], gait: 'jump',
    view: { t: [0.0, 0.8, 0], az: 22, el: 4, d: 4.5, pd: 1.5, py: -0.05 } },
];
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const K = { eye: 0, ear: 0, paw: 0, back: 0, flank: 0, hind: 0, tail: 0, ex: 0, snarl: 0, xt: 0 };
const KDUR = { eye: 2.6, ear: 2.6, paw: 2.6, back: 2.8, flank: 2.8, hind: 2.6, tail: 2.6, ex: 3.0, snarl: 1.4, xt: 3.2 };
const st = { jumpT: 0, sec: 'overview', secT: 0, t: 0, phase: 0, amp: 1, g: { ...GAITS.walk }, gaitName: 'walk', battery: 92, bob: 0, bobV: 0, force: MASS * G, turn: 0, strideHist: [], spin: 0, pawLift: 0 };

// ------------------------------------------------------------------ UI
const chips = $('#chips'), list = $('#list');
SECTIONS.forEach((s) => {
  if (s.id !== 'overview') {
    const b = document.createElement('button'); b.className = 'chip'; b.dataset.id = s.id;
    b.innerHTML = `<i></i>${s.label}`; b.onclick = () => go(s.id, true); chips.appendChild(b);
  }
  const li = document.createElement('li'); li.dataset.id = s.id;
  li.innerHTML = `<button>${s.label}</button><div class="sub">${s.sub.map((x) => `<span>${x}</span>`).join('')}</div>`;
  li.querySelector('button').onclick = () => go(s.id, true);
  list.appendChild(li);
});
const bars = $('#loadBars');
for (let i = 0; i < 12; i++) bars.appendChild(document.createElement('i'));
const strideCv = $('#strideCv'), sctx = strideCv.getContext('2d');

function go(id, byUser) {
  if (!SEC[id]) return;
  st.sec = id; st.secT = 0; userCam = false;
  document.querySelectorAll('[data-id]').forEach((el) => el.classList.toggle('on', el.dataset.id === id));
  const v = viewFor(SEC[id].view);
  Object.assign(camFrom, { ...cam, t: cam.t.clone() });
  Object.assign(camTo, v);
  // on the turntable, start from where the camera is
  camK = 0;
  if (byUser) stopTour();
}

// ------------------------------------------------------------------ gait and pose
const tmpV = new THREE.Vector3();
function solveLeg(L, foot, pAngle, pitch) {
  // foot: target for the paw joint in the body's inner frame. pAngle: pastern angle in the world, from straight down.
  const pIn = pAngle - pitch;
  // a rigid ankle (the robot's hind cannon) is one straight bar from the hock to the paw joint
  const L2 = L.rigidAnkle ? L.L2 + L.L3 : L.L2;
  const ax = L.rigidAnkle ? foot.x : foot.x - L.L3 * Math.sin(pIn), ay = L.rigidAnkle ? foot.y : foot.y + L.L3 * Math.cos(pIn);
  const dx = ax - L.H.x, dy = ay - L.H.y;
  const D = clamp(Math.hypot(dx, dy), 0.06, L.L1 + L2 - 0.002);
  const phi = Math.atan2(dx, -dy);
  const a = Math.acos(clamp((L.L1 * L.L1 + D * D - L2 * L2) / (2 * L.L1 * D), -1, 1));
  const b = Math.acos(clamp((L.L1 * L.L1 + L2 * L2 - D * D) / (2 * L.L1 * L2), -1, 1));
  let t1, t2;
  if (L.front || L.bendBack) { t1 = phi - a; t2 = Math.PI - b; } else { t1 = phi + a; t2 = -(Math.PI - b); }
  // the hock folds at most about 65 degrees, so the cannon never swings flat behind the dog
  if (L.rigidAnkle && t2 > 1.15) { t1 += (t2 - 1.15) * 0.5; t2 = 1.15; }
  const t3 = L.rigidAnkle ? 0 : pIn - t1 - t2;
  L.hip.rotation.z = t1; L.knee.rotation.z = t2; L.ankle.rotation.z = t3;
  return { t1, t2, t3 };
}

const legState = dog.legs.map(() => ({ stance: true, load: 0, torque: [0, 0, 0], lastY: 0 }));
function pose(dt) {
  const sec = SEC[st.sec];
  const want = sec.gait === 'run' ? 'run' : sec.gait === 'walk' ? 'walk' : 'stand';
  // blend gait numbers, and fade the stride in and out
  const tgt = GAITS[want === 'stand' ? (st.gaitName === 'stand' ? 'walk' : st.gaitName) : want];
  if (want !== 'stand') st.gaitName = want;
  const ampT = want === 'stand' ? 0 : 1;
  st.amp += (ampT - st.amp) * (1 - Math.exp(-dt * 3.2));
  if (Math.abs(st.amp - ampT) < 0.002) st.amp = ampT;
  const k = 1 - Math.exp(-dt * 2.5);
  ['f', 'duty', 'S', 'lift'].forEach((n) => { st.g[n] += (tgt[n] - st.g[n]) * k; });
  for (const leg in tgt.off) st.g.off = st.g.off || {};
  const g = st.g;
  const f = Math.max(0.6, g.f);
  st.phase += f * dt;
  // running is 0 at the walk (f 1.7) and 1 at the run (f 2.8): any run left in the walk shifts the legs off their even beat and he limps
  const A = st.amp, running = clamp((g.f - GAITS.walk.f) / (GAITS.run.f - GAITS.walk.f));
  // body: bob, pitch and a little roll
  const ph = st.phase * Math.PI * 2;
  const bob = A * lerp(0.011 * Math.cos(2 * ph), 0.045 * Math.sin(ph - 0.6), running);
  // walking: the body nods twice a stride (once per front step), so both front legs carry the same; once a stride would make it limp
  const pitch = A * lerp(0.006 * Math.sin(2 * ph), 0.075 * Math.sin(ph + 0.9), running);
  const roll = A * lerp(0.018 * Math.sin(ph), 0.01 * Math.sin(ph), running);
  // jumping: the body rides the jump curve on top of the stand
  const jumping = st.jumpT > 0 || (sec.gait === 'jump' && st.amp < 0.05); // wait for the walk to settle first
  if (jumping) st.jumpT += dt;
  if (st.jumpT >= JUMP.T) st.jumpT = sec.gait === 'jump' ? st.jumpT - JUMP.T : 0;
  const J = st.jumpT > 0 ? jumpAt(st.jumpT) : { dy: 0, pitch: 0 };
  // keep the body low when the paw is lifted
  const pawK = smooth(st.pawLift);
  dog.body.position.y = BODY_Y + bob - 0.006 * pawK + J.dy;
  dog.body.rotation.set(roll, 0, pitch + 0.012 * pawK + J.pitch);
  // force on the paws: m (g + vertical acceleration of the body)
  const v = (bob + J.dy - st.bob) / Math.max(dt, 1e-3);
  const acc = (v - st.bobV) / Math.max(dt, 1e-3);
  st.bob = bob + J.dy; st.bobV = v;
  const fRaw = MASS * (G + clamp(acc, -G, 3 * G));
  st.force += (fRaw - st.force) * (1 - Math.exp(-dt * 8));
  // legs
  let nStance = 0;
  dog.legs.forEach((L, i) => {
    const off = lerp(GAITS.walk.off[L.key], GAITS.run.off[L.key], running);
    const p = frac(st.phase + off);
    const nx = L.footX ?? L.H.x + (L.front ? 0.035 : -0.012);
    let x = nx, y = L.footY ?? 0.036, pA = L.pA0 ?? (L.front ? 0.24 : 0.14), stance = true;
    if (p < g.duty) { const u = p / g.duty; x = nx + A * g.S * (0.5 - u); }
    else {
      stance = false;
      const u = (p - g.duty) / (1 - g.duty);
      x = nx + A * g.S * (-0.5 + smooth(u));
      // the hind leg folds at the hock alone, so it lifts its paw less and swings it low
      y += A * g.lift * (L.rigidAnkle ? 0.45 : 1) * Math.sin(Math.PI * u);
      pA -= A * (L.front ? 1.0 : 0.7) * Math.sin(Math.PI * Math.min(1, u * 1.2));
    }
    // the painted hind legs stand well back: keep their stride under the hip
    if (!L.front && L.footX !== undefined) x += A * (0.1 + 0.02 * running);
    // the paw section lifts the near front paw and holds it out
    if (L.key === 'FL' && pawK > 0) {
      x = lerp(x, nx + 0.1, pawK); y = lerp(y, 0.2, pawK); pA = lerp(pA, 0.6, pawK); stance = stance && pawK < 0.5;
    }
    // world foot target into the body's inner frame
    tmpV.set(x, y, L.H.z);
    dog.body.updateMatrix();
    const inv = new THREE.Matrix4().copy(dog.body.matrix).invert();
    tmpV.applyMatrix4(inv).add(new THREE.Vector3(0, BODY_Y, 0));
    // in the air the paws tuck up under the body
    const air = st.jumpT > 0 ? airOf(st.jumpT, JUMP.air[L.front ? 'F' : 'H']) : 0;
    if (air > 0) {
      const reach = L.L1 + L.L2 + L.L3;
      const tx = L.H.x + (L.front ? 0.07 : -0.06), ty = L.H.y - reach * (L.front ? 0.62 : 0.72);
      tmpV.x = lerp(tmpV.x, tx, air); tmpV.y = lerp(tmpV.y, ty, air);
      stance = false;
    }
    const ang = solveLeg(L, tmpV, pA, pitch + J.pitch);
    // keep the paw flat on the ground in stance, curled in swing
    const curl = stance ? 0 : -A * (L.front ? 0.55 : 0.3) * Math.sin(Math.PI * clamp((p - g.duty) / (1 - g.duty)));
    let pz = -(ang.t1 + ang.t2 + ang.t3) - pitch - J.pitch + curl + (L.key === 'FL' ? -0.5 * pawK : 0) - air * (L.front ? 0.8 : 0.4);
    if (L.rigidAnkle) {
      // in the air the hind paw hangs off the cannon as it was built, instead of staying flat and stretching the toes
      if (A < 0.001 && !st.jumpT) L.pawRest = pz;
      if (!stance && L.pawRest !== undefined) pz = lerp(pz, L.pawRest, 0.8 * Math.sin(Math.PI * clamp((p - g.duty) / (1 - g.duty))));
    }
    L.paw.rotation.z = pz;
    legState[i].stance = stance;
    if (stance) nStance++;
    // shadows under the paws
    const pw = new THREE.Vector3(); L.paw.getWorldPosition(pw);
    pawShadows[i].position.set(pw.x + 0.02, 0.001, pw.z);
    const h = Math.max(0, pw.y - 0.035);
    pawShadows[i].material.opacity = clamp(0.9 - h * 5) * (1 - K.ex) * (dog.root.visible ? 1 : 0);
    pawShadows[i].scale.setScalar(1 + h * 2);
    legState[i].dx = [pw.x - L.H.x, 0, 0];
  });
  // load on each joint: the stance share of the force times the lever from the joint to the paw
  if (st.jumpT > 0 && !nStance) st.force *= Math.exp(-dt * 25); // nothing on the ground, no force on the paws
  const share = nStance ? st.force / nStance : 0;
  dog.legs.forEach((L, i) => {
    const s = legState[i];
    const pw = new THREE.Vector3(); L.paw.getWorldPosition(pw);
    const jp = [L.hip, L.knee, L.ankle].map((j) => j.getWorldPosition(new THREE.Vector3()));
    s.torque = jp.map((j) => (s.stance ? share * Math.abs(j.x - pw.x) + share * 0.03 : 4 + Math.abs(j.x - pw.x) * 10));
  });
  // head counters the body, jaw opens when running (panting)
  dog.head.rotation.z = (dog.head.userData.rest ?? -0.07) - 0.05 * ease(K.snarl) - pitch * 0.6 + A * lerp(0.02 * Math.sin(2 * ph + 1), 0.05 * Math.sin(ph + 2.2), running) - 0.04 * pawK;
  dog.head.rotation.y = (st.sec === 'eye' ? 0.0 : 0) + (st.sec === 'overview' ? 0.06 * Math.sin(st.t * 0.4) : 0);
  dog.jaw.rotation.z = -0.5 * ease(K.snarl) - 0.03 * Math.max(0, Math.sin(st.t * 3)) * running * A;
  // tail: up, bouncing with the gait, a slow wag
  dog.tail.forEach((s, i) => {
    s.rotation.x = Math.sin(st.t * (2.2 + running * 3) - i * 0.5) * (0.04 + 0.06 * A) * (i / 8 + 0.3);
    if (i > 0) s.rotation.z = (i < 4 ? -0.02 : 0.05) + A * 0.06 * Math.sin(ph * (1 + running) - i * 0.6) - running * 0.09;
    else s.rotation.z = 1.15 - running * 0.35;
  });
  // ears flick, ear gears turn
  dog.ears.forEach((E, i) => {
    E.ear.rotation.x = E.base.x + (Math.sin(st.t * 0.9 + i) > 0.97 ? 0.08 : 0) - running * 0.15 * E.s;
    const turn = st.sec === 'ear' ? 1 : 0.12;
    E.gears.forEach((gr) => { gr.rotation.z += gr.userData.spin * dt * 3 * turn; });
    E.memb.rotation.y = (E.s < 0 ? -1 : 0) * 1.1 * smooth(K.ear) * -E.s;
  });
  // eye iris breathes
  dog.M.iris.emissiveIntensity = 0.55 + 0.25 * Math.sin(st.t * 2.2);
  // the flank plate swings up, the tray slides out
  dog.flankHinge.rotation.x = 1.75 * ease(K.flank);
  dog.tray.position.z = dog.tray.userData.z0 - 0.11 * ease(clamp(K.flank * 1.4 - 0.4));
  // the body shadow
  bodyShadow.position.set(-0.04, 0.001, 0);
  bodyShadow.material.opacity = 0.85 * (1 - 0.7 * K.ex) * (1 - bob * 4);
  // floor lines run under the dog at its speed
  const spd = speedOf(g) * A;
  floorTex.offset.x = (floorTex.offset.x + spd * dt / 4.5 * 3) % 1;
  floorLines.forEach((m) => { m.material.opacity += ((A > 0.05 && K.ex < 0.1 ? 0.8 : 0) - m.material.opacity) * (1 - Math.exp(-dt * 3)); });
  return { bob, pitch, spd, nStance };
}
dog.tray.userData.z0 = dog.tray.position.z;

// section amounts and per-part offsets
const eulerTmp = new THREE.Euler();
function applyParts() {
  for (const m of dog.parts) {
    const u = m.userData, r = u.rest;
    let px = r.p.x, py = r.p.y, pz = r.p.z, rx = r.r.x, ry = r.r.y, rz = r.r.z;
    for (const n in u.offs) {
      const k = K[n]; if (!k) continue;
      const o = u.offs[n];
      const kk = ease(clamp((k - (o.d || 0)) / (1 - (o.d || 0))));
      px += o.p.x * kk; py += o.p.y * kk; pz += o.p.z * kk;
      if (o.r) { rx += o.r.x * kk; ry += o.r.y * kk; rz += o.r.z * kk; }
    }
    if (K.ex > 0) {
      const e = u.ex, kk = ease(clamp((K.ex - e.d) / (1 - 0.42)));
      px += e.p.x * kk; py += e.p.y * kk; pz += e.p.z * kk;
      rx += e.r.x * kk; ry += e.r.y * kk; rz += e.r.z * kk;
      u.out = kk > 0.04;
    } else u.out = false;
    const xe = xtSec && u.xt && u.xt[xtSec];
    if (xe && K.xt > 0) {
      const kk = ease(clamp((K.xt - xe.d) / 0.55));
      px += xe.p.x * kk; py += xe.p.y * kk; pz += xe.p.z * kk;
    }
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
  }
}

// ------------------------------------------------------------------ console
const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
let uiT = 0;
function console_(dt, o) {
  const g = st.g, A = st.amp;
  const hz = g.f * (A > 0.05 ? 1 : 0) * Math.min(1, A * 1.2);
  st.strideHist.push(A > 0.05 ? Math.sin(st.phase * Math.PI * 2) * A : 0);
  if (st.strideHist.length > 120) st.strideHist.shift();
  // battery drains with the gait's power
  const P = lerp(GAITS.stand.power, lerp(GAITS.walk.power, GAITS.run.power, clamp((g.f - 1.6) / 1)), A) * (K.ex > 0.5 ? 0 : 1);
  st.battery = Math.max(5, st.battery - (P * dt / 3600) / PACK_WH * 100);
  uiT += dt; if (uiT < 0.08 && !STILL) return; uiT = 0;
  $('#vHz').textContent = fmt(hz, 1);
  $('#vF').textContent = fmt(st.force);
  $('#bF').style.width = `${clamp(st.force / (MASS * G * 3)) * 100}%`;
  $('#vB').textContent = fmt(st.battery);
  $('#bB').style.width = `${st.battery}%`;
  const all = [];
  dog.legs.forEach((L, i) => legState[i].torque.forEach((t) => all.push(t)));
  [...bars.children].forEach((b, i) => { b.style.height = `${8 + clamp(all[i] / 70) * 92}%`; b.classList.toggle('hot', all[i] > 45); });
  // stride wave
  const w = strideCv.width, h = strideCv.height;
  sctx.clearRect(0, 0, w, h); sctx.strokeStyle = '#d4583f'; sctx.lineWidth = 2 * (devicePixelRatio > 1 ? 1.5 : 1); sctx.beginPath();
  st.strideHist.forEach((y, i) => { const X = (i / 119) * w, Y = h / 2 - y * h * 0.38; i ? sctx.lineTo(X, Y) : sctx.moveTo(X, Y); });
  sctx.stroke();
  // status pill and timeline
  const sec = SEC[st.sec];
  let s = '';
  const mph = o.spd * 2.237;
  if (sec.k === 'ex') {
    const out = dog.parts.reduce((n, m) => n + (m.userData.out ? 1 : 0), 0);
    const pl = skin ? skin.userData.plates : 0;
    s = K.ex < 0.02 ? 'Standing' : `Teardown · ${fmt(out + Math.round(pl * clamp(K.ex * 1.6)))} of ${fmt(PARTS + pl)} parts out`;
  } else if (CUTS[st.sec]) s = `${sec.label} cutaway · ${Math.round(ease(K[sec.k]) * 100)}% open`;
  else if (sec.k) s = `${sec.label} open · ${Math.round(ease(K[sec.k]) * 100)}% apart`;
  else if (sec.gait === 'jump') s = st.jumpT < 0.45 ? 'Jump · crouch' : st.jumpT < 0.7 ? 'Jump · push off' : st.jumpT < 1.22 ? `Jump · in the air, ${fmt(Math.max(0, jumpAt(st.jumpT).dy + 0.0) * 100 / 2.54, 0)} in up` : st.jumpT < 1.5 ? 'Jump · landing' : 'Jump · ready';
  else if (st.amp > 0.05) s = `${st.gaitName === 'run' ? 'Running' : 'Walking'} · ${fmt(mph, 1)} mph`;
  else s = 'Standing';
  $('#status').textContent = s;
  const T = st.t;
  $('#clock').textContent = `${String(Math.floor(T / 60)).padStart(2, '0')}:${(T % 60).toFixed(1).padStart(4, '0')}`;
  const prog = sec.k ? ease(K[sec.k]) : sec.gait === 'jump' ? st.jumpT / JUMP.T : (st.amp > 0.05 ? frac(st.phase) : 0);
  $('#prog').style.width = `${prog * 100}%`;
  $('#count').textContent = fmt(PARTS + (skin ? skin.userData.plates : 0));
}

// ------------------------------------------------------------------ callouts
const calls = $('#callouts'), lines = $('#lines');
const callEls = [];
function syncCallouts() {
  const sec = SEC[st.sec];
  const want = (sec.call || []).slice(0, portrait() || phoneLand() ? 3 : 5);
  const kk = sec.k ? K[sec.k] : 0;
  const show = kk > 0.55 && camK > 0.92 && dog.root.visible;
  while (callEls.length < want.length) {
    const d = document.createElement('div'); d.className = 'callout'; calls.appendChild(d);
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'path'); lines.appendChild(l);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', '3'); lines.appendChild(c);
    callEls.push({ d, l, c });
  }
  callEls.forEach((e, i) => {
    const c = want[i];
    const vis = show && !!c;
    e.d.classList.toggle('on', vis); e.l.style.opacity = vis ? 1 : 0; e.c.style.opacity = vis ? 1 : 0;
    if (!c) return;
    const [name, title, sub, side] = c;
    if (e.d.dataset.k !== name) { e.d.innerHTML = `<b>${title}</b><span>${sub}</span>`; e.d.dataset.k = name; }
    const p = new THREE.Vector3(); dog.anchors[name].getWorldPosition(p); p.project(camera);
    const x = (p.x * 0.5 + 0.5) * VW, y = (-p.y * 0.5 + 0.5) * VH;
    const cw = e.d.offsetWidth || 160, ch = e.d.offsetHeight || 46;
    const sideX = side > 0 ? 1 : -1;
    const margin = portrait() ? 8 : 24;
    let cx = x + sideX * (portrait() ? 44 : 110) - (sideX < 0 ? cw : 0);
    let cy = y - ch / 2 - 30 + i * 8;
    const top = portrait() ? 150 : 120, bot = VH - (portrait() ? 170 : 80);
    const left = portrait() || phoneLand() ? margin : 230, right = VW - (portrait() || phoneLand() ? margin : 290);
    cx = clamp(cx, left, right - cw); cy = clamp(cy, top, bot - ch);
    // keep cards apart
    for (let j = 0; j < i; j++) { const o = callEls[j]; if (o.y !== undefined && Math.abs(o.y - cy) < ch + 8 && Math.abs(o.x - cx) < cw) cy = o.y + ch + 10; }
    // portrait phones: cards stack in two columns in the clear band above the dog, so they never sit on it
    if (portrait()) {
      const col = side > 0 ? 1 : 0;
      const nAbove = want.slice(0, i).filter((w) => (w[3] > 0 ? 1 : 0) === col).length;
      cx = col ? VW - margin - cw : margin;
      cy = 170 + nAbove * (ch + 8);
    }
    e.x = cx; e.y = cy;
    e.d.style.transform = `translate(${cx}px, ${cy}px)`;
    const ex = sideX > 0 ? cx : cx + cw, ey = cy + ch / 2;
    e.l.setAttribute('d', `M${x},${y} L${ex},${ey}`);
    e.c.setAttribute('cx', x); e.c.setAttribute('cy', y);
  });
}

// ------------------------------------------------------------------ resize and adaptive quality
function resize() {
  VW = innerWidth; VH = innerHeight;
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / VH;
  // sideways phones: the panel takes the right 40%, so centre the dog in the rest
  if (phoneLand()) camera.setViewOffset(VW, VH, VW * 0.19, 0, VW, VH); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  lines.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  strideCv.width = strideCv.clientWidth * devicePixelRatio; strideCv.height = strideCv.clientHeight * devicePixelRatio;
  if (composer) { composer.setSize(VW, VH); } else setupComposer(VW, VH);
  const v = viewFor(SEC[st.sec].view); Object.assign(camTo, v); if (camK >= 1) Object.assign(cam, { ...v, t: v.t.clone() });
}
addEventListener('resize', resize);

let fpsAcc = 0, fpsN = 0;
function adapt(dt) {
  if (!LITE) return;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    const want = fps < 40 ? Math.max(0.85, PR - 0.25) : fps > 57 ? Math.min(1.5, devicePixelRatio, PR + 0.15) : PR;
    if (Math.abs(want - PR) > 0.05) { PR = want; renderer.setPixelRatio(PR); renderer.setSize(VW, VH, false); }
  }
}

// ------------------------------------------------------------------ tour: walks through every section once, then hands over
const TOUR = [['overview', 5], ['eye', 7], ['jaw', 7], ['ear', 7], ['paw', 7], ['back', 7], ['flank', 7.5], ['hind', 7], ['tail', 7], ['teardown', 9], ['walk', 5], ['run', 6], ['jump', 5.5], ['overview', 0]];
let tourI = -1, tourT = 0;
function stopTour() { tourI = -1; $('#tour').classList.remove('on'); }
function startTour() { tourI = 0; tourT = 0; go(TOUR[0][0]); $('#tour').classList.add('on'); }
$('#tour').onclick = () => (tourI >= 0 ? stopTour() : startTour());
function tour(dt) {
  if (tourI < 0) return;
  tourT += dt;
  if (tourT > TOUR[tourI][1]) { tourI++; tourT = 0; if (tourI >= TOUR.length - 1) { go(TOUR[TOUR.length - 1][0]); stopTour(); return; } go(TOUR[tourI][0]); }
}

// ------------------------------------------------------------------ frame
function step(dt) {
  st.t += dt; st.secT += dt;
  const sec = SEC[st.sec];
  // section amounts open and close
  for (const n in K) {
    let target = sec.k === n ? 1 : 0;
    if (n === 'snarl' && !target) target = st.sec === 'run' ? 0.55 : (st.sec === 'overview' || st.sec === 'walk') && (st.t % 9) > 6.2 ? 0.8 : 0;
    if (n === 'xt') target = xtSec && xtSec === st.sec ? 1 : 0;
    const rate = dt / KDUR[n] * (target ? 1 : 1.6);
    K[n] = K[n] < target ? Math.min(target, K[n] + rate) : Math.max(target, K[n] - rate);
  }
  if (K.xt === 0) xtSec = CUTS[st.sec] && CUTS[st.sec].xt ? st.sec : null;
  st.pawLift = clamp(st.pawLift + (sec.gait === 'paw' ? dt / 0.9 : -dt / 0.7));
  const o = pose(dt);
  applyParts();
  // camera
  if (camK < 1) {
    camK = Math.min(1, camK + dt / 1.4);
    const e = ease(camK);
    const v = viewFor(sec.view); Object.assign(camTo, { ...v, t: v.t });
    cam.t.lerpVectors(camFrom.t, camTo.t, e);
    let daz = camTo.az - camFrom.az; daz = ((daz + 540) % 360) - 180;
    cam.az = camFrom.az + daz * e; cam.el = lerp(camFrom.el, camTo.el, e); cam.d = lerp(camFrom.d, camTo.d, e); cam.fov = lerp(camFrom.fov, camTo.fov, e);
  } else if (!userCam) {
    const v = viewFor(sec.view);
    cam.t.lerp(v.t, 1 - Math.exp(-dt * 4));
  }
  if (sec.k === 'ex' && !userCam && camK >= 1 && !REDUCED) cam.az += dt * (360 / 14);
  if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  if (userCam) controls.update(); else camPlace(cam);
  console_(dt, o);
  tour(dt);
}
let skin = null;
// the painted skin covers the code-built parts; flank and teardown fade it to show the inside
const isMouth = (m) => !!(m.userData.mouth || m.material === dog.M.tooth || m.material === dog.M.gum);
let lastMode = '';
// cutaways: each close-up cuts a window in the painted shell (a capsule between two anchors) on the side the camera
// sees, and shows the machine parts inside it, which then come apart along their own offsets
const CUTS = {
  eye: { k: 'eye', mod: true },
  jaw: { k: 'snarl', bay: true },
  ear: { k: 'ear', mod: true },
  paw: { k: 'paw', a: 'shoulder', b: 'paw', r: 0.085, side: [0, 0, -1], xt: { root: () => dog.legs.find((l) => l.key === 'FL').hip, len: 0.3, dir: [0.65, 0.1, -0.75] } },
  back: { k: 'back', bay: true },
  flank: { k: 'flank', bay: true },
  hind: { k: 'hind', a: 'hipH', b: 'hindPaw', r: 0.1, side: [0, 0, -1], xt: { root: () => dog.legs.find((l) => l.key === 'HL').hip, len: 0.3, dir: [-0.6, 0.1, -0.75] } },
  tail: { k: 'tail', a: 'tailRoot', b: 'tailTip', r: 0.05, side: null, xt: { root: () => dog.tail[0], len: 0.22, dir: [-0.35, 0.6, -0.7] } },
};
let xtSec = null;
// Extraction, the way the eye comes apart: the parts the cut opens are sorted by depth, toward the section's camera,
// into five layers, and the layers slide out along that line one after another, the outermost first and furthest.
// Each section's callouts move onto the parts that come out, so their lines follow them.
function buildExtract() {
  dog.root.updateMatrixWorld(true);
  const box = new THREE.Box3(), wc = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  const under = (m, root) => { for (let o = m; o; o = o.parent) if (o === root) return true; return false; };
  for (const id in CUTS) {
    const c = CUTS[id]; if (!c.xt) continue;
    const view = SEC[id].view, va = THREE.MathUtils.degToRad(view.az), ve = THREE.MathUtils.degToRad(view.el);
    const toCam = new THREE.Vector3(Math.sin(va) * Math.cos(ve), Math.sin(ve), -Math.cos(va) * Math.cos(ve));
    // out: across the screen rather than straight at the camera, or the parts would only seem to grow
    const out = c.xt.dir ? new THREE.Vector3(...c.xt.dir).normalize() : toCam.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize();
    dog.anchors[c.a].getWorldPosition(A); dog.anchors[c.b].getWorldPosition(B);
    const ab = B.clone().sub(A), ab2 = Math.max(ab.lengthSq(), 1e-9), mid = A.clone().add(B).multiplyScalar(0.5);
    const root = c.xt.root && c.xt.root();
    const mem = [];
    dog.parts.forEach((m) => {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); box.getCenter(wc);
      let inside;
      if (root) inside = under(m, root);
      else {
        const h = clamp(wc.clone().sub(A).dot(ab) / ab2), qp = A.clone().addScaledVector(ab, h);
        const side = c.side ? new THREE.Vector3(...c.side) : null;
        inside = wc.distanceTo(qp) < c.r * 1.35 && (!side || wc.clone().sub(qp).dot(side) > -c.r * 0.5);
      }
      if (inside) mem.push({ m, depth: wc.clone().sub(mid).dot(toCam), radial: wc.clone().sub(mid).projectOnPlane(toCam) });
    });
    if (!mem.length) continue;
    mem.sort((x, y) => x.depth - y.depth);
    const N = 5;
    mem.forEach((e, i) => {
      const layer = Math.min(N - 1, Math.floor((i / mem.length) * N)); // 0 innermost .. 4 outermost
      const t = (layer + 1) / N;
      const world = out.clone().multiplyScalar(c.xt.len * t).addScaledVector(e.radial, 0.35 * t);
      e.m.parent.matrixWorld.decompose(new THREE.Vector3(), q, sc);
      const local = world.applyQuaternion(q.clone().invert()).divide(sc);
      (e.m.userData.xt ||= {})[id] = { p: local, d: 0.45 * (1 - t) };
    });
    c.members = new Set(mem.map((e) => e.m));
    // callouts: each one re-anchored on the moving part nearest to where it pointed
    const sec = SEC[id];
    sec.call = (sec.call || []).map(([name, title, sub, side]) => {
      const a = dog.anchors[name]; if (!a) return [name, title, sub, side];
      const p = a.getWorldPosition(new THREE.Vector3());
      let best = null, bd = Infinity;
      mem.forEach((e) => {
        if (e.m.material === dog.M.ivory && mem.some((o) => o.m.material !== dog.M.ivory)) return; // prefer machinery
        box.copy(e.m.geometry.boundingBox).applyMatrix4(e.m.matrixWorld); box.getCenter(wc);
        const d = wc.distanceTo(p); if (d < bd) { bd = d; best = e.m; }
      });
      if (!best || under(a, best)) return [name, title, sub, side];
      const na = new THREE.Object3D(); best.geometry.boundingBox.getCenter(na.position); best.add(na);
      dog.anchors[`xt:${id}:${name}`] = na;
      return [`xt:${id}:${name}`, title, sub, side];
    });
  }
}
const cA = new THREE.Vector3(), cB = new THREE.Vector3(), cS = new THREE.Vector3(), tmpP = new THREE.Vector3();
let cutSec = null;
function skinMode() {
  if (Q.has('proc')) return;
  skin.material.uniforms.explode.value = K.ex;
  if (gtao) gtao.enabled = K.ex < 0.002;
  (skin.userData.eyes || []).forEach((e) => { e.visible = K.ex < 0.05; });
  skin.material.uniforms.ghost.value = 1; skin.visible = true;
  // which cut is open (the one being opened wins; a closing one keeps its shape while it closes)
  if (CUTS[st.sec]) cutSec = st.sec;
  else if (cutSec && K[CUTS[cutSec].k] < 0.002) cutSec = null;
  const U = skin.material.uniforms;
  let R = 0;
  if (cutSec && !(cutSec === 'jaw' && st.sec !== 'jaw')) {
    const c = CUTS[cutSec];
    let r = c.r, off = -0.25;
    if (c.mod) ({ r, off } = mods.cut(cutSec, cA, cB, cS));
    else if (c.bay) ({ r, off } = bays.cut(cutSec, cA, cB, cS));
    else {
      dog.anchors[c.a].getWorldPosition(cA); dog.anchors[c.b].getWorldPosition(cB);
      if (c.side) cS.set(...c.side); else cS.set(0, 0, 0);
    }
    R = r * ease(clamp(K[c.k] * 1.6));
    U.cutA.value.copy(cA); U.cutB.value.copy(cB); U.cutSide.value.copy(cS); U.cutOff.value = off;
  }
  U.cutR.value = R;
  // the eye and ear have their own mechanisms, sized to the painted ones
  mods.update(K.eye, K.ear, st.t, K.ex < 0.01);
  bays.update(R > 0 ? cutSec : null, cutSec ? K[CUTS[cutSec].k] : 0, K.ex < 0.01);
  // the chassis box inside the body: whenever the body is open, and in the full teardown
  chassis.update(K.ex > 0.01 || (R > 0 && BODY_CUTS.includes(cutSec)), st.t);
  // code parts: everything in the teardown; in a cutaway only the machine parts inside the window (no ivory shell)
  const mode = K.ex > 0.001 ? 'all' : R > 0 ? 'cut' : 'skin';
  if (mode === 'cut' && CUTS[cutSec].members) {
    dog.parts.forEach((p) => { p.visible = isMouth(p) || CUTS[cutSec].members.has(p); });
    lastMode = 'cutxt';
    return;
  }
  if (mode === 'cut' && (CUTS[cutSec].mod || CUTS[cutSec].bay)) {
    dog.parts.forEach((p) => { p.visible = isMouth(p); });
    lastMode = 'cutmod';
    return;
  }
  if (mode === 'cut') {
    const key = CUTS[cutSec].k, R2 = R * 1.25;
    const ab = cB.clone().sub(cA), ab2 = Math.max(ab.lengthSq(), 1e-9);
    dog.parts.forEach((p) => {
      if (isMouth(p)) { p.visible = true; return; }
      const own = p.userData.offs && p.userData.offs[key];
      if (p.material === dog.M.ivory && !own) { p.visible = false; return; }
      p.getWorldPosition(tmpP);
      const h = clamp(tmpP.clone().sub(cA).dot(ab) / ab2);
      const q = cA.clone().addScaledVector(ab, h);
      const d = tmpP.distanceTo(q);
      const sideOk = cS.lengthSq() < 0.25 || tmpP.clone().sub(q).dot(cS) > -R * 0.6;
      p.visible = (own && d < R2 * 1.6) || (d < R2 && sideOk);
    });
    lastMode = 'cut';
    return;
  }
  if (mode === lastMode) return;
  lastMode = mode;
  dog.parts.forEach((m) => { m.visible = (mode === 'all' && !m.userData.core) || isMouth(m); });
}
function render() {
  dog.root.updateMatrixWorld(true);
  if (skin) { skinMode(); skin.userData.sync(); skin.skeleton.update(); }
  syncCallouts();
  if (composer) composer.render(); else renderer.render(scene, camera);
}

// ------------------------------------------------------------------ boot
computeExplode(dog);
resize();
// bind the painted skin to the rig in its standing pose
if (!Q.has('proc')) fitRig(dog);
st.amp = 0; pose(1e-6); dog.root.updateMatrixWorld(true);
const mods = buildCutMods(dog);
const bays = buildBays(dog);
const chassis = buildChassis(dog);
const BODY_CUTS = ['back', 'flank', 'paw', 'hind', 'tail'];
buildExtract();
st.amp = 1;
pose(0.001); dog.root.updateMatrixWorld(true);
// the code-built parts are only the skeleton under the painted skin: never show them before the skin is on
const loadingNote = document.createElement('div');
if (!Q.has('proc')) {
  dog.root.visible = false;
  loadingNote.className = 'corso-loading';
  loadingNote.textContent = 'Loading Aja\u2026';
  loadingNote.style.cssText = 'position:fixed;left:50%;top:52%;transform:translate(-50%,-50%);font:500 15px/1.4 system-ui,sans-serif;letter-spacing:.04em;color:#8a7a6c;pointer-events:none;z-index:5';
  document.body.appendChild(loadingNote);
}
const scanReady = (Q.has('proc') ? Promise.resolve(null) : loadScan()).then((d) => {
  if (!d) return;
  // bind in the plain standing pose (the page may already be mid-stride)
  const amp = st.amp, pl = st.pawLift, sn = K.snarl; st.amp = 0; st.pawLift = 0; K.snarl = 0;
  pose(1e-6); dog.root.updateMatrixWorld(true);
  skin = buildSkin(d, dog); scene.add(skin);
  if (Q.has('eyes3d')) skin.userData.eyes = buildEyes(dog, skin);
  st.amp = amp; st.pawLift = pl; K.snarl = sn; pose(1e-6);
  dog.root.visible = true; loadingNote.remove();
  render();
}).catch((e) => { console.error('scan', e); loadingNote.textContent = 'Could not load Aja. Please reload.'; });
go('overview');
camK = 1; Object.assign(cam, { ...camTo, t: camTo.t.clone() });
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(REDUCED && st.gaitName === 'run' ? dt * 0.6 : dt);
  render(); adapt(dt);
  requestAnimationFrame(loop);
}
if (!STILL) requestAnimationFrame(loop); else { step(0.016); render(); }
document.body.classList.add('ready');
if (!STILL && !REDUCED && !Q.has('notour') && !Q.has('s')) scanReady.then(() => setTimeout(() => { if (st.secT > 3.5 && st.sec === 'overview') startTour(); }, 6000));
if (Q.get('s')) go(Q.get('s'));

window.__corso = {
  go, parts: PARTS, state: st, K,
  ff(sec) { const n = Math.ceil(sec / 0.033); for (let i = 0; i < n; i++) step(0.033); render(); },
  settle() { camK = 1; const v = viewFor(SEC[st.sec].view); Object.assign(cam, { ...v, t: v.t.clone() }); render(); },
  render, renderer, dog, scene, camera, scanReady, get skin() { return skin; },
};

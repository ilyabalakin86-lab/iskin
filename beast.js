/* ISKIN — living guardians.
   Each portal is guarded by an animal. It is rendered as a small 3D model off screen; the game then reads the
   pixels back and redraws the animal as halftone ink dots (see arFrame in index.html). This module only owns
   three.js: loading, animation, rendering into a tiny canvas. The look happens in the 2D canvas. */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/jsm/loaders/GLTFLoader.js";

const KINDS = {
  flamingo: { file: "models/flamingo.glb", name: "Фламинго", fly: true,  speed: 1.0 },
  stork:    { file: "models/stork.glb",    name: "Аист",     fly: true,  speed: 0.9 },
  parrot:   { file: "models/parrot.glb",   name: "Попугай",  fly: true,  speed: 1.2 },
  horse:    { file: "models/horse.glb",    name: "Конь",     fly: false, speed: 1.0 },
  giant:    { build: buildGiant,             name: "Великан",  giant: true, cam: 4.1 },
  // the three guardians as sculpted models (Higgsfield: Ilya's sketches → clay renders → Meshy image-to-3D)
  g_giant:  { file: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203121_60fece35-389d-47a3-932e-c1740cce7a9f.glb", name: "Великан", guard: "giant", cam: 4.0 },
  g_idol:   { file: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203122_885bf255-54e6-48a8-a2a4-e4d9d742c0a8.glb",  name: "Идол",    guard: "idol",  cam: 3.9 },
  g_sun:    { file: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203124_d85494ad-ebaa-4fbe-b940-f5bc07211dfe.glb",   name: "Солнце",  guard: "sun",   cam: 3.8 },
};

/* The giant guardian (after Ilya's design frame): a hulking figure with huge rounded pauldrons, a small head,
   heavy forearms and hands, a blade rising from the right arm, legs that thin out into the ground.
   Built from primitives so it can be shaped freely; animated by code (breathing, arm sway, head turn). */
function buildGiant() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const S = (r = 1) => new THREE.SphereGeometry(r, 22, 16);
  const part = (geo, x, y, z, sx = 1, sy = 1, sz = 1, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.frustumCulled = false; (parent || root).add(m); return m; };
  const limb = (a, b, r0, r1, parent) => {                 // a tapered cylinder between two points
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 16), mat);
    m.position.copy(A).add(Bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
    m.frustumCulled = false; parent.add(m);
    part(S(r0), ...a, 1, 1, 1, parent); part(S(r1), ...b, 1, 1, 1, parent);
  };
  const root = new THREE.Group(), torso = new THREE.Group(); root.add(torso);
  // legs fade into the ground: they end in thin points at y = -1
  limb([-0.15, -0.18, 0], [-0.03, -1.0, 0.02], 0.15, 0.04, root);
  limb([0.15, -0.18, 0], [0.03, -1.0, 0.02], 0.15, 0.04, root);
  part(S(), 0, -0.12, 0, 0.3, 0.22, 0.2);                    // pelvis
  part(S(), 0, 0.06, 0, 0.2, 0.24, 0.17, torso);             // narrow waist
  part(S(), 0, 0.38, 0, 0.46, 0.3, 0.26, torso);             // broad chest
  part(S(), -0.24, 0.2, -0.02, 0.17, 0.26, 0.16, torso);     // lats: the V of the back
  part(S(), 0.24, 0.2, -0.02, 0.17, 0.26, 0.16, torso);
  part(S(), -0.15, 0.4, 0.13, 0.19, 0.15, 0.1, torso);       // pectoral plates
  part(S(), 0.15, 0.4, 0.13, 0.19, 0.15, 0.1, torso);
  limb([0, 0.6, 0.02], [0, 0.68, 0.05], 0.1, 0.085, torso);  // short thick neck
  const head = new THREE.Group(); head.position.set(0, 0.79, 0.06); torso.add(head);
  part(S(), 0, 0, 0, 0.13, 0.16, 0.14, head);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pd = part(S(), sx * 0.5, 0.47, -0.02, 0.26, 0.38, 0.29, torso);  // the huge shell pauldrons, draping down
    pd.rotation.z = sx * 0.38;
    const arm = new THREE.Group(); arm.position.set(sx * 0.5, 0.36, 0.02); torso.add(arm);
    limb([0, 0, 0], [sx * 0.06, -0.42, 0.06], 0.15, 0.13, arm);        // upper arm
    limb([sx * 0.06, -0.42, 0.06], [sx * 0.08, -0.9, 0.14], 0.17, 0.12, arm); // heavy forearm
    part(S(), sx * 0.09, -1.05, 0.16, 0.13, 0.19, 0.08, arm);          // big hand
    for (let f = 0; f < 4; f++) limb([sx * (0.03 + f * 0.035), -1.15, 0.17], [sx * (0.03 + f * 0.038), -1.31, 0.2], 0.026, 0.018, arm);
    if (sx > 0) {                                                       // a blade rising from the right forearm
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.35, 14), mat);
      blade.position.set(0.36, -0.2, 0.02); blade.rotation.z = -0.48; blade.scale.z = 0.3; blade.frustumCulled = false; arm.add(blade);
    }
    arms.push(arm);
  }
  const pivot = new THREE.Group(); pivot.add(root); root.scale.setScalar(0.92);
  const anim = (t) => {
    const br = 1 + Math.sin(t * 1.1) * 0.015;
    torso.scale.set(br, 1 + (br - 1) * 0.5, br);
    arms[0].rotation.set(Math.sin(t * 0.6) * 0.06, 0, -0.05 + Math.sin(t * 0.7) * 0.04);
    arms[1].rotation.set(Math.sin(t * 0.6 + 2) * 0.06, 0, 0.05 - Math.sin(t * 0.7 + 1) * 0.04);
    head.rotation.set(Math.sin(t * 0.3) * 0.06, Math.sin(t * 0.23) * 0.35, 0);
    root.position.y = Math.sin(t * 1.1) * 0.01;
  };
  // points worth knowing on screen: the eyes, the third eye, the feet
  const marks = { eyeL: [-0.05, 0.0, 0.125, head], eyeR: [0.05, 0.0, 0.125, head], third: [0, 0.09, 0.12, head], feet: [0, -1.0, 0.02, root] };
  return { pivot, anim, marks };
}
const SIZE = 160;                       // off-screen render size (pixels); the halftone grid samples it
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(SIZE, SIZE, false); renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
camera.position.set(0, 0.1, 2.5); camera.lookAt(0, 0.12, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-2, 3, 2.5); scene.add(sun);
const loader = new GLTFLoader();
const cache = {};
let cur = null;                         // {kind, root, pivot, mixer}
const gl = renderer.getContext(), raw = new Uint8Array(SIZE * SIZE * 4), px = new Uint8ClampedArray(SIZE * SIZE * 4);

function load(kind) {
  if (!KINDS[kind]) kind = "flamingo";
  if (cache[kind]) return cache[kind];
  if (KINDS[kind].build) { const g = KINDS[kind].build(); return (cache[kind] = Promise.resolve({ kind, pivot: g.pivot, anim: g.anim, marks: g.marks, name: KINDS[kind].name })); }
  cache[kind] = new Promise((res, rej) => loader.load(KINDS[kind].file, gltf => {
    const root = gltf.scene;
    // flat white clay: the shading is all we need, colour is added by the ink
    root.traverse(o => { if (o.isMesh) {
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }); o.frustumCulled = false; } });
    // normalise: longest side = 2 units, centred
    const box = new THREE.Box3().setFromObject(root), s = new THREE.Vector3(), c = new THREE.Vector3();
    box.getSize(s); box.getCenter(c);
    const k = 2 / Math.max(s.x, s.y, s.z);
    root.scale.setScalar(k); root.position.set(-c.x * k, -c.y * k, -c.z * k);
    const pivot = new THREE.Group(); pivot.add(root);
    const mixer = new THREE.AnimationMixer(root);
    if (gltf.animations[0]) { const act = mixer.clipAction(gltf.animations[0]); if (!KINDS[kind].guard) act.setDuration(KINDS[kind].fly ? 1.2 : 0.9); act.play(); }
    let headBone = null; root.traverse(o => { if (o.isBone && !headBone && /head/i.test(o.name)) headBone = o; });
    res({ kind, pivot, mixer, headBone, scale: k, name: KINDS[kind].name });
  }, undefined, rej));
  return cache[kind];
}

/* Advance and draw one frame. t: seconds; dt: seconds since last frame; yaw: extra turn from the phone.
   Returns the RGBA pixels of the animal (SIZE×SIZE) plus how it is moving, or null while loading. */
function frame(t, dt, yaw) {
  if (!cur) return null;
  const K = KINDS[cur.kind];
  if (K.guard) {
    // sculpted guardians: they stay in place, breathe and turn slowly
    camera.position.set(0, 0, K.cam); camera.lookAt(0, 0, 0);
    cur.mixer.update(dt);
    if (K.guard === "sun") cur.pivot.rotation.set(Math.sin(t * 0.21) * 0.12, Math.sin(t * 0.27) * 0.28 + yaw, t * 0.06);
    else if (K.guard === "idol") cur.pivot.rotation.set(Math.sin(t * 0.19) * 0.06, Math.sin(t * 0.4) * 0.35 + yaw, 0);
    else cur.pivot.rotation.set(0, Math.sin(t * 0.17) * 0.3 + yaw, 0);
    cur.pivot.position.y = K.guard === "giant" ? Math.sin(t * 1.1) * 0.01 : Math.sin(t * 0.8) * 0.02;
    renderer.render(scene, camera);
    const out = readBack();
    if (cur.headBone) {
      cur.pivot.updateMatrixWorld(true);
      const v = new THREE.Vector3(), m = {}, P = (x, y, z, key) => { v.set(x, y, z); cur.headBone.localToWorld(v); v.project(camera); m[key] = [(v.x + 1) / 2 * SIZE, (1 - v.y) / 2 * SIZE]; };
      P(0, 0, 0, "head"); out.marks = m;
    }
    return out;
  }
  if (K.giant) {
    // the giant stands still, breathes and looks around, turning slightly towards you
    camera.position.set(0, 0.05, K.cam); camera.lookAt(0, 0.0, 0);
    cur.anim(t);
    cur.pivot.rotation.set(0, Math.sin(t * 0.17) * 0.3 + yaw, 0);
    renderer.render(scene, camera);
    const out = readBack(), m = {}, v = new THREE.Vector3();
    cur.pivot.updateMatrixWorld(true);
    for (const [k, [x, y, z, obj]] of Object.entries(cur.marks)) {
      v.set(x, y, z); obj.localToWorld(v); v.project(camera);
      m[k] = [(v.x + 1) / 2 * SIZE, (1 - v.y) / 2 * SIZE];
    }
    out.marks = m; return out;
  }
  camera.position.set(0, 0.1, 2.5); camera.lookAt(0, 0.12, 0);
  cur.mixer.update(dt * K.speed);
  // it wanders: drifts left and right across the portal, turning to face where it goes
  const x = Math.sin(t * 0.32) * 0.3, vx = Math.cos(t * 0.32);
  const face = (vx > 0 ? -1 : 1) * Math.PI / 2 * 0.85;
  cur.face = cur.face == null ? face : cur.face + (face - cur.face) * Math.min(1, dt * 1.6);
  cur.pivot.position.set(x, K.fly ? Math.sin(t * 1.3) * 0.12 : 0, 0);
  cur.pivot.rotation.set(K.fly ? Math.sin(t * 1.3 + 1) * 0.08 : 0, cur.face + yaw, 0);
  renderer.render(scene, camera);
  const out = readBack(); out.vx = vx; return out;
}
// read straight from the GL buffer (bottom-up rows) — much cheaper than going through a 2D canvas
function readBack() {
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const row = SIZE * 4;
  for (let y = 0; y < SIZE; y++) px.set(raw.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
  return { data: px, size: SIZE };
}

async function show(kind) {
  const b = await load(kind);
  if (cur && cur.pivot !== b.pivot) scene.remove(cur.pivot);
  scene.add(b.pivot); cur = b; cur.face = null;
  return b.name;
}

window.BEAST = { ready: true, kinds: Object.keys(KINDS).filter(k => !KINDS[k].giant && !KINDS[k].guard), guards: { giant: "g_giant", idol: "g_idol", sun: "g_sun" }, names: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.name])), load, show, frame, size: SIZE };
window.dispatchEvent(new Event("beast-ready"));

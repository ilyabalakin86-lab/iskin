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
};
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
    if (gltf.animations[0]) mixer.clipAction(gltf.animations[0]).setDuration(KINDS[kind].fly ? 1.2 : 0.9).play();
    res({ kind, pivot, mixer, name: KINDS[kind].name });
  }, undefined, rej));
  return cache[kind];
}

/* Advance and draw one frame. t: seconds; dt: seconds since last frame; yaw: extra turn from the phone.
   Returns the RGBA pixels of the animal (SIZE×SIZE) plus how it is moving, or null while loading. */
function frame(t, dt, yaw) {
  if (!cur) return null;
  const K = KINDS[cur.kind];
  cur.mixer.update(dt * K.speed);
  // it wanders: drifts left and right across the portal, turning to face where it goes
  const x = Math.sin(t * 0.32) * 0.3, vx = Math.cos(t * 0.32);
  const face = (vx > 0 ? -1 : 1) * Math.PI / 2 * 0.85;
  cur.face = cur.face == null ? face : cur.face + (face - cur.face) * Math.min(1, dt * 1.6);
  cur.pivot.position.set(x, K.fly ? Math.sin(t * 1.3) * 0.12 : 0, 0);
  cur.pivot.rotation.set(K.fly ? Math.sin(t * 1.3 + 1) * 0.08 : 0, cur.face + yaw, 0);
  renderer.render(scene, camera);
  // read straight from the GL buffer (bottom-up rows) — much cheaper than going through a 2D canvas
  gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const row = SIZE * 4;
  for (let y = 0; y < SIZE; y++) px.set(raw.subarray((SIZE - 1 - y) * row, (SIZE - y) * row), y * row);
  return { data: px, size: SIZE, vx };
}

async function show(kind) {
  const b = await load(kind);
  if (cur && cur.pivot !== b.pivot) scene.remove(cur.pivot);
  scene.add(b.pivot); cur = b; cur.face = null;
  return b.name;
}

window.BEAST = { ready: true, kinds: Object.keys(KINDS), names: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.name])), load, show, frame, size: SIZE };
window.dispatchEvent(new Event("beast-ready"));

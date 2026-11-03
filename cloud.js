/* ISKIN — guardians as true 3D point clouds (after Ilya's C4D render of the idol).
   Points are scattered over the sculpt's surface, each drawn as a small disc lying on the surface (so it reads
   as an ellipse from the side). Carved grooves are found from the mesh curvature and get dense, big, bright
   points; the rest of the body is sparse and small. Below the waist the cloud crumbles and spills over the
   ground. The guardian stands in the world: it keeps its place while you turn the phone, and shows you its
   other side as you walk around it. */
import * as THREE from "three";
import { GLTFLoader } from "./vendor/jsm/loaders/GLTFLoader.js";
import { mergeVertices } from "./vendor/jsm/utils/BufferGeometryUtils.js";

const GUARDS = {
  idol:  { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203122_885bf255-54e6-48a8-a2a4-e4d9d742c0a8.glb",
           height: 2.4, dist: 4.6, crumble: 0.30, count: 22000,
           main: [0.24, 1.0, 0.35], body: [[0.24, 1.0, 0.35], [0.12, 0.85, 0.25], [0.1, 0.2, 0.85]], white: 0.02 },
  giant: { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203121_60fece35-389d-47a3-932e-c1740cce7a9f.glb",
           height: 4.2, dist: 6.5, crumble: 0.22, count: 30000,
           main: [0.88, 0.94, 1.0], body: [[0.6, 0.75, 1.0], [0.35, 0.55, 1.0], [0.9, 0.95, 1.0]], white: 0.05 },
  sun:   { url: "https://d8j0ntlcm91z4.cloudfront.net/user_3ANnAU4Au9rBJHD9BZOzXV4W1SZ/hf_20261102_203124_d85494ad-ebaa-4fbe-b940-f5bc07211dfe.glb",
           height: 3.4, dist: 6.0, crumble: 0.0, lift: 1.4, count: 30000, radial: true,
           main: [1.0, 0.55, 0.25], body: [[1.0, 0.25, 0.2], [1.0, 0.6, 0.3], [0.55, 0.7, 1.0]], white: 0.04 },
};

let renderer = null, scene = null, camera = null, cur = null;
const cache = {};
const loader = new GLTFLoader();

const VERT = `
attribute vec3 aNormal; attribute vec3 aColor; attribute float aSize; attribute vec4 aSeed;
uniform float uTime, uFocus, uSol, uScale;
varying vec3 vColor; varying vec3 vN; varying float vA;
void main(){
  // condensation: each point starts as a spore somewhere around and settles onto the surface as you keep looking
  float e = smoothstep(aSeed.w*0.5, aSeed.w*0.5+0.5, uFocus);
  vec3 scatter = position + (aSeed.xyz-0.5)*vec3(6.0,4.0,6.0);
  vec3 p = mix(scatter, position, e);
  p += aNormal * 0.012 * sin(uTime*1.7 + aSeed.x*40.0);          // the surface breathes
  // solved: the cloud bursts outward along the normals, then falls away
  p += (aNormal*1.6 + (aSeed.xyz-0.5)*2.0) * uSol*uSol;
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z * (0.35+0.65*e);
  vN = normalize(normalMatrix * aNormal);
  vColor = aColor;
  float tw = 0.7 + 0.3*sin(uTime*2.3 + aSeed.y*60.0);
  vA = tw * (0.25+0.75*e) * (1.0 - clamp(uSol*0.9,0.0,1.0));
}`;
const FRAG = `
precision mediump float;
varying vec3 vColor; varying vec3 vN; varying float vA;
void main(){
  // a disc lying on the surface: squash the sprite along the projected normal
  vec2 c = gl_PointCoord*2.0-1.0; c.y = -c.y;
  vec2 d = length(vN.xy) > 1e-3 ? normalize(vN.xy) : vec2(1.0,0.0);
  float a = dot(c,d), b = dot(c, vec2(-d.y,d.x));
  float k = max(abs(vN.z), 0.28);
  float r = (a*a)/(k*k) + b*b;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, vA * (1.0 - smoothstep(0.75,1.0,r)*0.5));
}`;

function ensure(canvas) {
  if (renderer && renderer.domElement === canvas) return;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
  camera.rotation.order = "YXZ";
}

/* Build the cloud once per guardian: merge the mesh, measure curvature per vertex, then sample the surface. */
function build(kind) {
  if (cache[kind]) return cache[kind];
  const G = GUARDS[kind];
  cache[kind] = new Promise((res, rej) => loader.load(G.url, gltf => {
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse(o => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); parts.push(g); } });
    let geo = parts[0]; for (const a of Object.keys(geo.attributes)) if (a !== "position") geo.deleteAttribute(a);
    geo = mergeVertices(geo, 1e-4); geo.computeVertexNormals();
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, I = geo.index.array, V = P.length / 3;
    // normalise: base on the ground (y=0), centred, given height
    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let i = 0; i < V; i++) { const x = P[i*3], y = P[i*3+1], z = P[i*3+2]; mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); }
    const S = G.height / (mxy - mny), cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
    for (let i = 0; i < V; i++) { P[i*3] = (P[i*3] - cx) * S; P[i*3+1] = (P[i*3+1] - mny) * S + (G.lift || 0); P[i*3+2] = (P[i*3+2] - cz) * S; }
    // curvature: how far a vertex sits below the average of its neighbours (along its normal) → grooves
    const sum = new Float32Array(V * 3), cnt = new Uint16Array(V);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = I[t+e], b = I[t+(e+1)%3];
      sum[a*3] += P[b*3]; sum[a*3+1] += P[b*3+1]; sum[a*3+2] += P[b*3+2]; cnt[a]++;
      sum[b*3] += P[a*3]; sum[b*3+1] += P[a*3+1]; sum[b*3+2] += P[a*3+2]; cnt[b]++;
    }
    let cav = new Float32Array(V), edge = 0;
    for (let i = 0; i < V; i++) {
      if (!cnt[i]) continue;
      const ax = sum[i*3]/cnt[i] - P[i*3], ay = sum[i*3+1]/cnt[i] - P[i*3+1], az = sum[i*3+2]/cnt[i] - P[i*3+2];
      cav[i] = ax*Nn[i*3] + ay*Nn[i*3+1] + az*Nn[i*3+2]; edge += Math.hypot(ax, ay, az);
    }
    edge /= V;
    // smooth once, then express as "grooveness" 0..1 relative to the mesh's typical edge length
    const cav2 = new Float32Array(V);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t+e], b = I[t+(e+1)%3]; cav2[a] += cav[b]; cav2[b] += cav[a]; }
    for (let i = 0; i < V; i++) cav2[i] = cnt[i] ? 0.5*cav[i] + 0.5*cav2[i]/cnt[i] : 0;
    const groove = new Float32Array(V);
    for (let i = 0; i < V; i++) groove[i] = Math.min(1, Math.max(0, cav2[i] / (edge * 0.35) - 0.15));
    // sample triangles by area, favouring grooves
    const T = I.length / 3, cum = new Float32Array(T); let tot = 0;
    for (let t = 0; t < T; t++) {
      const a = I[t*3]*3, b = I[t*3+1]*3, c = I[t*3+2]*3;
      const ux = P[b]-P[a], uy = P[b+1]-P[a+1], uz = P[b+2]-P[a+2], vx = P[c]-P[a], vy = P[c+1]-P[a+1], vz = P[c+2]-P[a+2];
      const area = 0.5 * Math.hypot(uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx);
      const g = (groove[I[t*3]] + groove[I[t*3+1]] + groove[I[t*3+2]]) / 3;
      tot += area * (1 + 9 * g); cum[t] = tot;
    }
    let seed = 7; const R = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = G.count, pos = new Float32Array(n*3), nor = new Float32Array(n*3), col = new Float32Array(n*3), siz = new Float32Array(n), sd = new Float32Array(n*4);
    const H = G.height, cut = H * G.crumble;
    for (let k = 0; k < n; k++) {
      let lo = 0, hi = T - 1; const r = R() * tot; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      const ia = I[lo*3], ib = I[lo*3+1], ic = I[lo*3+2];
      let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v; } const w = 1 - u - v;
      let x = P[ia*3]*w + P[ib*3]*u + P[ic*3]*v, y = P[ia*3+1]*w + P[ib*3+1]*u + P[ic*3+1]*v, z = P[ia*3+2]*w + P[ib*3+2]*u + P[ic*3+2]*v;
      let nx = Nn[ia*3]*w + Nn[ib*3]*u + Nn[ic*3]*v, ny = Nn[ia*3+1]*w + Nn[ib*3+1]*u + Nn[ic*3+1]*v, nz = Nn[ia*3+2]*w + Nn[ib*3+2]*u + Nn[ic*3+2]*v;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const g = groove[ia]*w + groove[ib]*u + groove[ic]*v, main = g > 0.35;
      // below the cut the figure crumbles: points slide down and spill outward over the ground, lying flat
      if (cut > 0 && y < cut && R() < Math.pow(1 - y / cut, 0.7)) {
        const f = 1 - y / cut, sp = 1 + f * (0.8 + R() * 1.6);
        x *= sp; z *= sp; y = R() < 0.75 ? 0.01 + R() * 0.03 : y * (1 - f) ;
        x += (R() - .5) * 0.5 * f; z += (R() - .5) * 0.5 * f;
        nx = 0; ny = 1; nz = 0;
      } else if (R() < 0.03) { const o = 0.05 + R() * 0.35; x += nx * o; y += ny * o; z += nz * o; }   // a few hover off the skin
      pos.set([x, y, z], k*3); nor.set([nx, ny, nz], k*3);
      let c;
      if (R() < G.white) c = [1, 1, 1];
      else if (main) c = G.main;
      else if (G.radial) { const d = Math.min(1, Math.hypot(x, y - H/2 - (G.lift||0)) / (H*0.5)); const a = G.body[0], b = d < 0.5 ? G.body[1] : G.body[2], q = d < 0.5 ? d*2 : (d-0.5)*2; c = d < 0.5 ? [a[0]+(b[0]-a[0])*q, a[1]+(b[1]-a[1])*q, a[2]+(b[2]-a[2])*q] : [G.body[1][0]+(b[0]-G.body[1][0])*q, G.body[1][1]+(b[1]-G.body[1][1])*q, G.body[1][2]+(b[2]-G.body[1][2])*q]; }
      else c = G.body[R() < 0.55 ? 0 : R() < 0.6 ? 1 : 2];
      col.set(c, k*3);
      siz[k] = main ? 0.032 + R() * 0.012 : 0.015 + R() * 0.008;       // main lines: big points; the rest: half size
      sd.set([R(), R(), R(), R()], k*4);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    bg.setAttribute("aNormal", new THREE.BufferAttribute(nor, 3));
    bg.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    bg.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    bg.setAttribute("aSeed", new THREE.BufferAttribute(sd, 4));
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFocus: { value: 0 }, uSol: { value: 0 }, uScale: { value: 800 } } });
    const pts = new THREE.Points(bg, mat); pts.frustumCulled = false;
    const holder = new THREE.Group(); holder.add(pts);
    res({ kind, holder, mat, G });
  }, undefined, rej));
  return cache[kind];
}

async function show(canvas, kind) {
  ensure(canvas);
  const c = await build(kind);
  if (cur && cur.holder !== c.holder) scene.remove(cur.holder);
  scene.add(c.holder); cur = c;
  return true;
}

/* One frame. s = {W,H,dpr,t, yaw (radians the phone turned since the portal appeared), pitch (degrees, 80 ≈ level),
   focus 0..1, sol seconds since solved, around (radians the player walked around the guardian), dist (metres, far mode)} */
function frame(s) {
  if (!cur || !renderer) return false;
  const G = cur.G;
  if (renderer._w !== s.W || renderer._h !== s.H || renderer._d !== s.dpr) {
    renderer.setPixelRatio(s.dpr); renderer.setSize(s.W, s.H, false);
    renderer._w = s.W; renderer._h = s.H; renderer._d = s.dpr;
    camera.aspect = s.W / s.H; camera.updateProjectionMatrix();
  }
  // the guardian stands in the world, D metres ahead of where you first saw it; far ones loom on the horizon
  const D = s.far ? Math.max(G.dist * 2, Math.min(80, s.dist || 40)) : G.dist, big = s.far ? D / G.dist * 0.9 : 1;
  cur.holder.position.set(0, -1.55, -D);
  cur.holder.scale.setScalar(big);
  cur.holder.rotation.y = Math.PI + (s.around || 0) + Math.sin(s.t * 0.25) * 0.08;   // the sculpts face -Z: turn them to you
  camera.position.set(0, 0, 0);
  camera.rotation.set((s.pitch - 80) * Math.PI / 180 * 0.9, -s.yaw, 0);
  const m = cur.mat.uniforms;
  m.uTime.value = s.t; m.uFocus.value = s.focus; m.uSol.value = Math.min(2, s.sol || 0);
  m.uScale.value = s.H * s.dpr * 0.9 * (s.far ? 1.4 : 1);
  renderer.render(scene, camera);
  return true;
}
function clear() { if (renderer) renderer.clear(); }

window.CLOUD = { kinds: Object.keys(GUARDS), show, frame, clear };
window.dispatchEvent(new Event("cloud-ready"));

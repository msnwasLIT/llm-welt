import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as M from './model.js';
import * as U from './util.js';
import { createHub } from './zones/hub.js';
import { createTokenizer } from './zones/tokenizer.js';
import { createEmbedding } from './zones/embedding.js';
import { createPosition } from './zones/position.js';
import { createAttention } from './zones/attention.js';
import { createTransformer } from './zones/transformer.js';
import { createSampling } from './zones/sampling.js';
import { createContext } from './zones/context.js';
import { createTraining } from './zones/training.js';

const $ = (id) => document.getElementById(id);
const splashStatus = $('splash-status');
window.addEventListener('error', (e) => { if (!$('splash').classList.contains('hidden')) splashStatus.textContent = 'Fehler: ' + e.message; });

// ---------------------------------------------------------------------------
// Renderer, Szene, Kamera
// ---------------------------------------------------------------------------
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  splashStatus.textContent = 'WebGL ist in diesem Browser nicht verfügbar – die 3D-Welt kann leider nicht starten.';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050f);
scene.fog = new THREE.FogExp2(0x040818, 0.0022);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2500);
camera.position.set(0, 330, 560);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.485;
controls.minDistance = 4;
controls.maxDistance = 520;
controls.target.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x6f86ff, 0x0a0820, 0.9));
scene.add(new THREE.AmbientLight(0x223055, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(60, 120, 80);
scene.add(sun);

// ---------------------------------------------------------------------------
// Zustand & Ereignisse
// ---------------------------------------------------------------------------
const bus = {
  handlers: {},
  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); },
  emit(evt, data) { for (const fn of this.handlers[evt] || []) fn(data); },
};

const state = {
  tokens: [],
  temperature: 0.8,
  topK: 5,
  ctxWindow: 12,
  dist: null,
  busy: false,
};

function windowTokens(max = Infinity) {
  const w = state.tokens.slice(-state.ctxWindow);
  return max < w.length ? w.slice(-max) : w;
}
function recomputeDist() {
  state.dist = M.predict(windowTokens().map((t) => t.id), { temperature: state.temperature, topK: state.topK });
  bus.emit('dist');
}

// ---------------------------------------------------------------------------
// Klickbare Objekte
// ---------------------------------------------------------------------------
let clickables = [];
function clickable(obj, onClick, tooltip) {
  obj.userData.onClick = onClick;
  obj.userData.tooltip = tooltip;
  clickables.push(obj);
}
function inSceneAndVisible(o) {
  while (o) {
    if (!o.visible) return false;
    if (o === scene) return true;
    o = o.parent;
  }
  return false;
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const ctx = {
  THREE, M, U, scene, camera, renderer, state, bus,
  windowTokens, recomputeDist, clickable, toast,
  goTo: (z, o) => goTo(z, o),
  generateOne: (o) => generateOne(o),
};

// ---------------------------------------------------------------------------
// Zonen erzeugen und platzieren
// ---------------------------------------------------------------------------
const R = 80;       // Radius des Zonen-Rings
const RP = 56;      // Radius des Datenstrom-Pfads
const hub = createHub(ctx);
const ring = [
  createTokenizer(ctx), createEmbedding(ctx), createPosition(ctx), createAttention(ctx),
  createTransformer(ctx), createSampling(ctx), createContext(ctx),
];
const training = createTraining(ctx);
const order = [hub, ...ring, training];
order.forEach((z, i) => { z.navKey = String(i); });
ctx.order = order;

const ringAngle = (k) => Math.PI + Math.PI / 7 + (k * 2 * Math.PI) / 7;
ring.forEach((z, k) => {
  const a = ringAngle(k);
  z.group.position.set(R * Math.sin(a), 0, R * Math.cos(a));
  z.group.rotation.y = a;
  z.angle = a;
});
training.group.position.set(0, 0, -172);
training.group.rotation.y = Math.PI;

const zoneFx = new Map();
for (const z of order) {
  const plat = U.makePlatform(z.color, z.radius);
  z.group.add(plat);
  clickable(plat.userData.base, () => goTo(z), `${z.icon} ${z.name}`);
  const title = U.makeLabel(`${z.navKey} · ${z.name}`, { size: 2.3, px: 72, bg: 'rgba(8,12,32,0.78)', border: U.hex(z.color), color: '#eef2ff' });
  title.position.set(0, z.titleY ?? 19, 0);
  title.userData.keep = true;
  title.userData.title = true;
  title.userData.baseScale = title.scale.clone();
  title.userData.zone = z;
  z.group.add(title);
  const light = new THREE.PointLight(z.color, 70, 60, 1.6);
  light.position.set(0, 14, 8);
  z.group.add(light);
  zoneFx.set(z, { flash: 0, rimMat: plat.userData.rimMat, innerMat: plat.userData.innerMat, base: new THREE.Color(z.color), title });
  scene.add(z.group);
  z.group.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// Boden, Sterne, Datenstaub
// ---------------------------------------------------------------------------
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(900, 96),
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec3 vPos; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vPos;
      void main(){
        vec2 c = vPos.xz / 8.0;
        vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vPos.xz);
        float fade = exp(-d * 0.0055);
        float ringGlow = exp(-pow((d - 56.0) / 10.0, 2.0)) * 0.35 + exp(-pow((d - 80.0) / 28.0, 2.0)) * 0.12;
        float wave = 0.5 + 0.5 * sin(d * 0.08 - uTime * 1.2);
        vec3 base = vec3(0.012, 0.018, 0.045);
        vec3 grid = vec3(0.16, 0.28, 0.75) * line * (0.35 + 0.25 * wave) * fade;
        vec3 glow = vec3(0.25, 0.2, 0.7) * ringGlow;
        gl_FragColor = vec4(base + grid + glow, 1.0);
      }`,
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.45;
scene.add(ground);

{
  const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const r = M.rng(7);
  for (let i = 0; i < n; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95), d = 900 + r() * 400;
    pos.set([d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph) - 60, d * Math.sin(ph) * Math.sin(th)], i * 3);
    const c = new THREE.Color().setHSL(0.55 + r() * 0.25, 0.6, 0.6 + r() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, fog: false })));
}

const dust = (() => {
  const n = 1100, pos = new Float32Array(n * 3), speed = new Float32Array(n);
  const r = M.rng(11);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 20 + Math.sqrt(r()) * 230;
    pos.set([Math.sin(a) * d, r() * 90, Math.cos(a) * d], i * 3);
    speed[i] = 0.6 + r() * 2.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.1, map: U.glowTexture(), color: 0x8fb6ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, speed, n };
})();

// ---------------------------------------------------------------------------
// Datenstrom-Ring, Speichen, Verbindungen
// ---------------------------------------------------------------------------
const ringPts = ring.map((z, k) => new THREE.Vector3(RP * Math.sin(ringAngle(k)), 0.7, RP * Math.cos(ringAngle(k))));
const ringCurve = new THREE.CatmullRomCurve3(ringPts, true, 'catmullrom', 0.5);
scene.add(new THREE.Mesh(new THREE.TubeGeometry(ringCurve, 420, 0.55, 10, true), U.flowMaterial(0x7dd3fc, { repeat: 60, speed: 1.4, opacity: 0.6 })));
scene.add(new THREE.Mesh(new THREE.TubeGeometry(ringCurve, 420, 1.6, 12, true), new THREE.MeshBasicMaterial({ color: 0x3b4cff, transparent: true, opacity: 0.035, depthWrite: false })));

const spokes = ring.map((z, k) => {
  const a = ringAngle(k);
  const from = new THREE.Vector3(RP * Math.sin(a), 0.7, RP * Math.cos(a));
  const to = new THREE.Vector3((R - z.radius + 0.5) * Math.sin(a), 0.7, (R - z.radius + 0.5) * Math.cos(a));
  const mat = U.flowMaterial(z.color, { repeat: 3, speed: 1.5, opacity: 0.8 });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 8, 0.35, 8, false), mat));
  return mat;
});

function addArcBeam(from, to, ctrl, color, radius, label) {
  const curve = new THREE.QuadraticBezierCurve3(from, ctrl, to);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, radius, 8, false), U.flowMaterial(color, { repeat: 10, speed: 1.2, opacity: 1 })));
  if (label) {
    const l = U.makeLabel(label, { size: 2.2, px: 60, bg: 'rgba(8,12,32,0.7)', color: '#e6ebff' });
    l.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 4.5, 0));
    l.userData.global = true;
    scene.add(l);
  }
  return curve;
}
{
  const a = ringAngle(0);
  addArcBeam(new THREE.Vector3(14 * Math.sin(a), 1, 14 * Math.cos(a)), ringPts[0].clone(),
    new THREE.Vector3(36 * Math.sin(a), 12, 36 * Math.cos(a)), 0xf472b6, 0.4, '✍ Dein Prompt');
  addArcBeam(new THREE.Vector3(0, 2, -144), new THREE.Vector3(0, 9, -8), new THREE.Vector3(0, 52, -80), training.color, 0.35, '⚙ Gelernte Gewichte → Parameter-Kern');
  const back = U.makeLabel('↺ Rückkopplung: das neue Token wird Teil der Eingabe', { size: 1.5, px: 56, bg: 'rgba(8,12,32,0.72)', color: '#bfe9ff' });
  back.position.set(0, 2.4, -RP - 1);
  back.userData.global = true;
  scene.add(back);
}

// Token-Teilchen, die permanent durch den Ring fließen
const flow = (() => {
  const n = 150;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  const phase = new Float32Array(n), spd = new Float32Array(n);
  const r = M.rng(5);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    phase[i] = r();
    spd[i] = 0.012 + r() * 0.01;
    mesh.setColorAt(i, c.setHSL(r(), 0.8, 0.6).multiplyScalar(1.15));
  }
  scene.add(mesh);
  return { mesh, phase, spd, n };
})();
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpE = new THREE.Euler();

// ---------------------------------------------------------------------------
// Datenkomet (zeigt den Weg eines Tokens durch die Pipeline)
// ---------------------------------------------------------------------------
const comet = new THREE.Group();
comet.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(3), toneMapped: false })));
comet.add(U.makeGlow(0x9be7ff, 7));
comet.add(U.makeGlow(0xf472b6, 15, 0.45));
comet.visible = false;
scene.add(comet);
const TRAIL = 60;
const trailPos = new Float32Array(TRAIL * 3);
const trailCol = new Float32Array(TRAIL * 3);
for (let i = 0; i < TRAIL; i++) { const f = 1 - i / TRAIL; trailCol.set([0.6 * f * 2, 0.9 * f * 2, 1.0 * f * 2], i * 3); }
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
trail.frustumCulled = false;
scene.add(trail);
function resetTrail() { for (let i = 0; i < TRAIL; i++) trailPos.set([comet.position.x, comet.position.y, comet.position.z], i * 3); trailGeo.attributes.position.needsUpdate = true; }
function placeComet(u) {
  ringCurve.getPoint(((u / 7) % 1 + 1) % 1, comet.position);
  comet.position.y += 1.4;
}
function cometTravel(k0, k1, dur) {
  return U.animate(dur, (t) => placeComet(THREE.MathUtils.lerp(k0, k1, U.easeInOut(t))));
}

// ---------------------------------------------------------------------------
// Navigation & Kamera
// ---------------------------------------------------------------------------
let current = hub;
let flightId = 0;
function flyTo(toPos, toTgt, duration) {
  const fromPos = camera.position.clone();
  const fromTgt = controls.target.clone();
  const dist = fromPos.distanceTo(toPos);
  const dur = duration ?? U.clamp(dist / 85, 1.1, 2.8);
  const lift = Math.min(45, dist * 0.2);
  const id = ++flightId;
  controls.enabled = false;
  return U.animate(dur, (t) => {
    if (id !== flightId) return;
    const e = U.easeInOut(t);
    camera.position.lerpVectors(fromPos, toPos, e);
    camera.position.y += Math.sin(Math.PI * e) * lift;
    controls.target.lerpVectors(fromTgt, toTgt, e);
    if (t >= 1) controls.enabled = true;
  });
}
function goTo(zone, { duration, keepPanel } = {}) {
  if (current !== zone) { current.onLeave?.(); current = zone; zone.onEnter?.(); }
  if (!keepPanel) renderPanel();
  updateNav();
  zone.group.updateMatrixWorld(true);
  const toPos = zone.group.localToWorld(zone.cam.pos.clone());
  const toTgt = zone.group.localToWorld(zone.cam.target.clone());
  return flyTo(toPos, toTgt, duration);
}
function overview() {
  updateNav(true);
  return flyTo(new THREE.Vector3(0, 150, 180), new THREE.Vector3(0, 0, -25));
}

const navEl = $('nav');
for (const z of order) {
  const b = document.createElement('button');
  b.className = 'nav-btn';
  b.style.setProperty('--c', U.hex(z.color));
  b.innerHTML = `<span class="k">${z.navKey}</span><span class="nm">${z.short}</span>`;
  b.title = `${z.name} (Taste ${z.navKey})`;
  b.onclick = () => { stopTour(); goTo(z); };
  z.navBtn = b;
  navEl.appendChild(b);
}
function updateNav(none = false) {
  for (const z of order) z.navBtn.classList.toggle('active', !none && z === current);
}

const panelBody = $('panel-body');
function renderPanel() {
  const z = current;
  document.documentElement.style.setProperty('--zone', U.hex(z.color));
  $('panel-num').textContent = z.navKey;
  $('panel-title').textContent = `${z.icon} ${z.name}`;
  $('panel-sub').textContent = z.subtitle;
  panelBody.innerHTML = z.panel();
  z.bind?.(panelBody);
  panelBody.scrollTop = 0;
  const i = order.indexOf(z);
  $('prev').disabled = i === 0;
  $('next').textContent = i === order.length - 1 ? 'Zum Kern ↺' : 'Weiter →';
}
function step(dir) {
  const i = order.indexOf(current);
  goTo(order[(i + dir + order.length) % order.length]);
}
$('prev').onclick = () => { stopTour(); step(-1); };
$('next').onclick = () => { stopTour(); step(1); };
$('overview').onclick = () => { stopTour(); overview(); };
$('panel-toggle').onclick = () => { $('panel').classList.toggle('collapsed'); updateViewOffset(); };

let tourTimer = 0;
function stopTour() { clearInterval(tourTimer); tourTimer = 0; $('autotour').classList.remove('on'); $('autotour').textContent = '▶ Auto-Tour'; }
$('autotour').onclick = () => {
  if (tourTimer) return stopTour();
  $('autotour').classList.add('on');
  $('autotour').textContent = '■ Tour stoppen';
  step(1);
  tourTimer = setInterval(() => step(1), 16000);
};
ctx.stopTour = stopTour;

// ---------------------------------------------------------------------------
// Prompt & Generierung
// ---------------------------------------------------------------------------
const promptEl = $('prompt');
const outputEl = $('output');
function renderOutput() {
  const toks = state.tokens.slice(-70);
  const wStart = state.tokens.length - state.ctxWindow;
  const off = state.tokens.length - toks.length;
  outputEl.innerHTML = toks.map((t, i) => {
    const c = U.tokenColor(t.key).getStyle();
    const outside = off + i < wStart;
    return `<span class="tok${t.gen ? ' gen' : ''}${t.cont ? ' cont' : ''}" style="background:${c};${outside ? 'opacity:.35' : ''}" title="Token-ID ${t.id}${outside ? ' – außerhalb des Kontextfensters' : ''}">${U.escapeHtml(t.text)}</span>`;
  }).join('');
  outputEl.scrollTop = outputEl.scrollHeight;
}

function applyPrompt() {
  if (state.busy) return;
  let text = promptEl.value.trim();
  if (!text) { text = 'Die Katze sitzt auf der'; promptEl.value = text; }
  state.tokens = M.tokenize(text).map((t) => ({ ...t, gen: false }));
  recomputeDist();
  bus.emit('tokens', { appended: null });
}

let sentenceRunning = false;
function updateButtons() {
  $('step').disabled = state.busy;
  $('apply').disabled = state.busy;
  $('sentence').disabled = state.busy && !sentenceRunning;
  $('sentence').textContent = sentenceRunning ? '■ Stopp' : '⏩ Satz';
}

async function generateOne({ fast = false } = {}) {
  if (state.busy) return null;
  state.busy = true;
  updateButtons();
  try {
    const follow = $('follow').checked && !fast;
    const hop = fast ? 0.28 : follow ? 0.95 : 0.45;
    const dwell = fast ? 0 : follow ? 0.75 : 0.2;
    placeComet(0);
    comet.visible = true;
    resetTrail();
    for (let k = 0; k < 5; k++) {
      pulseZone(k);
      if (follow) goTo(ring[k], { duration: k === 0 ? 1.4 : hop + 0.2 });
      await U.wait(k === 0 && follow ? 1.2 : dwell);
      await cometTravel(k, k + 1, hop);
    }
    if (follow) goTo(ring[5], { duration: 0.9 });
    pulseZone(5);
    const choice = M.sample(state.dist);
    await ring[5].showChoice(choice, { fast });
    await cometTravel(5, 6, hop);
    const tok = { ...M.tokenFromId(choice.id), gen: true };
    state.tokens.push(tok);
    if (state.tokens.length > 240) state.tokens.splice(0, state.tokens.length - 240);
    recomputeDist();
    bus.emit('tokens', { appended: tok });
    if (follow) goTo(ring[6], { duration: 0.9 });
    pulseZone(6);
    await U.wait(fast ? 0.1 : follow ? 1.3 : 0.35);
    await cometTravel(6, 7, fast ? 0.35 : 0.8);
    comet.visible = false;
    return tok;
  } finally {
    state.busy = false;
    updateButtons();
  }
}

async function generateSentence() {
  if (sentenceRunning) { sentenceRunning = false; updateButtons(); return; }
  if (state.busy) return;
  sentenceRunning = true;
  updateButtons();
  for (let i = 0; i < 14 && sentenceRunning; i++) {
    const tok = await generateOne({ fast: i > 0 });
    if (!tok || tok.text === '.') break;
  }
  sentenceRunning = false;
  updateButtons();
}

function pulseZone(k) {
  ring[k].pulse?.();
  zoneFx.get(ring[k]).flash = 1;
  spokes[k].uniforms.uOpacity.value = 3;
}

$('apply').onclick = applyPrompt;
promptEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { applyPrompt(); promptEl.blur(); } });
$('step').onclick = () => generateOne();
$('sentence').onclick = generateSentence;

bus.on('tokens', () => { renderOutput(); current.refresh?.(panelBody); });
bus.on('dist', () => { current.refresh?.(panelBody); });
bus.on('window', () => { recomputeDist(); renderOutput(); bus.emit('tokens', { appended: null, windowOnly: true }); });

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (e.key >= '0' && e.key <= '8') { stopTour(); goTo(order[Number(e.key)]); }
  else if (e.key === ' ') { e.preventDefault(); generateOne(); }
  else if (e.key === 'ArrowRight') { stopTour(); step(1); }
  else if (e.key === 'ArrowLeft') { stopTour(); step(-1); }
  else if (e.key === 'o' || e.key === 'O') { stopTour(); overview(); }
});

// ---------------------------------------------------------------------------
// Zeiger: Klicken & Hover
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tooltipEl = $('tooltip');
function pick(x, y) {
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  clickables = clickables.filter((o) => { let p = o; while (p) { if (p === scene) return true; p = p.parent; } return false; });
  const hits = raycaster.intersectObjects(clickables.filter(inSceneAndVisible), false);
  return hits[0] || null;
}
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || e.button !== 0) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  const hit = pick(e.clientX, e.clientY);
  if (hit) hit.object.userData.onClick?.(hit);
});
let hoverQueued = null;
canvas.addEventListener('pointermove', (e) => { hoverQueued = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerleave', () => { hoverQueued = null; tooltipEl.style.opacity = 0; });
function processHover() {
  if (!hoverQueued) return;
  const { x, y } = hoverQueued;
  hoverQueued = null;
  const hit = pick(x, y);
  canvas.style.cursor = hit ? 'pointer' : '';
  const tip = hit?.object.userData.tooltip;
  if (tip) {
    tooltipEl.textContent = typeof tip === 'function' ? tip() : tip;
    tooltipEl.style.left = x + 14 + 'px';
    tooltipEl.style.top = y + 14 + 'px';
    tooltipEl.style.opacity = 1;
  } else tooltipEl.style.opacity = 0;
}

// Die Bildmitte wird nach links verschoben, damit die Szene nicht hinter dem Panel liegt.
function updateViewOffset() {
  const W = window.innerWidth, H = window.innerHeight;
  const panelOpen = !$('panel').classList.contains('collapsed') && W > 980;
  const d = panelOpen ? 200 : 0;
  camera.aspect = (W + 2 * d) / H;
  if (d) camera.setViewOffset(W + 2 * d, H, 2 * d, 0, W, H);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  updateViewOffset();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
updateViewOffset();

// ---------------------------------------------------------------------------
// Animations-Schleife
// ---------------------------------------------------------------------------
// Detail-Labels entfernter Zonen ausblenden, globale Hinweise nur aus der Ferne zeigen.
const tmpW = new THREE.Vector3();
function fadeLabels() {
  scene.traverse((o) => {
    if (!o.isSprite || !o.userData.isLabel) return;
    const d = camera.position.distanceTo(o.getWorldPosition(tmpW));
    if (o.userData.title) {
      // Aus der Ferne groß (Orientierung), in einer Zone dezent; fremde Titel treten zurück.
      const own = o.userData.zone === current;
      const high = camera.position.y > 60;
      o.scale.copy(o.userData.baseScale).multiplyScalar(U.clamp(d / 85, 0.42, high ? 2.6 : own ? 1.8 : 0.6));
      o.material.opacity = own || high ? 1 : 0.55;
      return;
    }
    if (o.userData.keep) return;
    const f = o.userData.global
      ? (current === hub ? 1 : U.clamp((camera.position.y - 40) / 25, 0, 1)) // nur aus der Vogelperspektive
      : 1 - U.clamp((d - 62) / 33, 0, 1);
    o.material.opacity = o.userData.baseOpacity * f;
    o.visible = f > 0.01;
  });
}

const clock = new THREE.Clock();
let introSpin = true;
let hoverTick = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  U.tickAnims(performance.now());
  U.tickFlowMaterials(t);
  ground.material.uniforms.uTime.value = t;

  if (introSpin) {
    const a = t * 0.05;
    camera.position.set(Math.sin(a) * 520, 300, Math.cos(a) * 520);
    controls.target.set(0, 0, 0);
  }
  controls.update();

  // Token-Teilchen im Ring
  for (let i = 0; i < flow.n; i++) {
    const u = (flow.phase[i] + t * flow.spd[i]) % 1;
    ringCurve.getPointAt(u, tmpV);
    tmpV.y += 0.7 + Math.sin(t * 3 + i) * 0.25;
    tmpQ.setFromEuler(tmpE.set(t + i, t * 0.7 + i, 0));
    tmpM.compose(tmpV, tmpQ, tmpS);
    flow.mesh.setMatrixAt(i, tmpM);
  }
  flow.mesh.instanceMatrix.needsUpdate = true;

  // Datenstaub
  const p = dust.pos;
  for (let i = 0; i < dust.n; i++) {
    p[i * 3 + 1] += dust.speed[i] * dt;
    if (p[i * 3 + 1] > 90) p[i * 3 + 1] = 0;
  }
  dust.pts.geometry.attributes.position.needsUpdate = true;

  // Komet-Schweif
  if (comet.visible) {
    trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    trailPos.set([comet.position.x, comet.position.y, comet.position.z], 0);
    trailGeo.attributes.position.needsUpdate = true;
    comet.children[1].scale.setScalar(7 + Math.sin(t * 20) * 1.2);
  }
  trail.visible = comet.visible;

  // Zonen-Effekte
  for (const [z, fx] of zoneFx) {
    fx.flash = Math.max(0, fx.flash - dt * 1.2);
    const glow = 1 + fx.flash * 2.5 + (z === current ? 0.6 + 0.4 * Math.sin(t * 3) : 0);
    fx.rimMat.color.copy(fx.base).multiplyScalar(glow);
    fx.innerMat.opacity = 0.2 + fx.flash * 0.6;
    z.update?.(t, dt, z === current);
  }
  for (const s of spokes) s.uniforms.uOpacity.value = U.damp(s.uniforms.uOpacity.value, 0.8, 2, dt);

  if (++hoverTick % 3 === 0) processHover();
  if (hoverTick % 8 === 0) fadeLabels();
  composer.render();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function start() {
  try {
    await Promise.race([document.fonts?.ready, U.wait(1.5)]);
  } catch { /* Schriften optional */ }
  applyPrompt();
  renderPanel();
  updateNav();
  updateButtons();
  window.__llmWorldReady = true;
  const enter = $('enter');
  enter.disabled = false;
  enter.textContent = 'Welt betreten ✦';
  enter.onclick = () => {
    $('splash').classList.add('hidden');
    introSpin = false;
    goTo(hub, { duration: 3.6 });
  };
  if (new URLSearchParams(location.search).has('skipintro')) enter.onclick();
}
frame();
start();

// Für Tests/Debugging
window.__llmWorld = { state, goTo, order, generateOne, overview, camera, controls };

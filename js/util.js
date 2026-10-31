import * as THREE from 'three';
import { hashStr } from './model.js';

export const FONT = '"Space Grotesk", "Inter", system-ui, sans-serif';

// --- Text als Textur -------------------------------------------------------------
function textCanvas(text, { px = 64, color = '#eef1fb', bg = null, border = null, weight = 700, pad = 0.35, glow = 0 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `${weight} ${px}px ${FONT}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + px * pad * 2);
  const h = Math.ceil(px * 1.45);
  c.width = Math.max(4, w);
  c.height = h;
  ctx.font = font;
  if (bg) {
    const r = h * 0.28;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(2, 2, c.width - 4, h - 4, r);
    ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = Math.max(2, px / 16); ctx.stroke(); }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, h / 2 + px * 0.04);
  return c;
}

/** Billboard-Text, der immer zur Kamera zeigt. size = Höhe in Welt-Einheiten. */
export function makeLabel(text, opts = {}) {
  const { size = 1, opacity = 1, depthTest = true } = opts;
  const canvas = textCanvas(String(text), opts);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, opacity });
  const s = new THREE.Sprite(mat);
  s.scale.set(size * (canvas.width / canvas.height), size, 1);
  s.renderOrder = 10;
  s.userData.isLabel = true;      // wird nach Entfernung ein-/ausgeblendet (main.js)
  s.userData.baseOpacity = opacity;
  return s;
}

/** Flacher Text (fest im Raum, z. B. auf Blöcken oder Tafeln). */
export function makeTextPlane(text, opts = {}) {
  const { size = 1, opacity = 1, side = THREE.FrontSide } = opts;
  const canvas = textCanvas(String(text), opts);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity, side });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size * (canvas.width / canvas.height), size), mat);
  return m;
}

/** Leinwand-Tafel, deren Inhalt man frei zeichnen kann (z. B. Lernkurve). */
export function makeCanvasBoard(w, h, pxPerUnit = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * pxPerUnit);
  canvas.height = Math.round(h * pxPerUnit);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  return { mesh, canvas, ctx: canvas.getContext('2d'), tex };
}

// --- Leuchtpunkte -------------------------------------------------------------------
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function makeGlow(color, size = 2, opacity = 1) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// --- Fließ-Shader (Datenströme auf Röhren) ----------------------------------------
const flowMaterials = new Set();
export function flowMaterial(color, { opacity = 0.9, speed = 1, repeat = 12, base = 0.18 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uRepeat: { value: repeat },
      uBase: { value: base },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uOpacity, uSpeed, uRepeat, uBase;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float f = fract(vUv.x * uRepeat - uTime * uSpeed);
        float pulse = smoothstep(0.0, 0.15, f) * (1.0 - smoothstep(0.15, 0.6, f));
        float a = (uBase + pulse) * uOpacity;
        gl_FragColor = vec4(uColor * (0.6 + pulse * 1.6), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  flowMaterials.add(mat);
  mat.addEventListener('dispose', () => flowMaterials.delete(mat));
  return mat;
}
export function tickFlowMaterials(t) {
  for (const m of flowMaterials) m.uniforms.uTime.value = t;
}

// --- Plattform für jede Zone -----------------------------------------------------------
export function makePlatform(color, radius = 16) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.06, 1.4, 6, 1),
    new THREE.MeshStandardMaterial({ color: 0x0b1024, metalness: 0.6, roughness: 0.45, flatShading: true })
  );
  base.position.y = -0.7;
  base.rotation.y = Math.PI / 6;
  g.add(base);

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.96, 6),
    new THREE.MeshStandardMaterial({ color: 0x0e1530, metalness: 0.3, roughness: 0.8 })
  );
  top.rotation.x = -Math.PI / 2;
  top.rotation.z = Math.PI / 6;
  top.position.y = 0.01;
  g.add(top);

  const rimMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.0, 0.12, 6, 6), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = Math.PI / 6;
  rim.position.y = 0.05;
  g.add(rim);

  const innerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25 });
  const inner = new THREE.Mesh(new THREE.RingGeometry(radius * 0.55, radius * 0.56, 64), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.03;
  g.add(inner);

  g.userData = { base, rimMat, innerMat };
  return g;
}

// --- Kleinkram ----------------------------------------------------------------------------
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map && m.map !== glowTex) m.map.dispose();
      m.dispose();
    }
  });
}

export function clearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

export function tokenColor(key) {
  const h = (hashStr(key) % 360) / 360;
  return new THREE.Color().setHSL(h, 0.75, 0.58);
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const fmtPct = (p) => (p * 100 >= 10 ? (p * 100).toFixed(0) : (p * 100).toFixed(1)).replace('.', ',') + ' %';

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function hex(c) { return '#' + new THREE.Color(c).getHexString(); }

/** Ein einfacher Animations-Planer: anim(dauer, fn(t)) -> Promise. */
const anims = new Set();
export function animate(duration, fn) {
  return new Promise((resolve) => anims.add({ t0: performance.now(), duration: duration * 1000, fn, resolve }));
}
export function tickAnims(now) {
  for (const a of anims) {
    const t = clamp((now - a.t0) / a.duration, 0, 1);
    a.fn(t);
    if (t >= 1) { anims.delete(a); a.resolve(); }
  }
}
export const wait = (s) => animate(s, () => {});

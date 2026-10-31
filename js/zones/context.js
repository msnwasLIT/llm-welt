// Station 7 – Kontext-Förderband: Das neue Token wird angehängt, das Fenster wandert weiter.
export function createContext(ctx) {
  const { THREE, U, state, bus } = ctx;
  const color = 0x4ade80;
  const group = new THREE.Group();
  const SHOW = 16;
  const STEP = 1.75;
  const RIGHT = 12.6;

  const belt = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 3.2), new THREE.MeshStandardMaterial({ color: 0x0b1a1a, metalness: 0.6, roughness: 0.4 }));
  belt.position.set(0, 0.7, 0);
  group.add(belt);
  const beltFlow = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.8), U.flowMaterial(color, { repeat: 18, speed: -0.5, opacity: 0.45, base: 0.06 }));
  beltFlow.rotation.x = -Math.PI / 2;
  beltFlow.position.set(0, 1.02, 0);
  group.add(beltFlow);
  for (const x of [-15, 15]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.3, 20), new THREE.MeshStandardMaterial({ color: 0x1d3b33, metalness: 0.8, roughness: 0.3 }));
    roller.rotation.x = Math.PI / 2;
    roller.position.set(x, 0.7, 0);
    group.add(roller);
  }
  const pit = U.makeLabel('vergessen …', { size: 0.8, px: 48, color: '#7c8aa8' });
  pit.position.set(-14.5, 3.2, 0);
  group.add(pit);

  // Fensterrahmen
  const frameMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) });
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 2.6, 2.6)), frameMat);
  frame.position.set(0, 2.15, 0);
  group.add(frame);
  let frameLabel = null;
  let frameTarget = { x: 0, w: 1 };

  // Rückkopplungs-Pfeil (zeigt in Richtung Tokenizer = nächste Station im Ring)
  const arrowCurve = new THREE.CubicBezierCurve3(new THREE.Vector3(RIGHT, 3.6, 0), new THREE.Vector3(RIGHT + 1.5, 9, 0), new THREE.Vector3(RIGHT + 5, 10, -2), new THREE.Vector3(RIGHT + 6.5, 6, -4));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(arrowCurve, 40, 0.2, 8, false), U.flowMaterial(0x7dd3fc, { repeat: 5, speed: 1.4, opacity: 1 })));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dd3fc).multiplyScalar(2) }));
  head.position.copy(arrowCurve.getPoint(1));
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowCurve.getTangent(1).normalize());
  group.add(head);
  const loopL = U.makeLabel('↺ zurück zu Station 1', { size: 0.85, px: 50, color: '#bfe9ff', bg: 'rgba(8,20,32,0.75)' });
  loopL.position.set(RIGHT + 3.5, 11.2, -1.5);
  group.add(loopL);

  const cubesRoot = new THREE.Group();
  group.add(cubesRoot);
  const meshes = new Map(); // Token-Objekt -> { g, target, outside, mat }
  let counter = null;

  function makeCube(t) {
    const col = U.tokenColor(t.key);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.35, transparent: true });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mat));
    const txt = U.makeTextPlane(t.text, { size: 0.62, px: 70, color: '#061018' });
    if (txt.geometry.parameters.width > 1.4) txt.scale.setScalar(1.4 / txt.geometry.parameters.width);
    txt.position.z = 0.76;
    g.add(txt);
    if (t.gen) {
      const star = U.makeLabel('neu', { size: 0.42, px: 36, color: '#ffffff', bg: 'rgba(74,222,128,0.9)' });
      star.position.set(0, 1.15, 0.5);
      g.add(star);
    }
    return { g, mat, col, target: new THREE.Vector3(), outside: false, drop: 0 };
  }

  function rebuild(info) {
    const all = state.tokens;
    const view = all.slice(-SHOW);
    const wStart = all.length - state.ctxWindow;
    const keep = new Set(view);
    for (const [t, m] of meshes) if (!keep.has(t)) { cubesRoot.remove(m.g); U.disposeObject(m.g); meshes.delete(t); }
    const off = all.length - view.length;
    view.forEach((t, i) => {
      let m = meshes.get(t);
      const x = RIGHT - (view.length - 1 - i) * STEP;
      if (!m) {
        m = makeCube(t);
        meshes.set(t, m);
        cubesRoot.add(m.g);
        m.g.position.set(x, 1.75, 0);
        if (info?.appended === t) { m.g.position.y = 12; m.drop = 1; }
      }
      m.target.set(x, 1.75, 0);
      m.outside = off + i < wStart;
    });
    const inWin = Math.min(state.ctxWindow, view.length);
    frameTarget = { x: RIGHT - ((inWin - 1) * STEP) / 2, w: Math.max(1, inWin * STEP + 0.3) };
    if (frameLabel) { group.remove(frameLabel); U.disposeObject(frameLabel); }
    frameLabel = U.makeLabel(`Kontextfenster: ${state.ctxWindow} Tokens`, { size: 0.8, px: 50, color: '#d1fae5', bg: 'rgba(6,28,18,0.8)' });
    frameLabel.position.set(frameTarget.x, 4.3, 0);
    group.add(frameLabel);
    if (counter) { group.remove(counter); U.disposeObject(counter); }
    const gen = all.filter((t) => t.gen).length;
    counter = U.makeLabel(`${all.length} Tokens im Gespräch · ${gen} davon selbst erzeugt`, { size: 1.0, px: 56, color: '#eafff2', bg: 'rgba(6,20,14,0.75)' });
    counter.position.set(0, 8.5, -3);
    group.add(counter);
  }

  bus.on('tokens', rebuild);

  return {
    id: 'context', name: 'Kontext-Förderband', short: 'Kontext', icon: '🔁', color, radius: 17, titleY: 13,
    subtitle: 'Das neue Token wird angehängt – und alles beginnt von vorn',
    group,
    cam: { pos: new THREE.Vector3(2, 7.5, 22), target: new THREE.Vector3(2, 3.8, 0) },
    update(t, dt) {
      frame.position.x = U.damp(frame.position.x, frameTarget.x, 6, dt);
      frame.scale.x = U.damp(frame.scale.x, frameTarget.w, 6, dt);
      frameMat.color.set(color).multiplyScalar(1.4 + Math.sin(t * 3) * 0.4);
      for (const m of meshes.values()) {
        m.g.position.x = U.damp(m.g.position.x, m.target.x, 4, dt);
        if (m.drop > 0) {
          m.drop = Math.max(0, m.drop - dt * 1.4);
          m.g.position.y = m.target.y + (m.drop > 0 ? Math.abs(Math.cos((1 - m.drop) * Math.PI * 2.2)) * 10 * m.drop * m.drop : 0);
          m.g.rotation.y = m.drop * 6;
        } else {
          const ty = m.outside ? 1.35 : 1.75;
          m.g.position.y = U.damp(m.g.position.y, ty, 5, dt);
          m.g.rotation.z = U.damp(m.g.rotation.z, m.outside ? 0.25 : 0, 4, dt);
        }
        m.mat.opacity = U.damp(m.mat.opacity, m.outside ? 0.3 : 1, 4, dt);
        m.mat.emissiveIntensity = m.outside ? 0.05 : 0.35;
      }
    },
    panel() {
      return `
        <p>Das gezogene Token wird hinten an den Text <b>angehängt</b>. Dann läuft der <b>gesamte</b> Text erneut durch alle Stationen, um das
        <i>übernächste</i> Token zu bestimmen – und so weiter. Diese Schleife heißt <b>autoregressive Generierung</b>: Das Modell schreibt Token für Token
        und liest dabei immer seine eigene bisherige Ausgabe mit.</p>
        <p>Das <b>Kontextfenster</b> (grüner Rahmen) ist das Kurzzeitgedächtnis: Nur was darin liegt, kann das Modell „sehen“. Alles links davon ist vergessen.</p>
        <div class="box try">
          <div class="slider"><span>Größe des Kontextfensters</span><span class="val" id="cx-val">${state.ctxWindow}</span>
            <input type="range" id="cx-win" min="3" max="16" step="1" value="${state.ctxWindow}"></div>
          <p class="muted">Mach das Fenster klein und erzeuge ein paar Tokens: Die Attention-Arena und der Turm zeigen nur noch, was im Fenster liegt.</p>
          <div class="row"><button class="chip primary" id="cx-gen">▶ Nächstes Token</button></div>
        </div>
        <div class="box real">Moderne LLMs haben Kontextfenster von vielen Tausend bis zu Hunderttausenden Tokens oder mehr – ganze Bücher passen hinein.
        Damit nicht bei jedem Token alles neu berechnet werden muss, speichern sie Zwischenergebnisse der Attention (<b>KV-Cache</b>).
        Ein Chat ist übrigens genau das: Deine Nachrichten und die Antworten stehen gemeinsam im Kontext.</div>
        <div class="box simple">Unser Mini-Modell sagt nur anhand der letzten 2 Tokens voraus. Echte LLMs nutzen über Attention den gesamten Kontext.</div>`;
    },
    bind(root) {
      const s = root.querySelector('#cx-win');
      s.oninput = () => {
        state.ctxWindow = Number(s.value);
        root.querySelector('#cx-val').textContent = s.value;
        bus.emit('window');
      };
      root.querySelector('#cx-gen').onclick = () => ctx.generateOne();
    },
  };
}

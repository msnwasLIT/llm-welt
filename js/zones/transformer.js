// Station 5 – Transformer-Turm: Schicht für Schicht wird jeder Token-Vektor angereichert.
export function createTransformer(ctx) {
  const { THREE, M, U, bus } = ctx;
  const color = 0x60a5fa;
  const group = new THREE.Group();
  const L = 6;
  const Y0 = 1.8, DY = 2.95;
  const SPACING = 1.5;
  const NEUR = 12; // 4 x 3 Neuronen pro Schicht

  const ROLES = [
    ['Schicht 1–2: Bausteine', 'Frühe Schichten erkennen lokale Muster: Wortarten, welche Wörter zusammengehören, einfache Grammatik.'],
    ['Schicht 1–2: Bausteine', 'Frühe Schichten erkennen lokale Muster: Wortarten, welche Wörter zusammengehören, einfache Grammatik.'],
    ['Schicht 3–4: Bedeutung', 'Mittlere Schichten verknüpfen Bedeutungen: Wer tut was? Worauf bezieht sich „sie“? Hier wird viel Weltwissen abgerufen.'],
    ['Schicht 3–4: Bedeutung', 'Mittlere Schichten verknüpfen Bedeutungen: Wer tut was? Worauf bezieht sich „sie“? Hier wird viel Weltwissen abgerufen.'],
    ['Schicht 5–6: Vorhersage', 'Späte Schichten formen den Vektor des letzten Tokens zu einer konkreten Erwartung: Welches Token kommt als Nächstes?'],
    ['Schicht 5–6: Vorhersage', 'Späte Schichten formen den Vektor des letzten Tokens zu einer konkreten Erwartung: Welches Token kommt als Nächstes?'],
  ];

  // Statischer Rahmen: Schichtplatten, Neuronen, Beschriftungen
  const slabs = [];
  for (let l = 0; l < L; l++) {
    const y = Y0 + l * DY;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(17, 0.16, 5.6),
      new THREE.MeshStandardMaterial({ color: 0x101a40, emissive: color, emissiveIntensity: 0.05, transparent: true, opacity: 0.55, roughness: 0.3, metalness: 0.4 })
    );
    plate.position.y = y;
    group.add(plate);
    const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), edgeMat);
    edges.position.y = y;
    group.add(edges);
    const lbl = U.makeLabel(`Schicht ${l + 1}`, { size: 0.75, px: 48, color: '#cfe0ff', bg: 'rgba(8,14,40,0.75)' });
    lbl.position.set(-10.3, y + 0.5, 0);
    group.add(lbl);
    ctx.clickable(plate, () => selectLayer(l + 1), `Schicht ${l + 1} – klicken für Details`);
    slabs.push({ plate, edgeMat, y, lbl });
  }
  const neurons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), L * NEUR);
  {
    const m = new THREE.Matrix4();
    for (let l = 0; l < L; l++) for (let k = 0; k < NEUR; k++) {
      m.makeTranslation(7.2 + (k % 4) * 0.55, Y0 + l * DY + 0.45 + Math.floor(k / 4) * 0.5, -1 + (k % 2) * 0.4);
      neurons.setMatrixAt(l * NEUR + k, m);
      neurons.setColorAt(l * NEUR + k, new THREE.Color(0.2, 0.3, 0.6));
    }
  }
  group.add(neurons);
  const ffnL = U.makeLabel('Feed-Forward-Neuronen', { size: 0.6, px: 40, color: '#bfdbfe' });
  ffnL.position.set(8, Y0 + L * DY + 0.2, -0.8);
  group.add(ffnL);
  const inL = U.makeLabel('⬆ Eingang: Token-Vektoren + Position', { size: 0.8, px: 50, color: '#d6e6ff', bg: 'rgba(8,14,40,0.7)' });
  inL.position.set(0, 0.6, 4.4);
  group.add(inL);
  const outL = U.makeLabel('⬆ Ausgang → Wahrscheinlichkeiten für das nächste Token', { size: 0.8, px: 50, color: '#fde68a', bg: 'rgba(30,24,8,0.75)' });
  outL.position.set(0, Y0 + L * DY + 1.4, 0);
  group.add(outL);

  // Dynamisch: Token-Würfel, Residual-Strom, Attention-Bögen
  const dyn = new THREE.Group();
  group.add(dyn);
  let cubes = [];      // [l][k] -> { mesh, mat }
  let arcMats = [];
  let selected = 0;
  let wave = { phase: -2, speed: 1.1, fast: false };

  function rebuild() {
    U.clearGroup(dyn);
    cubes = [];
    arcMats = [];
    const toks = ctx.windowTokens(8);
    const n = toks.length;
    const xs = toks.map((_, k) => (k - (n - 1) / 2) * SPACING - 1.2);
    toks.forEach((t, k) => {
      const curve = new THREE.LineCurve3(new THREE.Vector3(xs[k], 0.2, 0.9), new THREE.Vector3(xs[k], Y0 + L * DY + 0.3, 0.9));
      dyn.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.07, 6, false), U.flowMaterial(U.tokenColor(t.key), { repeat: 8, speed: 0.9, opacity: 0.9 })));
    });
    const r = M.rng(M.hashStr(toks.map((t) => t.key).join(' ')));
    for (let l = 0; l < L; l++) {
      const row = [];
      toks.forEach((t, k) => {
        const base = U.tokenColor(t.key);
        const hsl = {}; base.getHSL(hsl);
        // Symbolische "Anreicherung": Farbe driftet mit jeder Schicht, letzter Token Richtung Gold
        const drift = (r() - 0.5) * 0.25 * l;
        const c = new THREE.Color().setHSL((hsl.h + drift + 1) % 1, 0.75, 0.55);
        if (k === n - 1) c.lerp(new THREE.Color(0xfacc15), l / (L - 1));
        const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.35 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mat);
        mesh.position.set(xs[k], Y0 + l * DY + 0.65, 0.9);
        ctx.clickable(mesh, () => selectLayer(l + 1), `„${t.text}“ in Schicht ${l + 1}`);
        dyn.add(mesh);
        row.push({ mesh, mat, phase: r() * 6 });
      });
      cubes.push(row);
      // Attention-Bögen innerhalb der Schicht: letzter Token blickt zurück
      for (let k = 0; k < n - 1; k++) {
        if (r() < 0.35) continue;
        const a = new THREE.Vector3(xs[k], Y0 + l * DY + 1.15, 0.9);
        const b = new THREE.Vector3(xs[n - 1], Y0 + l * DY + 1.15, 0.9);
        const c = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.5 + 0.12 * (n - k), 0));
        const mat = U.flowMaterial(M.HEADS[(l + k) % 3].color, { repeat: 3, speed: 1.4, opacity: 0.5 });
        arcMats.push(mat);
        dyn.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 20, 0.035, 5, false), mat));
      }
    }
  }

  function selectLayer(l) {
    selected = l;
    const el = document.getElementById('tf-layer');
    if (el) el.value = String(l);
    const v = document.getElementById('tf-val');
    if (v) v.textContent = l || '–';
    const out = document.getElementById('tf-role');
    if (out) out.innerHTML = roleHtml();
    if (l) ctx.toast(`Schicht ${l}: ${ROLES[l - 1][0].split(': ')[1]}`);
  }
  function roleHtml() {
    if (!selected) return '<p class="muted">Schieb den Regler oder klicke eine Schicht an.</p>';
    const [t, d] = ROLES[selected - 1];
    return `<p><b>${t}</b><br>${d}</p>`;
  }

  bus.on('tokens', rebuild);
  const tmpC = new THREE.Color();

  return {
    id: 'transformer', name: 'Transformer-Turm', short: 'Schichten', icon: '🏛️', color, radius: 16, titleY: 23.5,
    subtitle: 'Viele Schichten aus Attention + Feed-Forward verfeinern das Verständnis',
    group,
    cam: { pos: new THREE.Vector3(0, 11, 40), target: new THREE.Vector3(0, 10, 0) },
    update(t, dt) {
      wave.phase += dt * (wave.fast ? 6 : wave.speed);
      if (wave.phase > L + 2) { wave.phase = -2; wave.fast = false; }
      for (let l = 0; l < L; l++) {
        const w = Math.exp(-Math.pow(l - wave.phase, 2) / 0.6);
        const sel = selected === l + 1;
        const s = slabs[l];
        s.edgeMat.color.set(color).multiplyScalar(0.6 + w * (wave.fast ? 3 : 1.6) + (sel ? 1.5 : 0));
        s.plate.material.opacity = selected && !sel ? 0.25 : 0.55;
        s.plate.material.emissiveIntensity = 0.05 + w * 0.3 + (sel ? 0.25 : 0);
        const row = cubes[l] || [];
        for (const c of row) {
          c.mat.emissiveIntensity = 0.25 + w * (wave.fast ? 1.6 : 0.9) + (sel ? 0.4 : 0);
          c.mesh.rotation.y = t * 0.6 + c.phase;
          c.mesh.position.y = Y0 + l * DY + 0.65 + Math.sin(t * 2 + c.phase) * 0.06;
        }
        for (let k = 0; k < NEUR; k++) {
          const f = 0.5 + 0.5 * Math.sin(t * (3 + (k % 5)) + k * 1.7 + l);
          const act = Math.max(0, f * 0.6 + w * 1.4 - 0.3);
          tmpC.setRGB(0.15 + act * 1.6, 0.3 + act * 1.2, 0.7 + act * 1.8);
          neurons.setColorAt(l * NEUR + k, tmpC);
        }
      }
      neurons.instanceColor.needsUpdate = true;
      for (const m of arcMats) m.uniforms.uOpacity.value = 0.4 + 0.3 * Math.sin(t * 2);
    },
    pulse() { wave = { phase: -1, speed: 1.1, fast: true }; },
    panel() {
      return `
        <p>Jetzt beginnt die eigentliche Denkarbeit. Der Turm besteht aus vielen gleich gebauten <b>Transformer-Blöcken</b>, die übereinander liegen.
        Jeder Token-Vektor wandert von unten nach oben durch alle Schichten – das ist der <b>Residual-Strom</b> (die leuchtenden Säulen).</p>
        <p>In jeder Schicht passieren zwei Dinge:</p>
        <ol>
          <li><b>Attention</b> – die Tokens tauschen Informationen aus (die Bögen, wie in der Arena).</li>
          <li><b>Feed-Forward-Netz</b> – jeder Token-Vektor wird einzeln durch ein Netz aus Neuronen geschickt. Hier steckt ein Großteil des gelernten Wissens.</li>
        </ol>
        <p>Jede Schicht <b>addiert</b> nur ihre Erkenntnisse zum Vektor, statt ihn zu ersetzen. So wird er Schicht für Schicht reicher – oben ist im Vektor des
        letzten Tokens (golden) alles gebündelt, was für die Vorhersage nötig ist.</p>
        <div class="box try">
          <div class="slider"><span>Schicht untersuchen</span><span class="val" id="tf-val">${selected || '–'}</span>
          <input type="range" id="tf-layer" min="0" max="6" step="1" value="${selected}"></div>
          <div id="tf-role">${roleHtml()}</div>
        </div>
        <div class="box real">GPT-3 hat 96 solcher Schichten und 175 Milliarden Parameter; neuere Modelle sind teils noch größer.
        Forschende können manche Neuronen deuten („reagiert auf Städtenamen“), die meisten Rollen sind aber verteilt und schwer zu durchschauen.</div>
        <div class="box simple">Die Farben der Würfel sind symbolisch: Echte Zwischenzustände sind Vektoren mit Tausenden Zahlen. Die Schichtrollen sind grobe Tendenzen aus der Forschung.</div>`;
    },
    bind(root) {
      const s = root.querySelector('#tf-layer');
      s.oninput = () => {
        selected = Number(s.value);
        root.querySelector('#tf-val').textContent = selected || '–';
        root.querySelector('#tf-role').innerHTML = roleHtml();
      };
    },
  };
}

// Station 3 – Positions-Wellen: Jedes Token bekommt einen "Positions-Fingerabdruck".
export function createPosition(ctx) {
  const { THREE, M, U, bus } = ctx;
  const color = 0x2dd4bf;
  const group = new THREE.Group();
  const SPACING = 3.4;
  const DIMS = 8;
  const WAVES = [
    { dim: 0, color: 0x2dd4bf, label: 'schnelle Welle' },
    { dim: 1, color: 0x60a5fa, label: '' },
    { dim: 2, color: 0xa78bfa, label: 'mittlere Welle' },
    { dim: 4, color: 0xf472b6, label: 'langsame Welle' },
  ];

  const content = new THREE.Group();
  group.add(content);
  let words = [];
  let slotsX = [];
  let scanners = [];
  let shuffled = false;
  let pulseT = 0;

  const peColor = (v) => (v >= 0 ? new THREE.Color(1.0, 0.55, 0.15).multiplyScalar(0.1 + v * 0.8) : new THREE.Color(0.2, 0.7, 1.0).multiplyScalar(0.1 - v * 0.8));

  function rebuild() {
    U.clearGroup(content);
    words = [];
    scanners = [];
    shuffled = false;
    const toks = ctx.windowTokens(8);
    const n = toks.length;
    slotsX = toks.map((_, k) => (k - (n - 1) / 2) * SPACING);
    const xMin = -(Math.max(n, 2) - 1) / 2 * SPACING - 2.2;
    const xMax = -xMin;

    // Dunkle Rückwand, damit die Wellen vor dem hellen Hintergrund lesbar sind
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(xMax - xMin + 5, 7.6), new THREE.MeshBasicMaterial({ color: 0x030a12, transparent: true, opacity: 0.88 }));
    wall.position.set(0, 4.3, -4.3);
    content.add(wall);
    const wallEdge = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3) }));
    wallEdge.position.copy(wall.position);
    content.add(wallEdge);

    // Wellen (feste Sinus-/Kosinusmuster über die Positionen)
    WAVES.forEach((w, j) => {
      const yBase = 2.0 + j * 1.55;
      const pts = [];
      for (let s = 0; s <= 200; s++) {
        const x = THREE.MathUtils.lerp(xMin, xMax, s / 200);
        const pos = x / SPACING + (n - 1) / 2;
        pts.push(new THREE.Vector3(x, yBase + 0.62 * M.positionalEncoding(pos, w.dim, 16), -3.6));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.1, 6, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(w.color).multiplyScalar(1.7) })));
      slotsX.forEach((x, k) => {
        const g = U.makeGlow(w.color, 1.3);
        g.position.set(x, yBase + 0.62 * M.positionalEncoding(k, w.dim, 16), -3.6);
        content.add(g);
      });
      const sc = U.makeGlow(0xffffff, 1.1);
      sc.userData = { curve, speed: 0.08 + j * 0.03 };
      content.add(sc);
      scanners.push(sc);
      if (w.label) {
        const l = U.makeLabel(w.label, { size: 0.6, px: 40, color: '#' + new THREE.Color(w.color).getHexString() });
        l.position.set(xMin - 1.6, yBase, -3.6);
        content.add(l);
      }
    });

    // Positions-Fingerabdrücke (bleiben an ihrem Platz)
    slotsX.forEach((x, k) => {
      for (let i = 0; i < DIMS; i++) {
        const v = M.positionalEncoding(k, i, 16);
        const c = peColor(v);
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: c, emissiveIntensity: 1.0, roughness: 0.5 }));
        tile.position.set(x, 0.45 + i * 0.47, 1.2);
        ctx.clickable(tile, () => ctx.toast(`Position ${k + 1}, Dimension ${i + 1}: Wert ${v.toFixed(2)}`), `Pos ${k + 1} · Dim ${i + 1}: ${v.toFixed(2)}`);
        content.add(tile);
      }
      const pl = U.makeLabel(`Pos ${k + 1}`, { size: 0.65, px: 44, color: '#bff7ee', bg: 'rgba(8,24,30,0.75)' });
      pl.position.set(x, 0.35, 2.7);
      content.add(pl);
      const plus = U.makeLabel('+', { size: 1.1, px: 64, color: '#8ff5e2' });
      plus.position.set(x, 4.65, 1.2);
      content.add(plus);
    });

    // Wort-Würfel (können vertauscht werden)
    toks.forEach((t, k) => {
      const col = U.tokenColor(t.key);
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.35 }));
      g.add(box);
      const txt = U.makeTextPlane(t.text, { size: 0.8, px: 80, color: '#081024' });
      if (txt.geometry.parameters.width > 2.5) txt.scale.setScalar(2.5 / txt.geometry.parameters.width);
      txt.position.z = 0.61;
      g.add(txt);
      g.position.set(slotsX[k], 6.1, 1.2);
      g.userData = { slot: k, seed: k * 1.7 };
      content.add(g);
      words.push(g);
    });

    const lbl = U.makeLabel('Wort-Vektor  +  Positions-Muster  =  Eingabe für das Netz', { size: 0.95, px: 52, color: '#d5fff8', bg: 'rgba(6,20,26,0.7)' });
    lbl.position.set(0, 8.6, 1.2);
    content.add(lbl);
  }

  function shuffle() {
    const n = words.length;
    if (n < 2) return;
    if (shuffled) {
      words.forEach((w, k) => { w.userData.slot = k; });
      shuffled = false;
    } else {
      const perm = [...Array(n).keys()];
      do { for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } }
      while (perm.some((p, i) => p === i) && n > 1 && Math.random() < 0.9);
      words.forEach((w, k) => { w.userData.slot = perm[k]; });
      shuffled = true;
    }
    const st = document.getElementById('pos-state');
    if (st) st.innerHTML = shuffled
      ? '🔀 <b>Vertauscht!</b> Die Wörter sind dieselben, aber jedes trägt jetzt ein anderes Positions-Muster – für das Modell ist das ein anderer Satz.'
      : 'Originale Reihenfolge.';
  }

  bus.on('tokens', rebuild);

  return {
    id: 'position', name: 'Positions-Wellen', short: 'Position', icon: '〰️', color, radius: 17, titleY: 11.8,
    subtitle: 'Woher weiß das Modell, welches Wort zuerst kam?',
    group,
    cam: { pos: new THREE.Vector3(0, 9, 29), target: new THREE.Vector3(0, 4.4, 0) },
    update(t, dt) {
      pulseT = Math.max(0, pulseT - dt);
      words.forEach((w) => {
        const tx = slotsX[w.userData.slot] ?? 0;
        w.position.x = U.damp(w.position.x, tx, 5, dt);
        const moving = Math.abs(w.position.x - tx) > 0.05;
        w.position.y = 6.1 + Math.sin(t * 2 + w.userData.seed) * 0.1 + (moving ? 1.2 : 0) * 0.5;
        w.rotation.y = moving ? Math.sin(t * 10) * 0.15 : 0;
      });
      scanners.forEach((s) => {
        const u = (t * s.userData.speed * (1 + pulseT * 6)) % 1;
        s.position.copy(s.userData.curve.getPointAt(u));
      });
    },
    pulse() { pulseT = 1; },
    panel() {
      return `
        <p>Attention (nächste Station) vergleicht Tokens miteinander – aber von sich aus wüsste sie nicht, <b>in welcher Reihenfolge</b> sie stehen.
        „<i>Hund beißt Mann</i>“ und „<i>Mann beißt Hund</i>“ bestehen aus denselben Wörtern, bedeuten aber Gegenteiliges.</p>
        <p>Darum wird zu jedem Wort-Vektor ein <b>Positions-Muster</b> addiert. Es entsteht aus Sinus- und Kosinus-Wellen unterschiedlicher Geschwindigkeit:
        Jede Position bekommt so einen einzigartigen „Fingerabdruck“ (die farbigen Säulen: orange = positiv, blau = negativ).</p>
        <div class="box try">
          Vertausche die Wörter: Die Fingerabdrücke bleiben an ihrem Platz, die Wörter wandern.
          <div class="row"><button class="chip primary" id="pos-shuffle">🔀 Wörter vertauschen / zurück</button></div>
          <p id="pos-state" class="muted">Originale Reihenfolge.</p>
        </div>
        <div class="formula">PE(pos, 2i) = sin(pos / 10000^(2i/d))<br>PE(pos, 2i+1) = cos(pos / 10000^(2i/d))</div>
        <p class="muted">Schnelle Wellen unterscheiden Nachbarn, langsame Wellen grobe Bereiche – wie Sekunden-, Minuten- und Stundenzeiger einer Uhr.</p>
        <div class="box real">Diese Sinus-Formel stammt aus dem ursprünglichen Transformer-Paper (2017). Viele heutige Modelle nutzen Varianten wie
        <b>RoPE</b>, bei der die Position als <b>Drehung</b> der Vektoren eingebaut wird – die Idee bleibt dieselbe.</div>`;
    },
    bind(root) {
      root.querySelector('#pos-shuffle').onclick = shuffle;
    },
  };
}

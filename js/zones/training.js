// Station 8 – Trainings-Gebirge: Lernen = in der Fehlerlandschaft bergab rollen.
export function createTraining(ctx) {
  const { THREE, M, U } = ctx;
  const color = 0xfb7185;
  const group = new THREE.Group();
  const SIZE = 44, SEG = 120, LIM = 20.5;

  // Fehlerfunktion über zwei "Parameter" (x, z)
  const loss = (x, z) =>
    5.2 + 0.0105 * (x * x + z * z)
    - 3.2 * Math.exp(-((x - 7) ** 2 + (z - 5) ** 2) / 16)
    - 4.8 * Math.exp(-((x + 7) ** 2 + (z + 6) ** 2) / 14)
    - 2.2 * Math.exp(-((x - 3) ** 2 + (z + 11) ** 2) / 7)
    + 0.7 * Math.sin(x * 0.55) * Math.cos(z * 0.5);
  const height = (x, z) => loss(x, z) * 0.85;

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  let minH = Infinity, maxH = -Infinity;
  for (let i = 0; i < pos.count; i++) { const h = height(pos.getX(i), pos.getZ(i)); minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
  const lowC = new THREE.Color(0x0ea5e9), midC = new THREE.Color(0x7c3aed), highC = new THREE.Color(0xfb7185), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = height(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    const f = (h - minH) / (maxH - minH);
    if (f < 0.5) c.copy(lowC).lerp(midC, f * 2); else c.copy(midC).lerp(highC, (f - 0.5) * 2);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, emissive: 0x150a2a, side: THREE.DoubleSide }));
  terrain.position.y = 0.2;
  group.add(terrain);
  const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb3c1, wireframe: true, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false }));
  wire.position.y = 0.23;
  group.add(wire);
  ctx.clickable(terrain, (hit) => {
    const p = terrain.worldToLocal(hit.point.clone());
    restart(U.clamp(p.x, -LIM, LIM), U.clamp(p.z, -LIM, LIM));
    ctx.toast('Neuer Startpunkt gesetzt – die Kugel sucht den Weg nach unten.');
  }, 'Klicken: Kugel hier absetzen');

  // Kugel + Spur
  const ball = new THREE.Group();
  ball.add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 20), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94a, emissiveIntensity: 1.4, roughness: 0.2 })));
  ball.add(U.makeGlow(0xffd36b, 4));
  group.add(ball);
  const TRAIL = 500;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.85, 0.4).multiplyScalar(2) }));
  trail.frustumCulled = false;
  group.add(trail);
  let lossLabel = null;

  // Lernkurve
  const board = U.makeCanvasBoard(16, 9, 40);
  board.mesh.position.set(0, 15.5, -20);
  group.add(board.mesh);
  const STAGES = ['① Vortraining: Billionen Tokens Text – nächstes Token raten', '② Feinabstimmung: Beispiel-Dialoge & Anweisungen', '③ Feedback (z. B. RLHF): Antworten werden bewertet'];

  const sim = { x: 16, z: 15, lr: 0.6, running: true, history: [], acc: 0, done: false, lblT: 0, steps: 0 };
  let trailN = 0;

  function grad(x, z) {
    const e = 0.01;
    return [(loss(x + e, z) - loss(x - e, z)) / (2 * e), (loss(x, z + e) - loss(x, z - e)) / (2 * e)];
  }
  function restart(x, z) {
    const r = Math.random;
    sim.x = x ?? (r() < 0.5 ? -1 : 1) * (12 + r() * 7);
    sim.z = z ?? (r() < 0.5 ? -1 : 1) * (10 + r() * 9);
    sim.history = [];
    sim.done = false;
    sim.steps = 0;
    sim.running = true;
    trailN = 0;
    trailGeo.setDrawRange(0, 0);
    syncButtons();
  }
  function stepGD() {
    const [gx, gz] = grad(sim.x, sim.z);
    const k = 3.2;
    sim.x = U.clamp(sim.x - sim.lr * k * gx, -LIM, LIM);
    sim.z = U.clamp(sim.z - sim.lr * k * gz, -LIM, LIM);
    sim.steps++;
    const L = loss(sim.x, sim.z);
    sim.history.push(L);
    if (sim.history.length > 140) sim.history.shift();
    if (Math.hypot(gx, gz) < 0.004 || sim.steps > 600) sim.done = true;
    if (trailN < TRAIL) {
      trailPos.set([sim.x, height(sim.x, sim.z) + 0.45, sim.z], trailN * 3);
      trailN++;
      trailGeo.setDrawRange(0, trailN);
      trailGeo.attributes.position.needsUpdate = true;
    }
  }

  function drawBoard() {
    const { ctx: g, canvas } = board;
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14,8,28,0.88)';
    g.beginPath(); g.roundRect(0, 0, W, H, 24); g.fill();
    g.strokeStyle = 'rgba(251,113,133,0.6)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ffd1dc'; g.font = `700 30px ${U.FONT}`; g.textAlign = 'left';
    g.fillText('Lernkurve: Fehler pro Schritt', 26, 46);
    const x0 = 60, y0 = H - 150, x1 = W - 26, y1 = 74;
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = `500 20px ${U.FONT}`;
    g.fillText('Fehler', 12, y1 + 6); g.fillText('Trainingsschritte →', x1 - 200, y0 + 30);
    const hs = sim.history;
    if (hs.length > 1) {
      const lo = Math.min(...hs, 0), hi = Math.max(...hs, 1);
      g.strokeStyle = '#ffd36b'; g.lineWidth = 4; g.shadowColor = '#ffd36b'; g.shadowBlur = 12;
      g.beginPath();
      hs.forEach((v, i) => {
        const px = x0 + (i / 139) * (x1 - x0);
        const py = y0 - ((v - lo) / (hi - lo || 1)) * (y0 - y1);
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      });
      g.stroke(); g.shadowBlur = 0;
      g.fillStyle = '#fff'; g.font = `700 26px ${U.FONT}`; g.textAlign = 'right';
      g.fillText(`aktuell: ${hs[hs.length - 1].toFixed(2).replace('.', ',')}`, x1, 46);
    }
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(20, H - 118, W - 40, 2);
    g.font = `600 22px ${U.FONT}`;
    STAGES.forEach((s, i) => { g.fillStyle = ['#ffd1dc', '#fbcfe8', '#e9d5ff'][i]; g.fillText(s, 26, H - 84 + i * 30); });
    board.tex.needsUpdate = true;
  }

  function syncButtons() {
    const b = document.getElementById('tr-run');
    if (b) b.textContent = sim.running ? '⏸ Pause' : '▶ Weiter';
  }

  // Beispielrechnung mit dem echten Mini-Modell
  function exampleHtml() {
    const ctxToks = M.tokenize('die katze sitzt auf der');
    const d = M.predict(ctxToks.map((t) => t.id), { temperature: 1, topK: 8, n: 8 });
    const target = d.top.find((c) => c.text === 'matte');
    const p = target ? target.p : 0.01;
    return `<div class="formula">Kontext: „die katze sitzt auf der“ → richtig wäre „matte“<br>
      Modell sagt: p(matte) = ${U.fmtPct(p)}<br>
      Fehler = −ln(${p.toFixed(3).replace('.', ',')}) = <b>${(-Math.log(p)).toFixed(2).replace('.', ',')}</b><br>
      (bei 100 % wäre der Fehler 0, bei 1 % schon 4,6)</div>`;
  }

  restart();
  drawBoard();

  return {
    id: 'training', name: 'Trainings-Gebirge', short: 'Training', icon: '⛰️', color, radius: 28, titleY: 24,
    subtitle: 'Woher die Parameter kommen: Lernen durch Fehler',
    group,
    cam: { pos: new THREE.Vector3(0, 26, 50), target: new THREE.Vector3(0, 8, -4) },
    update(t, dt, active) {
      if (sim.running && !sim.done) {
        sim.acc += dt;
        while (sim.acc > 0.06) { sim.acc -= 0.06; stepGD(); }
      } else if (sim.done && sim.running) {
        sim.acc += dt;
        if (sim.acc > 3.5) { sim.acc = 0; restart(); }
      }
      const y = height(sim.x, sim.z) + 0.95;
      ball.position.set(U.damp(ball.position.x, sim.x, 12, dt), U.damp(ball.position.y, y, 12, dt), U.damp(ball.position.z, sim.z, 12, dt));
      ball.children[1].scale.setScalar(4 + Math.sin(t * 6) * 0.5);
      sim.lblT -= dt;
      if (sim.lblT <= 0 && active) {
        sim.lblT = 0.25;
        if (lossLabel) { group.remove(lossLabel); U.disposeObject(lossLabel); }
        const L = loss(sim.x, sim.z);
        const Ls = L.toFixed(2).replace('.', ',');
        const msg = !sim.done ? `Fehler ${Ls}` : L < 1.6 ? `Tiefstes Tal gefunden! Fehler ${Ls}` : `Steckt in einem Nebental fest (Fehler ${Ls})`;
        lossLabel = U.makeLabel(msg, { size: 0.9, px: 50, color: '#fff7e0', bg: 'rgba(40,20,4,0.8)' });
        group.add(lossLabel);
        drawBoard();
      }
      if (lossLabel) lossLabel.position.set(ball.position.x, ball.position.y + 2, ball.position.z);
    },
    panel() {
      return `
        <p>Woher kennt das Modell die richtigen Zahlen? Am Anfang sind alle Parameter <b>zufällig</b> – das Modell redet Unsinn. Dann bekommt es
        unvorstellbar viel Text und spielt immer dasselbe Spiel: <b>„Rate das nächste Token!“</b></p>
        <p>Nach jedem Tipp wird gemessen, wie falsch es lag (der <b>Fehler</b> oder <i>Loss</i>). Mit der <b>Backpropagation</b> wird berechnet,
        in welche Richtung jeder einzelne Parameter verändert werden muss, damit der Fehler kleiner wird – und alle werden ein winziges Stück angepasst.</p>
        ${exampleHtml()}
        <p>Stell dir die Fehlerlandschaft als Gebirge vor: Jeder Ort ist eine Einstellung der Parameter, die Höhe ist der Fehler.
        Training heißt, <b>bergab zu rollen</b> (Gradientenabstieg).</p>
        <div class="box try">
          <div class="slider"><span>Lernrate (Schrittgröße)</span><span class="val" id="tr-val">${sim.lr.toFixed(2)}</span>
            <input type="range" id="tr-lr" min="0.05" max="2.5" step="0.05" value="${sim.lr}"></div>
          <div class="row">
            <button class="chip primary" id="tr-run">${sim.running ? '⏸ Pause' : '▶ Weiter'}</button>
            <button class="chip" id="tr-new">🎯 Neuer Zufallsstart</button>
          </div>
          <p class="muted">Klicke aufs Gelände, um die Kugel abzusetzen. Zu kleine Lernrate: quälend langsam. Zu große: Die Kugel springt wild hin und her.
          Und manchmal bleibt sie in einem <b>Nebental</b> (lokales Minimum) hängen.</p>
        </div>
        <div class="box real">Echte Modelle haben nicht 2, sondern <b>Milliarden</b> Parameter – die Landschaft hat also Milliarden Dimensionen.
        Das Training läuft wochenlang auf Tausenden Spezialchips. Danach folgen <b>Feinabstimmung</b> mit Beispiel-Dialogen und <b>Feedback-Training</b>
        (z. B. RLHF), damit aus dem Textvervollständiger ein hilfreicher Assistent wird.</div>`;
    },
    bind(root) {
      const s = root.querySelector('#tr-lr');
      s.oninput = () => { sim.lr = Number(s.value); root.querySelector('#tr-val').textContent = sim.lr.toFixed(2); };
      root.querySelector('#tr-run').onclick = () => { sim.running = !sim.running; syncButtons(); };
      root.querySelector('#tr-new').onclick = () => restart();
    },
  };
}

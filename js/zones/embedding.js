// Station 2 – Embedding-Galaxie: Jedes Token wird zu einem Punkt (Vektor) im Bedeutungsraum.
export function createEmbedding(ctx) {
  const { THREE, M, U, state, bus } = ctx;
  const color = 0xc084fc;
  const group = new THREE.Group();

  const galaxy = new THREE.Group();
  galaxy.position.y = 11.5;
  galaxy.scale.setScalar(0.85);
  group.add(galaxy);
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  // Nebel
  {
    const n = 1400, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), r = M.rng(21);
    for (let i = 0; i < n; i++) {
      const arm = i % 3, d = Math.pow(r(), 0.7) * 17, a = d * 0.35 + (arm * Math.PI * 2) / 3 + r() * 0.6;
      pos.set([Math.cos(a) * d, (r() - 0.5) * 3 * (1 - d / 20), Math.sin(a) * d], i * 3);
      const c = new THREE.Color().setHSL(0.68 + r() * 0.2, 0.8, 0.5 + r() * 0.2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const neb = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, map: U.glowTexture(), vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    neb.name = 'nebula';
    galaxy.add(neb);
  }

  // Achsen
  const axisCol = [0xff6b6b, 0x6bff9e, 0x6bb0ff];
  for (let a = 0; a < 3; a++) {
    const dir = [0, 0, 0]; dir[a] = 1;
    const pts = [v3(dir).multiplyScalar(-15), v3(dir).multiplyScalar(15)];
    galaxy.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: axisCol[a], transparent: true, opacity: 0.35 })));
    const l = U.makeLabel(`Dimension ${a + 1}`, { size: 0.9, px: 44, color: '#' + new THREE.Color(axisCol[a]).getHexString(), opacity: 0.8 });
    l.position.copy(v3(dir).multiplyScalar(16));
    galaxy.add(l);
  }

  // Kategorien
  for (const [key, c] of Object.entries(M.CATEGORIES)) {
    if (key === 'teil') continue;
    const l = U.makeLabel(c.label, { size: 1.5, px: 60, color: '#' + new THREE.Color(c.color).getHexString(), opacity: 0.55 });
    l.position.copy(v3(c.center)).add(new THREE.Vector3(0, 4.3, 0));
    galaxy.add(l);
  }

  // Wort-Sterne
  const stars = new Map();
  const sphereGeo = new THREE.SphereGeometry(0.34, 16, 12);
  function addStar(key, parent) {
    const cat = M.categoryOf(key);
    const c = new THREE.Color(M.CATEGORIES[cat].color);
    const geo = parent === galaxy ? sphereGeo : sphereGeo.clone(); // dynamische Sterne werden später entsorgt
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.3 }));
    mesh.position.copy(v3(M.embed3(key)));
    const label = U.makeLabel(key, { size: 0.72, px: 46, color: '#' + c.clone().lerp(new THREE.Color(1, 1, 1), 0.45).getHexString() });
    label.position.set(0, 0.75, 0);
    mesh.add(label);
    ctx.clickable(mesh, () => select(key), () => `„${key}“ · ${M.CATEGORIES[cat].label}`);
    parent.add(mesh);
    const entry = { mesh, label };
    stars.set(key, entry);
    return entry;
  }
  for (const w of M.WORDS) if (w !== '.') addStar(w, galaxy);

  // Dynamische Teile: unbekannte Tokens, Satzpfad, Auswahl, Analogie
  const extra = new THREE.Group(); galaxy.add(extra);
  const pathGroup = new THREE.Group(); galaxy.add(pathGroup);
  const selGroup = new THREE.Group(); galaxy.add(selGroup);
  const analogyGroup = new THREE.Group(); galaxy.add(analogyGroup);
  let halos = [];
  let selected = null;

  function rebuildPath() {
    for (const k of [...stars.keys()]) {
      if (!M.WORDS.includes(k)) stars.delete(k);
    }
    U.clearGroup(extra);
    U.clearGroup(pathGroup);
    halos = [];
    const toks = ctx.windowTokens(12);
    for (const t of toks) if (!stars.has(t.key) && t.key !== '.') addStar(t.key, extra);
    const pts = toks.filter((t) => t.key !== '.').map((t) => v3(M.embed3(t.key)));
    if (pts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      pathGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 24, 0.09, 6, false), U.flowMaterial(0xffffff, { repeat: pts.length * 2, speed: 1.2, opacity: 1, base: 0.25 })));
    }
    toks.forEach((t, i) => {
      if (t.key === '.') return;
      const h = U.makeGlow(U.tokenColor(t.key), 2.4, 0.9);
      h.position.copy(v3(M.embed3(t.key)));
      h.userData.phase = i * 0.6;
      pathGroup.add(h);
      halos.push(h);
      const num = U.makeLabel(String(i + 1), { size: 0.6, px: 40, color: '#ffffff', bg: 'rgba(192,132,252,0.85)' });
      num.position.copy(h.position).add(new THREE.Vector3(0, -0.75, 0));
      pathGroup.add(num);
    });
  }

  function select(key) {
    selected = key;
    U.clearGroup(selGroup);
    const p = v3(M.embed3(key));
    const ring = U.makeGlow(0xffffff, 3.2);
    ring.position.copy(p);
    selGroup.add(ring);
    const nb = M.neighbors(key, 5);
    const segs = [];
    for (const n of nb) segs.push(p, v3(M.embed3(n.key)));
    selGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2), transparent: true, opacity: 0.85 })));
    const root = document.getElementById('emb-sel');
    if (root) root.innerHTML = selHtml();
  }

  function selHtml() {
    if (!selected) return '<p class="muted">Klicke einen Stern in der Galaxie an, um seine Nachbarn und seinen Vektor zu sehen.</p>';
    const cat = M.CATEGORIES[M.categoryOf(selected)];
    const vec = M.embedVec(selected);
    const nb = M.neighbors(selected, 5);
    return `<p><b>„${U.escapeHtml(selected)}“</b> · <span style="color:${U.hex(cat.color)}">${cat.label}</span></p>
      <p class="muted">Ausschnitt seines Vektors (12 Zahlen):</p>
      <div class="vec">${vec.map((x) => `<span title="${x.toFixed(2)}" style="height:${Math.abs(x) * 100}%;background:${x >= 0 ? '#c084fc' : '#38bdf8'}"></span>`).join('')}</div>
      <p class="muted">Nächste Nachbarn:</p>
      <div class="bars">${nb.map((n) => `<span>${U.escapeHtml(n.key)}</span><div class="bar" style="width:${Math.max(6, 100 - n.d * 9)}%"></div><span class="num">${n.d.toFixed(1)}</span>`).join('')}</div>`;
  }

  async function analogy() {
    U.clearGroup(analogyGroup);
    const P = (k) => v3(M.embed3(k));
    const arrows = [
      [P('mann'), P('könig'), 0xfacc15, 'royal'],
      [P('frau'), P('königin'), 0xfacc15, 'royal'],
      [P('mann'), P('frau'), 0xff5d8f, 'weiblich'],
      [P('könig'), P('königin'), 0xff5d8f, 'weiblich'],
    ];
    const objs = arrows.map(([a, b, c]) => {
      const dir = b.clone().sub(a);
      const len = dir.length();
      const ar = new THREE.ArrowHelper(dir.normalize(), a, 0.01, new THREE.Color(c).multiplyScalar(2), 0.9, 0.5);
      analogyGroup.add(ar);
      return { ar, len };
    });
    const lbl = U.makeLabel('König − Mann + Frau ≈ Königin', { size: 1.3, px: 60, color: '#fff3b0', bg: 'rgba(30,20,8,0.75)' });
    lbl.position.copy(P('königin')).add(new THREE.Vector3(0, 2.4, 0));
    analogyGroup.add(lbl);
    await U.animate(2.2, (t) => objs.forEach(({ ar, len }, i) => {
      const p = U.clamp(t * 2 - i * 0.3, 0.01, 1);
      ar.setLength(Math.max(0.01, len * U.easeInOut(p)), Math.min(0.9, len * p * 0.3 + 0.01), 0.5);
    }));
    select('königin');
    ctx.toast('Gleiche Richtung „männlich → weiblich“: Vektor-Rechnung mit Bedeutungen!', 3600);
  }

  let pulseT = 0;
  bus.on('tokens', rebuildPath);

  return {
    id: 'embedding', name: 'Embedding-Galaxie', short: 'Vektoren', icon: '🌌', color, radius: 19, titleY: 24.5,
    subtitle: 'Tokens werden zu Punkten im Bedeutungsraum',
    group,
    cam: { pos: new THREE.Vector3(20, 15, 37), target: new THREE.Vector3(0, 11, 0) },
    update(t, dt) {
      galaxy.rotation.y += dt * (pulseT > 0 ? 0.6 : 0.05);
      pulseT = Math.max(0, pulseT - dt);
      const nebula = galaxy.getObjectByName('nebula');
      if (nebula) nebula.rotation.y += dt * 0.03;
      halos.forEach((h) => h.scale.setScalar(2 + Math.sin(t * 3 + h.userData.phase) * 0.5 + pulseT * 3));
      if (selGroup.children[0]) selGroup.children[0].scale.setScalar(3 + Math.sin(t * 5) * 0.6);
    },
    pulse() { pulseT = 1.2; },
    panel() {
      return `
        <p>Eine Token-ID wie <code>#6</code> sagt noch nichts über die Bedeutung. Darum schlägt das Modell für jedes Token einen <b>Vektor</b> nach –
        eine lange Liste von Zahlen, das <b>Embedding</b>. Man kann es sich als <b>Koordinate in einem Bedeutungsraum</b> vorstellen.</p>
        <p>Das Besondere: Wörter mit ähnlicher Bedeutung landen <b>nah beieinander</b>. Tiere bilden einen Haufen, Tätigkeiten einen anderen.
        Die weiße Linie zeigt den Weg deines Satzes durch die Galaxie (Nummern = Reihenfolge).</p>
        <div class="box try">
          <b>Wort-Rechnen:</b> Richtungen im Raum tragen Bedeutung. Der Schritt von „Mann“ zu „Frau“ ist derselbe wie von „König“ zu „Königin“.
          <div class="row"><button class="chip primary" id="emb-analogy">👑 König − Mann + Frau = ?</button></div>
          <div id="emb-sel">${selHtml()}</div>
        </div>
        <div class="box real">Echte Embeddings haben <b>Tausende Dimensionen</b> (GPT-3: 12 288), nicht 3. Niemand legt sie von Hand fest:
        Sie entstehen im Training, weil Wörter, die in ähnlichen Zusammenhängen vorkommen, ähnliche Vektoren bekommen.</div>
        <div class="box simple">Unsere Galaxie ist von Hand angeordnet, damit man die Gruppen gut sieht. Das „Wort-Rechnen“ klappt in echten Modellen nur ungefähr.</div>`;
    },
    bind(root) {
      root.querySelector('#emb-analogy').onclick = analogy;
    },
  };
}

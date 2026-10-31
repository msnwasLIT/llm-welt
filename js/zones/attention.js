// Station 4 – Attention-Arena: Jedes Token entscheidet, auf welche früheren Tokens es achtet.
export function createAttention(ctx) {
  const { THREE, M, U, bus } = ctx;
  const color = 0xf72585;
  const group = new THREE.Group();
  const ARC_R = 10;
  const TOP = 2.9;

  const pillarsRoot = new THREE.Group(); group.add(pillarsRoot);
  const beamsRoot = new THREE.Group(); group.add(beamsRoot);
  const matrixRoot = new THREE.Group(); group.add(matrixRoot);
  matrixRoot.position.set(0, 1.6, 9.2);
  matrixRoot.rotation.x = -Math.PI / 2 + 0.45;

  let toks = [];
  let pillars = [];
  let query = -1;
  let head = 'subj'; // Start mit einem Kopf: so sind Strahlen und Prozente gut lesbar
  let weights = {};
  let beamMats = [];
  let flare = 0;

  const arena = new THREE.Mesh(new THREE.RingGeometry(ARC_R - 1.6, ARC_R + 1.6, 64, 1, Math.PI * 0.08, Math.PI * 0.84), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, side: THREE.DoubleSide }));
  arena.rotation.x = -Math.PI / 2; // Bogen liegt hinten, dort wo die Säulen stehen
  arena.position.set(0, 0.05, 3.5);
  group.add(arena);

  function pillarPos(i, n) {
    const span = Math.min(Math.PI * 0.8, 0.32 * Math.max(n - 1, 1));
    const phi = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    return new THREE.Vector3(ARC_R * Math.sin(phi), 0, 3.5 - ARC_R * Math.cos(phi));
  }

  function rebuild() {
    U.clearGroup(pillarsRoot);
    pillars = [];
    toks = ctx.windowTokens(8);
    const n = toks.length;
    query = n - 1;
    weights = {};
    for (const h of M.HEADS) weights[h.id] = M.attention(toks, h.id);
    toks.forEach((t, i) => {
      const col = U.tokenColor(t.key);
      const g = new THREE.Group();
      g.position.copy(pillarPos(i, n));
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.2 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.6, 24), mat);
      mesh.position.y = 1.3;
      g.add(mesh);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8) }));
      cap.position.y = TOP;
      g.add(cap);
      const label = U.makeLabel(t.text, { size: 1.05, px: 64, color: '#ffffff', bg: 'rgba(10,8,30,0.75)', border: col.getStyle() });
      label.position.y = 4.4;
      g.add(label);
      const halo = U.makeGlow(0xffffff, 3.5, 0);
      halo.position.y = TOP;
      g.add(halo);
      ctx.clickable(mesh, () => setQuery(i), `„${t.text}“ – klicken: Worauf achtet dieses Token?`);
      ctx.clickable(label, () => setQuery(i));
      pillarsRoot.add(g);
      pillars.push({ g, mat, halo, label });
    });
    rebuildBeams();
  }

  function setQuery(i) {
    query = i;
    rebuildBeams();
    ctx.toast(`Query: „${toks[i].text}“ – die Strahlen zeigen, woher es Informationen holt.`);
  }

  function setHead(h) {
    head = h;
    rebuildBeams();
  }

  function activeHeads() {
    return head === 'all' ? M.HEADS : M.HEADS.filter((h) => h.id === head);
  }

  function rebuildBeams() {
    U.clearGroup(beamsRoot);
    beamMats = [];
    const n = toks.length;
    if (!n || query < 0) { rebuildMatrix(); return; }
    pillars.forEach((p, i) => { p.halo.material.opacity = i === query ? 0.9 : 0; });
    const heads = activeHeads();
    const qPos = pillarPos(query, n).add(new THREE.Vector3(0, TOP, 0));
    heads.forEach((h, hi) => {
      const row = weights[h.id][query];
      row.forEach((w, j) => {
        if (w < 0.015) return;
        const mat = U.flowMaterial(new THREE.Color(h.color).multiplyScalar(1.25), { repeat: 6, speed: 1.6, opacity: 0.5 + 0.9 * w, base: 0.5 });
        mat.userData.baseOpacity = 0.5 + 0.9 * w;
        beamMats.push(mat);
        if (j === query) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + hi * 0.3, 0.04 + 0.22 * w, 8, 40), mat);
          ring.position.copy(qPos);
          ring.rotation.x = Math.PI / 2;
          beamsRoot.add(ring);
        } else {
          const kPos = pillarPos(j, n).add(new THREE.Vector3(0, TOP, 0));
          const d = kPos.distanceTo(qPos);
          const ctrl = kPos.clone().add(qPos).multiplyScalar(0.5).add(new THREE.Vector3(0, 2.2 + d * 0.32 + hi * 0.9, 0));
          const curve = new THREE.QuadraticBezierCurve3(kPos, ctrl, qPos); // fließt vom Key zur Query
          beamsRoot.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05 + 0.32 * w, 8, false), mat));
          if (heads.length === 1 && w >= 0.04) {
            const l = U.makeLabel(U.fmtPct(w), { size: 0.7, px: 44, color: '#ffffff', bg: 'rgba(40,6,30,0.8)' });
            l.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 0.55, 0));
            beamsRoot.add(l);
          }
        }
      });
    });
    rebuildMatrix();
    const el = document.getElementById('att-weights');
    if (el) el.innerHTML = weightsHtml();
  }

  function rebuildMatrix() {
    U.clearGroup(matrixRoot);
    const n = toks.length;
    if (!n) return;
    const cell = Math.min(0.8, 6 / n);
    const heads = activeHeads();
    const base = new THREE.Color(0x0d0f22);
    const mix = new THREE.Color();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const masked = j > i;
        let w = 0;
        mix.setRGB(0, 0, 0);
        if (!masked) for (const h of heads) { const hw = weights[h.id][i][j]; w += hw / heads.length; mix.add(new THREE.Color(h.color).multiplyScalar(hw / heads.length)); }
        const c = masked ? new THREE.Color(0x05060f) : base.clone().lerp(w > 0 ? mix.clone().multiplyScalar(1 / Math.max(w, 1e-6)) : base, Math.min(1, w * 1.6));
        if (!masked) c.multiplyScalar(0.85 + w * 0.3);
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.92, cell * 0.92), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: masked ? 0.5 : 0.95 }));
        tile.position.set((j - (n - 1) / 2) * cell, -(i - (n - 1) / 2) * cell, 0);
        if (i === query) tile.position.z = 0.05;
        ctx.clickable(tile, () => setQuery(i), masked ? 'Maskiert: kein Blick in die Zukunft' : `„${toks[i].text}“ → „${toks[j].text}“: ${U.fmtPct(w)}`);
        matrixRoot.add(tile);
      }
    }
    const hl = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(cell * n, cell)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2) })
    );
    hl.position.set(0, -(query - (n - 1) / 2) * cell, 0.08);
    matrixRoot.add(hl);
    const title = U.makeLabel('Attention-Matrix (Zeile = Query, Spalte = Key)', { size: 0.55, px: 40, color: '#ffd1ec' });
    title.position.set(0, (n / 2) * cell + 0.6, 0);
    matrixRoot.add(title);
  }

  function weightsHtml() {
    if (query < 0 || !toks.length) return '';
    const heads = activeHeads();
    const row = toks.map((_, j) => heads.reduce((s, h) => s + weights[h.id][query][j], 0) / heads.length);
    return `<p class="muted">„<b>${U.escapeHtml(toks[query].text)}</b>“ achtet auf${heads.length > 1 ? ' (Mittel aller Köpfe)' : ''}:</p>
      <div class="bars">${toks.map((t, j) => `<span>${U.escapeHtml(t.text)}</span><div class="bar${j > query ? ' off' : ''}" style="width:${Math.max(2, row[j] * 100)}%"></div><span class="num">${j > query ? 'Zukunft' : U.fmtPct(row[j])}</span>`).join('')}</div>`;
  }

  bus.on('tokens', rebuild);

  return {
    id: 'attention', name: 'Attention-Arena', short: 'Attention', icon: '🔦', color, radius: 18, titleY: 11,
    subtitle: 'Tokens schauen einander an und tauschen Informationen aus',
    group,
    cam: { pos: new THREE.Vector3(0, 9.5, 25), target: new THREE.Vector3(0, 3.5, -1.5) },
    update(t, dt) {
      flare = Math.max(0, flare - dt * 0.8);
      for (const m of beamMats) m.uniforms.uOpacity.value = m.userData.baseOpacity * (1 + flare * 2);
      pillars.forEach((p, i) => {
        p.mat.emissiveIntensity = 0.35 + (i === query ? 0.5 + Math.sin(t * 4) * 0.2 : 0) + flare * 0.8;
        p.halo.scale.setScalar(3.2 + Math.sin(t * 4) * 0.5);
      });
    },
    pulse() {
      flare = 1;
      if (toks.length && query !== toks.length - 1) { query = toks.length - 1; rebuildBeams(); }
    },
    panel() {
      return `
        <p><b>Attention</b> (Aufmerksamkeit) ist das Herzstück des Transformers. Jedes Token fragt: <i>„Welche anderen Wörter sind gerade wichtig für mich?“</i>
        und holt sich von dort Informationen. So weiß „sitzt“, <b>wer</b> sitzt, und „der“, dass ein Ort folgen könnte.</p>
        <p>Dafür bildet jedes Token drei Vektoren:</p>
        <ul>
          <li><b>Query</b> – wonach ich suche (die Suchanfrage)</li>
          <li><b>Key</b> – was ich anbiete (das Etikett auf dem Buchrücken)</li>
          <li><b>Value</b> – mein eigentlicher Inhalt (das Buch selbst)</li>
        </ul>
        <p>Passt eine Query gut zu einem Key, wird der Strahl dick: Viel vom Value fließt hinüber. Die Gewichte einer Zeile ergeben zusammen immer 100 %.</p>
        <div class="box try">
          <b>Klicke eine Säule</b> an, um zu sehen, worauf dieses Token achtet. Wähle einen Kopf:
          <div class="row" id="att-heads">
            <button class="chip${head === 'all' ? ' on' : ''}" data-h="all">Alle Köpfe</button>
            ${M.HEADS.map((h) => `<button class="chip${head === h.id ? ' on' : ''}" data-h="${h.id}" style="border-color:${U.hex(h.color)}">${h.name}</button>`).join('')}
          </div>
          <p class="muted" id="att-desc">${head === 'all' ? 'Mehrere Köpfe arbeiten parallel – jeder achtet auf etwas anderes.' : M.HEADS.find((h) => h.id === head).name + ' ' + M.HEADS.find((h) => h.id === head).desc}</p>
          <div id="att-weights">${weightsHtml()}</div>
        </div>
        <p><b>Kausale Maske:</b> Ein Token darf nur auf sich selbst und <b>frühere</b> Tokens schauen – nie in die Zukunft. Darum ist die obere rechte Hälfte der Matrix dunkel.</p>
        <div class="formula">Attention(Q,K,V) = softmax(Q·Kᵀ / √d) · V</div>
        <div class="box real">Große Modelle haben Dutzende Köpfe in jeder von Dutzenden Schichten (GPT-3: 96 × 96). Was jeder Kopf beachtet, wird im Training gelernt – manche Köpfe
        verfolgen Grammatik, andere Bezüge („er“ → „der Hund“), andere kopieren Muster aus dem Kontext.</div>
        <div class="box simple">Unsere drei Köpfe sind von Hand gebaut, um typische gelernte Muster zu zeigen.</div>`;
    },
    bind(root) {
      root.querySelectorAll('[data-h]').forEach((b) => {
        b.onclick = () => {
          setHead(b.dataset.h);
          root.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('on', x === b));
          const h = M.HEADS.find((x) => x.id === head);
          root.querySelector('#att-desc').textContent = h ? `${h.name} ${h.desc}` : 'Mehrere Köpfe arbeiten parallel – jeder achtet auf etwas anderes.';
        };
      });
    },
    refresh(root) {
      const el = root.querySelector('#att-weights');
      if (el) el.innerHTML = weightsHtml();
    },
  };
}

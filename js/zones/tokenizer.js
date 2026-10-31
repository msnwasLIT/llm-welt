// Station 1 – Tokenizer-Werkstatt: Text wird in Tokens zerschnitten und bekommt IDs.
export function createTokenizer(ctx) {
  const { THREE, M, U, state, bus } = ctx;
  const color = 0xffb703;
  const group = new THREE.Group();

  // Leuchttafel mit dem Rohtext
  const BW = 26, BH = 4.2;
  const board = U.makeCanvasBoard(BW, BH, 56);
  board.mesh.position.set(0, 9.6, -7);
  group.add(board.mesh);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(BW + 0.4, BH + 0.4, 0.3)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) })
  );
  frame.position.copy(board.mesh.position);
  group.add(frame);
  const backing = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.4, BH + 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x0a0f26, metalness: 0.4, roughness: 0.6 }));
  backing.position.set(0, 9.6, -7.2);
  group.add(backing);
  for (const x of [-11, 11]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 7.6, 10), new THREE.MeshStandardMaterial({ color: 0x1a2350, metalness: 0.7, roughness: 0.3 }));
    post.position.set(x, 3.8, -7.2);
    group.add(post);
  }

  function drawBoard(text) {
    const { ctx: g, canvas } = board;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(8,10,30,0.92)';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(255,183,3,0.65)';
    g.font = `600 22px ${U.FONT}`;
    g.textAlign = 'left';
    g.fillText('ROHTEXT', 18, 32);
    let s = text;
    let px = 74;
    g.font = `700 ${px}px ${U.FONT}`;
    while (g.measureText(s).width > canvas.width - 60 && px > 44) { px -= 4; g.font = `700 ${px}px ${U.FONT}`; }
    while (g.measureText(s).width > canvas.width - 60 && s.length > 4) s = '…' + s.slice(2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ffd166';
    g.shadowBlur = 18;
    g.fillStyle = '#fff4d6';
    g.fillText(s, canvas.width / 2, canvas.height / 2 + 14);
    g.shadowBlur = 0;
    board.tex.needsUpdate = true;
  }

  // Laser-Säge
  const saw = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, BH + 1.2, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.25, 0.2).multiplyScalar(4), toneMapped: false }));
  saw.add(blade);
  saw.add(U.makeGlow(0xff4d3d, 3.5));
  saw.position.set(-BW / 2, 9.6, -6.6);
  saw.visible = false;
  group.add(saw);

  // Förderband
  const belt = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 3.6), new THREE.MeshStandardMaterial({ color: 0x0c1230, metalness: 0.6, roughness: 0.4 }));
  belt.position.set(0, 0.6, 3);
  group.add(belt);
  const beltFlow = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.2), U.flowMaterial(color, { repeat: 16, speed: 0.6, opacity: 0.3, base: 0.05 }));
  beltFlow.rotation.x = -Math.PI / 2;
  beltFlow.position.set(0, 0.92, 3);
  group.add(beltFlow);
  const arrow = U.makeLabel('Text  ✂  Tokens  →  Zahlen (IDs)', { size: 1.4, px: 60, color: '#ffe8b0', bg: 'rgba(8,12,32,0.6)' });
  arrow.position.set(0, 13.2, -7);
  group.add(arrow);

  // Token-Blöcke
  const blocksRoot = new THREE.Group();
  group.add(blocksRoot);
  let blocks = [];
  let cutting = false;

  function rebuild() {
    U.clearGroup(blocksRoot);
    blocks = [];
    const toks = ctx.windowTokens(12);
    drawBoard(M.detokenize(state.tokens.slice(-24)));
    const widths = toks.map((t) => 0.9 + 0.36 * Math.max(1, [...t.text].length));
    const gaps = toks.map((t, i) => (i === 0 ? 0 : t.cont ? 0.14 : 0.5));
    const total = widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
    const s = Math.min(1, 27 / total);
    blocksRoot.scale.setScalar(s);
    blocksRoot.position.set(0, 0, 3);
    let x = -total / 2;
    toks.forEach((t, i) => {
      x += gaps[i];
      const w = widths[i];
      const b = new THREE.Group();
      const col = U.tokenColor(t.key);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 1.7, 1.4),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 })
      );
      b.add(mesh);
      const txt = U.makeTextPlane(t.text, { size: 0.95, px: 84, color: '#081024' });
      txt.position.z = 0.71;
      if (txt.geometry.parameters.width > w - 0.1) txt.scale.setScalar((w - 0.1) / txt.geometry.parameters.width);
      b.add(txt);
      const idl = U.makeTextPlane(`#${t.id}`, { size: 0.6, px: 56, color: '#fff2c9', bg: 'rgba(10,14,36,0.85)' });
      idl.position.set(0, -1.35, 0.75);
      b.add(idl);
      const home = new THREE.Vector3(x + w / 2, 1.85, 0);
      b.position.copy(home);
      b.userData = { home, i, seed: Math.random() * 10 };
      ctx.clickable(mesh, () => ctx.toast(`„${t.text}“ → Token-ID ${t.id}${t.cont ? ' (Teil eines längeren Wortes)' : ''}`), `Token „${t.text}“ · ID ${t.id}`);
      blocksRoot.add(b);
      blocks.push(b);
      x += w;
    });
  }

  let cutRun = 0;
  async function playCut() {
    if (!blocks.length) return;
    const run = ++cutRun;
    const list = blocks;
    cutting = true;
    saw.visible = true;
    const n = list.length;
    const s = blocksRoot.scale.x;
    const total = 0.45 + n * 0.16;
    // Startpunkt jedes Blocks: an seiner Stelle auf der Tafel (in Block-Koordinaten umgerechnet)
    const starts = list.map((b) => new THREE.Vector3(b.userData.home.x * 0.85, 9.6 / s, (-6.4 - 3) / s));
    await U.animate(total + 0.8, (t) => {
      if (run !== cutRun) return;
      const time = t * (total + 0.8);
      saw.position.x = THREE.MathUtils.lerp(-BW / 2, BW / 2, Math.min(1, time / total));
      saw.visible = time < total;
      list.forEach((b, i) => {
        const delay = (i / n) * total;
        const p = U.clamp((time - delay) / 0.75, 0, 1);
        const e = U.easeInOut(p);
        b.position.lerpVectors(starts[i], b.userData.home, e);
        b.position.y += Math.sin(Math.PI * e) * (3 / s);
        b.rotation.x = (1 - e) * Math.PI * 1.5;
        b.scale.setScalar(0.3 + 0.7 * e);
      });
    });
    if (run !== cutRun) return;
    saw.visible = false;
    cutting = false;
  }

  bus.on('tokens', (info) => {
    rebuild();
    if (!info?.appended && !info?.windowOnly) playCut();
  });

  function tokChips(toks) {
    return toks.map((t) => `<span class="tok${t.cont ? ' cont' : ''}" style="background:${U.tokenColor(t.key).getStyle()}">${U.escapeHtml(t.text)}<small>#${t.id}</small></span>`).join('');
  }

  return {
    id: 'tokenizer', name: 'Tokenizer-Werkstatt', short: 'Tokens', icon: '✂️', color, radius: 17, titleY: 16,
    subtitle: 'Text wird in Bausteine zerlegt und in Zahlen übersetzt',
    group,
    cam: { pos: new THREE.Vector3(0, 11, 33), target: new THREE.Vector3(0, 5.2, 0) },
    update(t) {
      if (cutting) return;
      for (const b of blocks) {
        b.position.y = b.userData.home.y + Math.sin(t * 2 + b.userData.seed) * 0.12;
        b.rotation.y = Math.sin(t * 0.8 + b.userData.seed) * 0.08;
      }
    },
    pulse() { rebuild(); playCut(); },
    onEnter() { playCut(); },
    panel() {
      const toks = state.tokens;
      return `
        <p>Ein Sprachmodell kann keine Buchstaben lesen – es rechnet nur mit Zahlen. Darum zerlegt der <b>Tokenizer</b> jeden Text zuerst in
        <b>Tokens</b>: häufige Wörter bleiben ganz, seltene Wörter werden in <b>Teilstücke</b> zerschnitten. Jedes Token hat eine feste Nummer, die <b>Token-ID</b>.</p>
        <h3>Dein Text in Tokens</h3>
        <div id="tk-chips">${tokChips(toks)}</div>
        <p class="muted" id="tk-count">${toks.length} Tokens · Vokabular: ${M.VOCAB.length} Einträge</p>
        <div class="box try">
          Tippe ein beliebiges Wort – auch erfundene oder lange zusammengesetzte Wörter:
          <input id="tk-lab" class="field" value="Donaudampfschifffahrt" spellcheck="false">
          <div class="row">
            ${['Sprachmodell', 'Katzenhaus', 'Weltraumspiel', 'KI 2026!', 'Hallo 😀'].map((w) => `<button class="chip" data-ex="${U.escapeHtml(w)}">${U.escapeHtml(w)}</button>`).join('')}
          </div>
          <div id="tk-lab-out"></div>
        </div>
        <p>Gestrichelte Kante = <b>Fortsetzungs-Token</b>, also ein Teilstück, das an das vorherige anschließt. Wörter, die der Tokenizer gar nicht kennt, zerfallen notfalls in einzelne Buchstaben – so kann jedes Wort dargestellt werden.</p>
        <div class="box real">Echte Tokenizer (z. B. <i>Byte-Pair-Encoding</i>) lernen ihre Bausteine automatisch aus riesigen Textmengen und haben meist
        ca. 30 000 bis 200 000 Tokens im Vokabular. Im Englischen entspricht ein Token grob ¾ Wort; deutsche Wörter werden oft in mehr Stücke zerlegt.
        Auch Leerzeichen, Satzzeichen, Emojis und Programmcode werden zu Tokens.</div>`;
    },
    bind(root) {
      const inp = root.querySelector('#tk-lab');
      const out = root.querySelector('#tk-lab-out');
      const run = () => {
        const toks = M.tokenize(inp.value);
        out.innerHTML = `<div style="margin-top:8px">${tokChips(toks)}</div><p class="muted">${toks.length} Token${toks.length === 1 ? '' : 's'}</p>`;
      };
      inp.addEventListener('input', run);
      root.querySelectorAll('[data-ex]').forEach((b) => { b.onclick = () => { inp.value = b.dataset.ex; run(); }; });
      run();
    },
    refresh(root) {
      const c = root.querySelector('#tk-chips');
      if (c) c.innerHTML = tokChips(state.tokens);
      const n = root.querySelector('#tk-count');
      if (n) n.textContent = `${state.tokens.length} Tokens · Vokabular: ${M.VOCAB.length} Einträge`;
    },
  };
}

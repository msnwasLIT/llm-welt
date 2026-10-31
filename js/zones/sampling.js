// Station 6 – Wahrscheinlichkeits-Bühne: Logits -> Softmax -> Würfeln.
export function createSampling(ctx) {
  const { THREE, M, U, state, bus } = ctx;
  const color = 0xfacc15;
  const group = new THREE.Group();
  const N = 8;
  const xOf = (r) => (r - 3.5) * 2.75 + 1.6;
  const H_MAX = 13;

  // Balken
  const barGeo = new THREE.BoxGeometry(1.9, 1, 1.9);
  barGeo.translate(0, 0.5, 0);
  const bars = [];
  for (let r = 0; r < N; r++) {
    const g = new THREE.Group();
    g.position.x = xOf(r);
    const c = new THREE.Color().setHSL(0.13 - r * 0.018, 0.95, 0.55 - r * 0.02);
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.3, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(barGeo, mat);
    g.add(mesh);
    group.add(g);
    const bar = { g, mesh, mat, baseColor: c, h: 0.2, target: 0.2, word: null, pctLabel: null, pctText: '', id: -1, flash: 0, active: true };
    ctx.clickable(mesh, () => {
      const cand = state.dist?.top[r];
      if (cand) ctx.toast(`„${cand.text}“: Logit ${cand.logit.toFixed(2)} → ${U.fmtPct(cand.p)}${cand.pk ? '' : ' (durch Top-k ausgeschlossen)'}`);
    }, () => {
      const cand = state.dist?.top[r];
      return cand ? `„${cand.text}“ · ${U.fmtPct(cand.p)}` : '';
    });
    bars.push(bar);
  }

  // Thermometer
  const thermo = new THREE.Group();
  thermo.position.set(-11.8, 0, 0);
  group.add(thermo);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 10.5, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.18, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 6.4;
  thermo.add(glass);
  const liquidGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 20);
  liquidGeo.translate(0, 0.5, 0);
  const liquidMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.position.y = 1.2;
  thermo.add(liquid);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16), liquidMat);
  bulb.position.y = 1.0;
  thermo.add(bulb);
  let thermoLabel = null;
  let thermoLevel = 1;

  // Top-k-Klammer
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) }));
  bracket.position.set(0, 0.12, 1.75);
  group.add(bracket);
  let bracketLabel = null;
  let bracketTarget = { x: 0, w: 1 };

  const title = U.makeLabel('Logits  →  Softmax  →  🎲 Würfeln', { size: 1.25, px: 60, color: '#fff3c4', bg: 'rgba(30,24,8,0.7)' });
  title.position.set(1.6, 15.8, -1);
  group.add(title);

  // Murmel
  const marble = new THREE.Group();
  marble.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.5), toneMapped: false })));
  marble.add(U.makeGlow(0xfff1a8, 3.2));
  marble.visible = false;
  group.add(marble);
  const fx = new THREE.Group();
  group.add(fx);

  function setLabel(bar, key, make) {
    if (bar[key]) { bar.g.remove(bar[key]); U.disposeObject(bar[key]); }
    bar[key] = make();
    bar.g.add(bar[key]);
  }

  function updateFromDist() {
    const d = state.dist;
    if (!d) return;
    d.top.forEach((c, r) => {
      const bar = bars[r];
      bar.target = 0.15 + c.p * H_MAX;
      bar.active = c.pk > 0;
      if (bar.id !== c.id) {
        bar.id = c.id;
        setLabel(bar, 'word', () => {
          const p = U.makeTextPlane(c.text, { size: 0.85, px: 70, color: '#ffffff', bg: 'rgba(20,16,4,0.85)' });
          if (p.geometry.parameters.width > 2.5) p.scale.setScalar(2.5 / p.geometry.parameters.width);
          p.position.set(0, -0.0 + 0.5, 1.0);
          return p;
        });
      }
      const pct = U.fmtPct(c.p);
      if (bar.pctText !== pct) {
        bar.pctText = pct;
        setLabel(bar, 'pctLabel', () => U.makeLabel(pct, { size: 0.75, px: 48, color: '#fff7d6' }));
      }
    });
    // Thermometer
    const T = state.temperature;
    thermoLevel = 0.3 + (T / 2) * 9.6;
    liquidMat.color.set(0x38bdf8).lerp(new THREE.Color(0xf43f5e), U.clamp(T / 2, 0, 1)).multiplyScalar(1.6);
    if (thermoLabel) { thermo.remove(thermoLabel); U.disposeObject(thermoLabel); }
    thermoLabel = U.makeLabel(`Temperatur ${T.toFixed(2).replace('.', ',')}`, { size: 0.75, px: 48, color: '#ffffff', bg: 'rgba(10,14,36,0.8)' });
    thermoLabel.position.set(0, 12.6, 0);
    thermo.add(thermoLabel);
    // Klammer
    const k = d.k;
    bracketTarget = { x: (xOf(0) + xOf(k - 1)) / 2, w: xOf(k - 1) - xOf(0) + 2.2 };
    if (bracketLabel) { group.remove(bracketLabel); U.disposeObject(bracketLabel); }
    bracketLabel = U.makeLabel(`Top-k = ${k}: nur diese dürfen gezogen werden`, { size: 0.6, px: 42, color: '#fde68a' });
    bracketLabel.position.set(bracketTarget.x, 0.55, 2.9);
    group.add(bracketLabel);
  }

  async function showChoice(choice, { fast = false } = {}) {
    const d = state.dist;
    const r = choice.rank;
    const active = d.top.map((c, i) => i).filter((i) => d.top[i].pk > 0);
    const seq = fast ? [r] : [...Array(3)].map(() => active[Math.floor(Math.random() * active.length)]).concat([r]);
    marble.visible = true;
    marble.position.set(xOf(seq[0]) * 0.3, 19, 0);
    for (let s = 0; s < seq.length; s++) {
      const b = bars[seq[s]];
      const from = marble.position.clone();
      const to = new THREE.Vector3(xOf(seq[s]), b.target + 0.6, 0);
      const apex = Math.max(from.y, to.y) + (s === 0 ? 0.5 : 2.2);
      const dur = fast ? 0.22 : s === 0 ? 0.55 : 0.34;
      await U.animate(dur, (t) => {
        marble.position.x = THREE.MathUtils.lerp(from.x, to.x, t);
        const y0 = THREE.MathUtils.lerp(from.y, to.y, t);
        marble.position.y = y0 + Math.sin(Math.PI * t) * (apex - Math.max(from.y, to.y)) * (s === 0 ? 0.2 : 1);
      });
      b.flash = s === seq.length - 1 ? 1.5 : 0.5;
    }
    // Gewinner-Label
    const lbl = U.makeLabel(`„${choice.text}“`, { size: 2.2, px: 80, color: '#fffbea', bg: 'rgba(60,40,0,0.85)', border: '#facc15' });
    lbl.position.set(xOf(r), bars[r].target + 2.5, 0.5);
    lbl.userData.keep = true; // Deckkraft wird hier selbst animiert
    fx.add(lbl);
    U.animate(2.2, (t) => {
      lbl.position.y = bars[r].target + 2.5 + t * 3;
      lbl.material.opacity = 1 - Math.max(0, t - 0.5) * 2;
    }).then(() => { fx.remove(lbl); U.disposeObject(lbl); });
    await U.wait(fast ? 0.1 : 0.55);
    marble.visible = false;
  }

  bus.on('dist', updateFromDist);

  function listHtml() {
    const d = state.dist;
    if (!d) return '';
    return `<div class="bars">${d.top.map((c) => `<span>${U.escapeHtml(c.text)}</span><div class="bar${c.pk ? '' : ' off'}" style="width:${Math.max(2, c.p * 100)}%"></div><span class="num">${U.fmtPct(c.p)}${c.pk ? ` → <b style="color:#fff">${U.fmtPct(c.pk)}</b>` : ''}</span>`).join('')}</div>
      <p class="muted">Links: Wahrscheinlichkeit nach Softmax · rechts (fett): nach Top-k neu verteilt – damit wird tatsächlich gewürfelt.</p>
      <p class="muted">Das Mini-Modell nutzt hier die letzten <b>${d.used}</b> Token${d.used === 1 ? '' : 's'} als Kontext (${d.used === 2 ? 'Trigramm' : d.used === 1 ? 'Bigramm' : 'nur Worthäufigkeit'}).</p>`;
  }

  return {
    id: 'sampling', name: 'Wahrscheinlichkeits-Bühne', short: 'Würfeln', icon: '🎲', color, radius: 17, titleY: 18.2,
    subtitle: 'Jedes mögliche nächste Token bekommt eine Chance – dann wird gezogen',
    group,
    cam: { pos: new THREE.Vector3(0, 10, 32), target: new THREE.Vector3(0, 7.5, 0) },
    showChoice,
    update(t, dt) {
      for (const b of bars) {
        b.h = U.damp(b.h, b.target, 6, dt);
        b.mesh.scale.y = b.h;
        b.flash = Math.max(0, b.flash - dt * 1.5);
        if (b.active) b.mat.color.copy(b.baseColor); else b.mat.color.set(0x2a3050);
        b.mat.emissive.copy(b.active ? b.baseColor : new THREE.Color(0x111428));
        b.mat.emissiveIntensity = 0.22 + b.flash * 1.6 + (b.active ? Math.sin(t * 3 + b.g.position.x) * 0.08 : 0);
        b.mat.opacity = b.active ? 1 : 0.55;
        if (b.pctLabel) b.pctLabel.position.set(0, b.h + 0.7, 0);
      }
      liquid.scale.y = U.damp(liquid.scale.y, thermoLevel, 5, dt);
      bracket.position.x = U.damp(bracket.position.x, bracketTarget.x, 6, dt);
      bracket.scale.x = U.damp(bracket.scale.x, bracketTarget.w, 6, dt);
    },
    pulse() { bars.forEach((b, i) => { b.flash = 0.6 + i * 0.05; }); },
    panel() {
      return `
        <p>Ganz oben im Turm wird der Vektor des letzten Tokens mit <b>jedem Eintrag des Vokabulars</b> verglichen. Ergebnis: eine Punktzahl pro Token, der <b>Logit</b>.
        Die <b>Softmax</b>-Funktion verwandelt diese Punktzahlen in Wahrscheinlichkeiten, die zusammen 100 % ergeben.</p>
        <p>Dann wird <b>gewürfelt</b> (die Murmel!). Darum kann das gleiche Modell auf dieselbe Frage verschiedene Antworten geben.</p>
        <div class="box try">
          <div class="slider"><span>🌡 Temperatur</span><span class="val" id="sm-tval">${state.temperature.toFixed(2)}</span>
            <input type="range" id="sm-temp" min="0.1" max="2" step="0.05" value="${state.temperature}"></div>
          <div class="slider"><span>✂ Top-k (nur die k besten)</span><span class="val" id="sm-kval">${state.topK}</span>
            <input type="range" id="sm-topk" min="1" max="8" step="1" value="${state.topK}"></div>
          <div id="sm-list">${listHtml()}</div>
          <div class="row"><button class="chip primary" id="sm-draw">🎲 Ziehen &amp; anhängen</button></div>
        </div>
        <div class="formula">p(Token i) = e^(zᵢ / T) / Σⱼ e^(zⱼ / T)</div>
        <ul>
          <li><b>Niedrige Temperatur</b> (→ 0): Das wahrscheinlichste Token gewinnt fast immer – zuverlässig, aber eintönig.</li>
          <li><b>Hohe Temperatur</b>: Die Chancen gleichen sich an – kreativer, aber auch chaotischer.</li>
          <li><b>Top-k / Top-p</b> schneiden unwahrscheinliche Kandidaten ab, damit kein Unsinn gezogen wird.</li>
        </ul>
        <div class="box real">Das Vokabular hat dort 30 000–200 000 Einträge – jeder bekommt in jedem Schritt eine Wahrscheinlichkeit.
        Wichtig: Das Modell wählt, was <b>plausibel klingt</b>, nicht was nachweislich stimmt. Darum kann ein LLM überzeugend formulieren und trotzdem falsch liegen („Halluzination“).</div>`;
    },
    bind(root) {
      const temp = root.querySelector('#sm-temp');
      const topk = root.querySelector('#sm-topk');
      temp.oninput = () => {
        state.temperature = Number(temp.value);
        root.querySelector('#sm-tval').textContent = state.temperature.toFixed(2);
        ctx.recomputeDist();
      };
      topk.oninput = () => {
        state.topK = Number(topk.value);
        root.querySelector('#sm-kval').textContent = state.topK;
        ctx.recomputeDist();
      };
      root.querySelector('#sm-draw').onclick = () => ctx.generateOne();
    },
    refresh(root) {
      const el = root.querySelector('#sm-list');
      if (el) el.innerHTML = listHtml();
    },
  };
}

// Station 0 – Parameter-Kern: das "Gehirn" in der Mitte der Welt.
export function createHub(ctx) {
  const { THREE, U } = ctx;
  const group = new THREE.Group();
  const color = 0x7dd3fc;

  const core = new THREE.Group();
  core.position.y = 10;
  group.add(core);

  // Leuchtende Innenkugel mit Fresnel-Rand
  const innerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float fres = pow(1.0 - max(dot(vN, vV), 0.0), 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 3.0 + uTime * 2.0) * sin(vP.x * 2.5 - uTime * 1.3);
        vec3 a = vec3(0.25, 0.35, 1.0), b = vec3(0.95, 0.35, 0.75);
        vec3 col = mix(a, b, bands) * (0.35 + bands * 0.4) + vec3(0.6, 0.9, 1.0) * fres * 2.2;
        gl_FragColor = vec4(col, 0.92);
      }`,
    transparent: true,
  });
  core.add(new THREE.Mesh(new THREE.SphereGeometry(3.2, 48, 32), innerMat));

  const icoGeo = new THREE.IcosahedronGeometry(6, 1);
  const shell = new THREE.LineSegments(new THREE.EdgesGeometry(icoGeo), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.9 }));
  core.add(shell);

  // Neuronen an den Ecken
  const nodes = new THREE.Group();
  const seen = new Set();
  const pos = icoGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const g = U.makeGlow(i % 3 ? 0x7dd3fc : 0xf472b6, 1.3);
    g.position.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    nodes.add(g);
  }
  core.add(nodes);

  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(8 + i * 1.6, 0.06, 6, 120),
      new THREE.MeshBasicMaterial({ color: new THREE.Color([0x7dd3fc, 0xf472b6, 0xa78bfa][i]).multiplyScalar(1.6) })
    );
    r.rotation.set(Math.PI / 2 + i * 0.5, i * 0.8, 0);
    core.add(r);
    rings.push(r);
  }

  // Parameter-Wolke
  const n = 700, pp = new Float32Array(n * 3), rnd = ctx.M.rng(3);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), d = 9 + rnd() * 6;
    pp.set([d * Math.sin(ph) * Math.cos(th), d * Math.cos(ph) * 0.6, d * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const cloud = new THREE.Points(cloudGeo, new THREE.PointsMaterial({ size: 0.5, map: U.glowTexture(), color: 0xb4c6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.add(cloud);

  // Lichtsäule
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 5, 10, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x4f6bff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  beam.position.y = 5;
  group.add(beam);

  const lbl = U.makeLabel('Milliarden gelernte Zahlen (Parameter)', { size: 1.3, px: 52, color: '#cfe3ff', bg: 'rgba(8,12,32,0.6)' });
  lbl.position.set(0, 1.8, 10);
  group.add(lbl);

  const JOURNEY = [
    ['Tokenizer-Werkstatt', 'Text wird in Bausteine (Tokens) zerschnitten.'],
    ['Embedding-Galaxie', 'Jedes Token wird zu einem Punkt im Bedeutungsraum.'],
    ['Positions-Wellen', 'Wellenmuster verraten die Reihenfolge.'],
    ['Attention-Arena', 'Tokens schauen einander an und tauschen Infos aus.'],
    ['Transformer-Turm', 'Viele Schichten verfeinern das Verständnis.'],
    ['Wahrscheinlichkeits-Bühne', 'Alle möglichen nächsten Tokens bekommen Chancen – dann wird gewürfelt.'],
    ['Kontext-Förderband', 'Das neue Token wird angehängt – und alles beginnt von vorn.'],
    ['Trainings-Gebirge', 'Woher die Parameter kommen: Lernen durch Fehler.'],
  ];

  return {
    id: 'hub', name: 'Parameter-Kern', short: 'Kern', icon: '✦', color, radius: 14, titleY: 23,
    subtitle: 'Start & Übersicht: Was ist ein LLM?',
    group,
    cam: { pos: new THREE.Vector3(0, 26, 60), target: new THREE.Vector3(0, 9, 0) },
    update(t, dt) {
      innerMat.uniforms.uTime.value = t;
      shell.rotation.y += dt * 0.25;
      shell.rotation.x = Math.sin(t * 0.3) * 0.3;
      nodes.rotation.copy(shell.rotation);
      rings.forEach((r, i) => { r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1); });
      cloud.rotation.y -= dt * 0.08;
      core.position.y = 10 + Math.sin(t * 0.8) * 0.6;
      const s = 1 + Math.sin(t * 2.2) * 0.03;
      core.scale.setScalar(s);
    },
    panel() {
      return `
        <p><b>Willkommen in der LLM-Welt!</b> Ein großes Sprachmodell (<i>Large Language Model</i>) macht im Kern genau eine Sache:
        Es sagt das <b>nächste Token</b> voraus – und das immer wieder. Alles, was nach Verstehen, Erklären oder Programmieren aussieht,
        entsteht aus dieser einen Fähigkeit.</p>
        <p>Die Arbeit erledigt ein riesiges Netz aus <b>Parametern</b> – Milliarden Zahlen, die im Training gelernt wurden. Dieser leuchtende Kern steht für sie.</p>
        <h3>Die Reise eines Tokens</h3>
        <ul class="journey">
          ${JOURNEY.map(([n, d], i) => `<li data-go="${i + 1}"><span class="dot" style="background:${U.hex(ctx.order?.[i + 1]?.color ?? color)}">${i + 1}</span><span><b>${n}</b><br><span class="muted">${d}</span></span></li>`).join('')}
        </ul>
        <div class="box try">
          Unten steht dein <b>Prompt</b>. Drück <b>▶ Nächstes Token</b> (oder die Leertaste) und folge dem leuchtenden Datenkometen durch alle Stationen.
          Mit <b>⏩ Satz</b> schreibt das Modell weiter bis zum Punkt. Ändere den Prompt, z. B. <code>Der Hund</code> oder <code>Das Modell</code>.
        </div>
        <div class="box simple">In dieser Welt arbeitet ein echtes, aber winziges Modell: rund 100 Wörter, gelernt aus 44 Beispielsätzen.
        Die Abläufe entsprechen denen großer LLMs – nur die Zahlen sind tausendfach kleiner.</div>
        <p class="muted">Steuerung: Ziehen = drehen · Rechtsklick/Zwei Finger = verschieben · Scrollen = zoomen · Tasten 0–8 = Stationen · O = Übersicht · Objekte sind anklickbar.</p>`;
    },
    bind(root) {
      root.querySelectorAll('[data-go]').forEach((li) => {
        li.onclick = () => { ctx.stopTour?.(); ctx.goTo(ctx.order[Number(li.dataset.go)]); };
      });
    },
  };
}

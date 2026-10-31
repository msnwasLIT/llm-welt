// ---------------------------------------------------------------------------
// Mini-Sprachmodell für die LLM-Welt.
//
// Bewusst winzig und durchschaubar: ein Teilwort-Tokenizer mit gemeinsamem
// Vokabular, ein Trigramm-Modell mit Backoff (liefert echte Wahrscheinlich-
// keiten), handgelegte 3D-Embeddings und drei illustrative Attention-Köpfe.
// Echte LLMs lernen all das aus Milliarden Tokens – hier ist es nachgebaut,
// damit man jeden Schritt sehen kann.
// Keine Abhängigkeit von three.js -> in Node testbar.
// ---------------------------------------------------------------------------

export const CORPUS = `
die katze sitzt auf der matte .
die katze schläft auf dem sofa .
die katze jagt die maus im garten .
der hund sitzt vor dem haus .
der hund läuft schnell durch den garten .
der hund bellt die katze an .
die maus frisst den käse .
der vogel singt auf dem baum .
der vogel fliegt über das haus .
der könig sitzt auf dem thron .
die königin sitzt neben dem könig .
der könig ist ein mann .
die königin ist eine frau .
der mann liest ein buch .
die frau liest eine zeitung .
das kind spielt im garten .
das kind lacht über die katze .
die sonne scheint hell über dem garten .
der mond leuchtet in der nacht .
in der nacht schläft die katze .
am morgen scheint die sonne .
das modell lernt aus vielen daten .
das modell sagt das nächste wort voraus .
ein sprachmodell liest viele texte .
jedes wort wird zu einem token .
die tokens fließen durch viele schichten .
die aufmerksamkeit verbindet die wörter .
das modell wählt das wahrscheinlichste wort .
die katze sitzt gern in der sonne .
der hund schläft unter dem baum .
die maus sitzt auf der mauer .
die katze sieht den vogel auf dem baum .
der kleine hund spielt mit dem ball .
die kleine katze trinkt milch .
der große baum steht im garten .
die frau geht mit dem hund spazieren .
der mann trinkt kaffee am morgen .
das kind isst einen apfel .
die sonne geht am abend unter .
der könig trägt eine krone .
die königin trägt eine krone .
die katze sitzt auf dem dach .
das modell schreibt einen text .
ein text besteht aus vielen tokens .
`;

// Häufige deutsche Wortbausteine – damit unbekannte Wörter in Teilwörter
// zerfallen (wie bei BPE/WordPiece, nur stark vereinfacht).
const PIECES = [
  'donau', 'dampf', 'schiff', 'fahrt', 'sprach', 'trans', 'form', 'bank', 'kraft',
  'zeit', 'welt', 'spiel', 'netz', 'werk', 'lern', 'bild', 'land', 'stadt', 'licht',
  'schaft', 'keit', 'heit', 'lich', 'ung', 'chen', 'ver', 'ent', 'sch', 'ein', 'ge',
  'be', 'un', 'er', 'en', 'el', 'ch', 'st', 'tr', 'an', 'in', 'ie', 'ei', 'au', 'eu',
  'ki', 'te', 'ra', 're', 'ne', 'de',
];
const CHARS = 'abcdefghijklmnopqrstuvwxyzäöüß0123456789'.split('');

export const UNK = '<unk>';

// --- Vokabular -------------------------------------------------------------
const corpusTokens = CORPUS.trim().split(/\s+/);
const wordFreq = new Map();
for (const w of corpusTokens) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);

export const WORDS = [...wordFreq.keys()].sort((a, b) => wordFreq.get(b) - wordFreq.get(a) || a.localeCompare(b));
export const VOCAB = [UNK, ...WORDS];
for (const p of [...PIECES, ...CHARS, '!', '?', ',', ':', '-']) if (!VOCAB.includes(p)) VOCAB.push(p);

export const TOKEN_ID = new Map(VOCAB.map((t, i) => [t, i]));
const WORD_SET = new Set(WORDS);
const PIECE_SET = new Set(VOCAB.slice(1));
const MAX_PIECE = Math.max(...VOCAB.map((t) => t.length));

/** Ein Wort -> Liste von Teilwort-Schlüsseln (greedy, längster Treffer zuerst). */
function splitWord(lower) {
  if (WORD_SET.has(lower)) return [lower];
  if (!/^[a-zäöüß\d]+$/.test(lower)) return [PIECE_SET.has(lower) ? lower : UNK]; // einzelnes Sonderzeichen/Emoji
  const out = [];
  let i = 0;
  while (i < lower.length) {
    let hit = null;
    for (let len = Math.min(MAX_PIECE, lower.length - i); len >= 1; len--) {
      const cand = lower.slice(i, i + len);
      if (PIECE_SET.has(cand)) { hit = cand; break; }
    }
    if (!hit) { out.push(UNK); i += 1; continue; }
    out.push(hit);
    i += hit.length;
  }
  return out;
}

/**
 * Text -> Tokens.
 * Jedes Token: { text, key, id, cont }  (cont = Fortsetzung eines Wortes)
 */
export function tokenize(text) {
  const tokens = [];
  const re = /[A-Za-zÄÖÜäöüß]+|\d|[^\sA-Za-zÄÖÜäöüß\d]/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    const lower = word.toLowerCase();
    const keys = splitWord(lower);
    let pos = 0;
    keys.forEach((key, k) => {
      const len = key === UNK ? word.length - pos : key.length;
      tokens.push({ text: word.slice(pos, pos + len), key, id: TOKEN_ID.get(key), cont: k > 0 });
      pos += len;
    });
  }
  return tokens;
}

/** Tokens -> lesbarer Text. */
export function detokenize(tokens) {
  let s = '';
  for (const t of tokens) {
    const isPunct = /^[.,!?:]$/.test(t.text);
    if (s && !t.cont && !isPunct) s += ' ';
    s += t.text;
  }
  return s;
}

export function tokenFromId(id) {
  const key = VOCAB[id];
  return { text: key, key, id, cont: false };
}

// --- Trigramm-Modell mit Backoff ---------------------------------------------
const corpusIds = corpusTokens.map((w) => TOKEN_ID.get(w));
const uni = new Float64Array(VOCAB.length);
const bi = new Map();   // "b" -> Map(c -> n)
const tri = new Map();  // "a,b" -> Map(c -> n)
function bump(map, key, c) {
  let m = map.get(key);
  if (!m) { m = new Map(); map.set(key, m); }
  m.set(c, (m.get(c) || 0) + 1);
}
for (let i = 0; i < corpusIds.length; i++) {
  const c = corpusIds[i];
  uni[c] += 1;
  if (i >= 1) bump(bi, String(corpusIds[i - 1]), c);
  if (i >= 2) bump(tri, corpusIds[i - 2] + ',' + corpusIds[i - 1], c);
}
const uniTotal = corpusIds.length;

function addDist(target, counts, weight) {
  let total = 0;
  for (const n of counts.values()) total += n;
  for (const [c, n] of counts) target[c] += weight * (n / total);
}

/**
 * Rohwerte ("Logits") für das nächste Token.
 * Liefert zusätzlich, welche Kontextlänge tatsächlich genutzt wurde.
 */
export function nextLogits(ids) {
  const p = new Float64Array(VOCAB.length);
  const b = ids[ids.length - 1];
  const a = ids[ids.length - 2];
  const triCounts = a !== undefined ? tri.get(a + ',' + b) : undefined;
  const biCounts = b !== undefined ? bi.get(String(b)) : undefined;
  let used = 0;
  let l1 = 1;
  if (triCounts) { addDist(p, triCounts, 0.62); l1 -= 0.62; used = 2; }
  if (biCounts) { const w = used ? 0.28 : 0.82; addDist(p, biCounts, w); l1 -= w; used = used || 1; }
  for (let c = 0; c < VOCAB.length; c++) p[c] += l1 * (uni[c] / uniTotal) + 1e-7;
  const logits = new Float64Array(VOCAB.length);
  for (let c = 0; c < VOCAB.length; c++) logits[c] = Math.log(p[c]);
  logits[0] = -40; // <unk> nie vorschlagen
  return { logits, used };
}

/** Softmax mit Temperatur. */
export function softmax(logits, temperature = 1) {
  const T = Math.max(0.05, temperature);
  let max = -Infinity;
  for (const l of logits) if (l > max) max = l;
  const out = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) { out[i] = Math.exp((logits[i] - max) / T); sum += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/**
 * Vorhersage-Verteilung für die Bühne:
 * top `n` Kandidaten mit p (nach Temperatur) und pk (nach Top-k renormiert).
 */
export function predict(ids, { temperature = 1, topK = 5, n = 8 } = {}) {
  const { logits, used } = nextLogits(ids);
  const probs = softmax(logits, temperature);
  const order = [...probs.keys()].sort((x, y) => probs[y] - probs[x]);
  const k = Math.max(1, Math.min(topK, n));
  let kSum = 0;
  for (let r = 0; r < k; r++) kSum += probs[order[r]];
  const top = order.slice(0, n).map((id, rank) => ({
    id,
    text: VOCAB[id],
    logit: logits[id],
    p: probs[id],
    pk: rank < k ? probs[id] / kSum : 0,
    rank,
  }));
  return { top, used, k };
}

/** Zieht ein Token aus einer predict()-Verteilung. */
export function sample(dist, rnd = Math.random) {
  let r = rnd();
  for (const c of dist.top) {
    if (c.pk <= 0) continue;
    r -= c.pk;
    if (r <= 0) return c;
  }
  return dist.top.find((c) => c.pk > 0) || dist.top[0];
}

// --- Embeddings ---------------------------------------------------------------
export const CATEGORIES = {
  tiere:     { label: 'Tiere',            color: 0xff9f1c, center: [-9, 3, 4] },
  menschen:  { label: 'Menschen & Rollen', color: 0xff5d8f, center: [8, 1, 5] },
  natur:     { label: 'Orte & Natur',     color: 0x4ade80, center: [-3, -4, -8] },
  dinge:     { label: 'Dinge & Essen',    color: 0xfacc15, center: [-10, -3, -3] },
  verben:    { label: 'Tätigkeiten',      color: 0x60a5fa, center: [4, 6, -7] },
  ki:        { label: 'KI-Begriffe',      color: 0xc084fc, center: [10, -4, -4] },
  funktion:  { label: 'Funktionswörter',  color: 0x94a3b8, center: [0, -7, 6] },
  eigensch:  { label: 'Eigenschaften',    color: 0x2dd4bf, center: [-2, 8, 2] },
  teil:      { label: 'Teilwörter',       color: 0x64748b, center: [2, 0, 12] },
};

const CAT_WORDS = {
  tiere: 'katze hund maus vogel',
  menschen: 'könig königin mann frau kind',
  natur: 'garten baum haus sonne mond nacht morgen abend dach mauer thron sofa matte',
  dinge: 'käse milch kaffee apfel ball buch zeitung krone',
  verben: 'sitzt schläft jagt läuft bellt frisst singt fliegt ist liest spielt lacht scheint leuchtet lernt sagt wird fließen verbindet wählt sieht trinkt steht geht isst trägt schreibt besteht spazieren',
  ki: 'modell sprachmodell wort token tokens schichten aufmerksamkeit wörter daten texte text',
  funktion: 'die der das den dem ein eine einen einem auf im in vor durch über an neben am aus zu unter mit gern . voraus viele vielen jedes',
  eigensch: 'schnell hell kleine große nächste wahrscheinlichste',
};
const WORD_CAT = new Map();
for (const [cat, list] of Object.entries(CAT_WORDS)) for (const w of list.split(' ')) WORD_CAT.set(w, cat);

export function categoryOf(key) { return WORD_CAT.get(key) || 'teil'; }

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// König – Mann + Frau ≈ Königin: als exaktes Parallelogramm gelegt.
const ROYAL = { mann: [5, -1, 3], frau: [5, -1, 7], könig: [10, 3, 3], königin: [10, 3, 7] };

const embCache = new Map();
/** 3D-Position eines Tokens im Bedeutungsraum. */
export function embed3(key) {
  if (embCache.has(key)) return embCache.get(key);
  let v;
  if (ROYAL[key]) v = ROYAL[key];
  else {
    const c = CATEGORIES[categoryOf(key)].center;
    const r = rng(hashStr(key));
    const rad = categoryOf(key) === 'funktion' || categoryOf(key) === 'verben' ? 3.6 : 2.8;
    const th = r() * Math.PI * 2;
    const ph = Math.acos(2 * r() - 1);
    const d = rad * Math.cbrt(r());
    v = [c[0] + d * Math.sin(ph) * Math.cos(th), c[1] + d * Math.cos(ph), c[2] + d * Math.sin(ph) * Math.sin(th)];
  }
  embCache.set(key, v);
  return v;
}

const CAT_KEYS = Object.keys(CATEGORIES);
/** Höherdimensionaler (12-d) Vektor: Position + Kategorie-Anteil. */
export function embedVec(key) {
  const p = embed3(key);
  const v = [p[0] / 12, p[1] / 12, p[2] / 12];
  const cat = categoryOf(key);
  for (const c of CAT_KEYS) v.push(c === cat ? 0.9 : 0);
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
export function dist3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

/** Die n nächsten Nachbarn eines Wortes im 3D-Raum. */
export function neighbors(key, n = 5) {
  const p = embed3(key);
  return WORDS.filter((w) => w !== key && w !== '.')
    .map((w) => ({ key: w, d: dist3(p, embed3(w)) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, n);
}

// --- Positionskodierung ------------------------------------------------------------
export function positionalEncoding(pos, i, d = 16) {
  const k = Math.floor(i / 2);
  const angle = pos / Math.pow(10000, (2 * k) / d);
  return i % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
}

// --- Attention ---------------------------------------------------------------------
const CONTENT = new Set(['tiere', 'menschen', 'natur', 'dinge', 'ki']);
export const HEADS = [
  { id: 'prev', name: 'Nachbar-Kopf', color: 0x4cc9f0, desc: 'schaut vor allem auf das direkt vorherige Token – wichtig für Grammatik und Wortfolge.' },
  { id: 'sem', name: 'Bedeutungs-Kopf', color: 0xf72585, desc: 'sucht Tokens mit ähnlicher Bedeutung (nahe Vektoren im Embedding-Raum).' },
  { id: 'subj', name: 'Subjekt-Kopf', color: 0x80ffdb, desc: 'sucht die Hauptdarsteller: Nomen wie „Katze“ oder „König“, auf die sich Verben beziehen.' },
];

/**
 * Attention-Matrix (kausal) für eine Token-Liste und einen Kopf.
 * weights[i][j] = wie stark Token i auf Token j achtet (j <= i), Zeilen summieren auf 1.
 */
export function attention(tokens, headId) {
  const n = tokens.length;
  const vecs = tokens.map((t) => embedVec(t.key));
  const W = [];
  for (let i = 0; i < n; i++) {
    const scores = [];
    for (let j = 0; j <= i; j++) {
      let s;
      if (headId === 'prev') s = j === i - 1 ? 4.2 : j === i ? 1.6 : -0.4 * (i - j);
      else if (headId === 'sem') s = 5 * dot(vecs[i], vecs[j]) - (j === i ? 1.2 : 0);
      else s = (CONTENT.has(categoryOf(tokens[j].key)) ? 3.2 : 0) - 0.15 * (i - j) + (j === i ? 0.4 : 0);
      scores.push(s);
    }
    const max = Math.max(...scores);
    const ex = scores.map((s) => Math.exp(s - max));
    const sum = ex.reduce((a, b) => a + b, 0);
    W.push(ex.map((e) => e / sum));
  }
  return W;
}

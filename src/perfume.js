// Parfums : notes olfactives (base ouverte Scento, CC BY 4.0) et pyramide olfactive en 3D.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

export const SCENTO_URL = 'https://huggingface.co/datasets/scento/perfume-database/resolve/main/perfumes.jsonl';
export const SCENTO_CREDIT = 'Scento — https://www.scento.com/perfume-database';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Traduction des notes les plus courantes ----------
const FR = {
  bergamot: 'Bergamote', mandarin: 'Mandarine', lemon: 'Citron', orange: 'Orange', 'bitter orange': 'Orange amère', grapefruit: 'Pamplemousse', lime: 'Citron vert', neroli: 'Néroli', 'pink pepper': 'Baie rose', pepper: 'Poivre', 'black pepper': 'Poivre noir',
  cardamom: 'Cardamome', ginger: 'Gingembre', saffron: 'Safran', cinnamon: 'Cannelle', nutmeg: 'Muscade', clove: 'Clou de girofle', lavender: 'Lavande', mint: 'Menthe', basil: 'Basilic', sage: 'Sauge', rosemary: 'Romarin', thyme: 'Thym',
  apple: 'Pomme', 'green apple': 'Pomme verte', pear: 'Poire', pineapple: 'Ananas', blackcurrant: 'Cassis', 'black currant': 'Cassis', raspberry: 'Framboise', strawberry: 'Fraise', cherry: 'Cerise', peach: 'Pêche', plum: 'Prune', coconut: 'Noix de coco', fig: 'Figue', lychee: 'Litchi', 'red berries': 'Fruits rouges', melon: 'Melon',
  rose: 'Rose', jasmine: 'Jasmin', 'jasmine sambac': 'Jasmin sambac', iris: 'Iris', violet: 'Violette', 'violet leaf': 'Feuille de violette', tuberose: 'Tubéreuse', 'orange blossom': "Fleur d'oranger", 'lily of the valley': 'Muguet', magnolia: 'Magnolia', peony: 'Pivoine', freesia: 'Freesia', gardenia: 'Gardénia', geranium: 'Géranium', heliotrope: 'Héliotrope', ylang: 'Ylang-ylang', 'ylang-ylang': 'Ylang-ylang', mimosa: 'Mimosa', 'floral notes': 'Notes florales', 'white flowers': 'Fleurs blanches',
  vanilla: 'Vanille', 'tonka bean': 'Fève tonka', tonka: 'Fève tonka', musk: 'Musc', 'white musk': 'Musc blanc', amber: 'Ambre', ambergris: 'Ambre gris', ambroxan: 'Ambroxan', benzoin: 'Benjoin', labdanum: 'Labdanum', opoponax: 'Opoponax', incense: 'Encens', myrrh: 'Myrrhe', oud: 'Oud', 'agarwood (oud)': 'Oud',
  patchouli: 'Patchouli', vetiver: 'Vétiver', sandalwood: 'Santal', cedar: 'Cèdre', cedarwood: 'Cèdre', 'virginia cedar': 'Cèdre de Virginie', oakmoss: 'Mousse de chêne', moss: 'Mousse', leather: 'Cuir', suede: 'Daim', tobacco: 'Tabac', 'tobacco leaf': 'Feuille de tabac', guaiac: 'Gaïac', 'guaiac wood': 'Bois de gaïac', birch: 'Bouleau', woody: 'Notes boisées', 'woody notes': 'Notes boisées', 'cashmere wood': 'Bois de cachemire', cashmeran: 'Cashmeran',
  caramel: 'Caramel', praline: 'Praliné', honey: 'Miel', chocolate: 'Chocolat', cacao: 'Cacao', cocoa: 'Cacao', coffee: 'Café', almond: 'Amande', 'tea': 'Thé', 'green tea': 'Thé vert', rum: 'Rhum', whiskey: 'Whisky', cognac: 'Cognac',
  'sea notes': 'Notes marines', 'marine notes': 'Notes marines', 'sea salt': 'Sel marin', salt: 'Sel', aquatic: 'Notes aquatiques', 'aquatic notes': 'Notes aquatiques', 'green notes': 'Notes vertes', grass: 'Herbe', 'fig leaf': 'Feuille de figuier', powdery: 'Notes poudrées', 'powdery notes': 'Notes poudrées', aldehydes: 'Aldéhydes', elemi: 'Élémi', juniper: 'Genièvre', 'juniper berries': 'Baies de genièvre', ambrette: 'Ambrette', cumin: 'Cumin', 'clary sage': 'Sauge sclarée', artemisia: 'Armoise', petitgrain: 'Petit-grain', 'orris': 'Iris', 'orris root': "Racine d'iris",
};
export const frNote = (n) => FR[String(n).toLowerCase().trim()] || n;

// ---------- Base de données ----------
let dbPromise = null;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function loadDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      let text = null;
      const cache = typeof caches !== 'undefined' ? await caches.open('wishy-scento').catch(() => null) : null;
      const hit = cache && (await cache.match(SCENTO_URL).catch(() => null));
      if (hit) text = await hit.text();
      if (!text) {
        const r = await fetch(SCENTO_URL);
        if (!r.ok) throw new Error(`Base de parfums inaccessible (${r.status})`);
        text = await r.text();
        cache?.put(SCENTO_URL, new Response(text, { headers: { 'Content-Type': 'application/jsonl' } })).catch(() => {});
      }
      return text.split('\n').filter(Boolean).map((l) => { try { const p = JSON.parse(l); p._n = norm(p.name); p._h = norm(p.house); return p; } catch { return null; } }).filter(Boolean);
    })();
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

// Mots qui ne servent pas à identifier le parfum
const NOISE = new Set('eau de parfum toilette cologne edp edt extrait parfum spray vaporisateur ml pour homme femme men women for him her the le la les de du un une et vapo natural recharge refill flacon coffret'.split(' '));

/** Cherche un parfum par son nom d'article ; renvoie les meilleures correspondances */
export async function searchPerfume(title, brand = '') {
  const all = await loadDb();
  const t = norm(`${brand} ${title}`);
  const words = new Set(t.split(' ').filter((w) => w.length > 1 && !NOISE.has(w) && !/^\d+$/.test(w)));
  const scored = [];
  const padded = ` ${t} `;
  for (const p of all) {
    const nameW = p._n.split(' ').filter((w) => !NOISE.has(w));
    if (!nameW.length) continue;
    const exact = padded.includes(` ${p._n} `);
    const matched = nameW.filter((w) => words.has(w)).length;
    const nameHit = exact ? 1 : matched / nameW.length;
    if (nameHit < 0.5) continue;
    const houseW = p._h.split(' ');
    const houseHit = houseW.some((w) => w.length > 2 && words.has(w)) || t.includes(p._h) ? 1 : 0;
    const conc = p.concentration && t.includes(p.concentration.replace(/-/g, ' ')) ? 0.15 : 0;
    // un nom plus long entièrement retrouvé (« Libre Intense » plutôt que « Libre ») est plus précis
    scored.push({ p, s: nameHit * 2 + houseHit * 1.5 + (exact ? 0.5 : 0) + (nameHit === 1 ? nameW.length * 0.3 : 0) + conc - (p.popularity_rank || 999) / 20000 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 6).filter((x) => x.s >= 2.4).map((x) => x.p);
}

/** Notes d'un parfum de la base, au format Wishy */
export function scentFrom(p) {
  let top = p.top_notes || [], heart = p.heart_notes || [], base = p.base_notes || [];
  if (!top.length && !heart.length && !base.length && p.notes?.length) {
    // pyramide non détaillée : on répartit dans l'ordre (les premières notes sont les plus volatiles)
    const n = p.notes, a = Math.ceil(n.length / 3), b = Math.ceil((n.length * 2) / 3);
    top = n.slice(0, a); heart = n.slice(a, b); base = n.slice(b);
  }
  return {
    top: top.map(frNote), heart: heart.map(frNote), base: base.map(frNote),
    family: p.family || '', character: p.character || [],
    source: { name: p.name, house: p.house, url: p.url, id: p.id, guessed: !(p.top_notes?.length || p.heart_notes?.length) },
  };
}

export const allNotes = (s) => [...(s?.top || []), ...(s?.heart || []), ...(s?.base || [])];
export function compareScents(a, b) {
  const na = new Map(allNotes(a).map((n) => [n.toLowerCase(), n])), nb = new Map(allNotes(b).map((n) => [n.toLowerCase(), n]));
  const common = [...na.keys()].filter((k) => nb.has(k)).map((k) => na.get(k));
  const onlyA = [...na.keys()].filter((k) => !nb.has(k)).map((k) => na.get(k));
  const onlyB = [...nb.keys()].filter((k) => !na.has(k)).map((k) => nb.get(k));
  const score = common.length / Math.max(1, Math.min(na.size, nb.size));
  return { common, onlyA, onlyB, score };
}

// ---------- Pyramide 3D ----------
const TIERS = [
  { key: 'base', label: 'Fond', color: 0xc98a3c, y0: 0, y1: 0.55, r0: 1.25, r1: 0.86 },
  { key: 'heart', label: 'Cœur', color: 0xff8fb0, y0: 0.6, y1: 1.1, r0: 0.82, r1: 0.45 },
  { key: 'top', label: 'Tête', color: 0xffd21f, y0: 1.15, y1: 1.75, r0: 0.42, r1: 0.02 },
];

function noteSprite(text, { hl = false } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = '700 30px "DM Sans", system-ui, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  cv.width = w; cv.height = 52;
  ctx.font = font;
  ctx.fillStyle = hl ? '#17171c' : 'rgba(255,255,255,.95)';
  const r = 24;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(1, 1, w - 2, 50, r) : ctx.rect(1, 1, w - 2, 50); ctx.fill();
  ctx.strokeStyle = hl ? '#ffd21f' : 'rgba(23,23,28,.15)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = hl ? '#ffd21f' : '#17171c';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 18, 27);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(w / 220, 52 / 220, 1);
  s.renderOrder = 10;
  return s;
}

function bottle(color = 0xffd21f) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
  const juice = new THREE.MeshStandardMaterial({ color, roughness: 0.2, transparent: true, opacity: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.24), glass);
  body.position.y = 0.25;
  const liquid = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.18), juice);
  liquid.position.y = 0.2;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xd9dae0, metalness: 0.8, roughness: 0.2 }));
  neck.position.y = 0.54;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.3 }));
  cap.position.y = 0.66;
  g.add(liquid, body, neck, cap);
  return g;
}

/**
 * @param {HTMLElement} host
 * @param {object} scent  { top, heart, base }
 * @param {{ highlight?: string[], bottleColor?: string }} opt
 */
export function mountPyramid(host, scent, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera.position.set(0, 1.45, 4.6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffeec2, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.85, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 9;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.75;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 1.2;

  const hl = new Set((opt.highlight || []).map((n) => n.toLowerCase()));
  const root = new THREE.Group();
  scene.add(root);
  const labels = [];
  for (const t of TIERS) {
    const h = t.y1 - t.y0;
    const geo = new THREE.CylinderGeometry(t.r1, t.r0, h, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    const mat = new THREE.MeshStandardMaterial({ color: t.color, transparent: true, opacity: 0.32, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = t.y0 + h / 2;
    root.add(m);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: t.color }));
    edges.position.copy(m.position);
    root.add(edges);
    const notes = scent?.[t.key] || [];
    const tierLabel = noteSprite(`${t.label}${notes.length ? '' : ' · —'}`, {});
    tierLabel.material.opacity = 0.75;
    tierLabel.scale.multiplyScalar(0.8);
    tierLabel.position.set(-(t.r0 + 0.55), t.y0 + h / 2, 0);
    tierLabel.userData.fixed = true;
    labels.push(tierLabel);
    root.add(tierLabel);
    notes.slice(0, 7).forEach((n, i) => {
      const s = noteSprite(n, { hl: hl.has(n.toLowerCase()) });
      const a = (i / Math.max(1, Math.min(7, notes.length))) * Math.PI * 2 + t.y0 * 2;
      s.userData = { a, r: (t.r0 + t.r1) / 2 + 0.45, y: t.y0 + h / 2 + (i % 2 ? 0.1 : -0.1), sp: 0.15 + (i % 3) * 0.03 };
      labels.push(s);
      root.add(s);
    });
  }
  const b = bottle(opt.bottleColor || 0xffd21f);
  b.position.y = 0.05;
  b.scale.setScalar(0.9);
  root.add(b);

  let alive = true;
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.setLength(w / h < 0.8 ? 5.8 : 4.8);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  renderer.setAnimationLoop((t) => {
    if (!alive) return;
    const k = reduced ? 0 : t / 1000;
    for (const s of labels) {
      const u = s.userData;
      if (u.fixed || u.a == null) continue;
      const a = u.a + k * u.sp;
      s.position.set(Math.cos(a) * u.r, u.y + Math.sin(k * 1.3 + u.a) * 0.04, Math.sin(a) * u.r);
    }
    b.rotation.y = k * 0.4;
    controls.update();
    renderer.render(scene, camera);
  });
  return { dispose() { alive = false; ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); } };
}

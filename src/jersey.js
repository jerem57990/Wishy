// Maillots (foot, basket…) : flocage nom/numéro, patchs, options de la boutique et aperçu 3D.
import * as THREE from './vendor/three.module.js';

const JERSEY_WORDS = /maillot|jersey|camiseta|trikot|maglia|swingman|\bkit\b|soccer|football shirt|home shirt|away shirt|third shirt|\bnba\b|\bnfl\b|\bnhl\b|basket(ball)? (shirt|tank)|débardeur (nba|basket)/i;
const JERSEY_SHOPS = /kkgool|footkorner|unisportstore|kitbag|fanatics|nbastore|foot\.fr|classicfootballshirts|minejersey|jerseyloco|kitlocker/i;

export const isJersey = (it) => !!it && (JERSEY_WORDS.test(it.title || '') || JERSEY_SHOPS.test(it.store || it.url || '')) && !/chaussette|sock|short\b/i.test(it.title || '');
export const isBasket = (it) => /\bnba\b|basket|swingman|lakers|celtics|bulls|warriors|knicks|heat\b|nets\b|spurs|mavericks|nuggets/i.test(it.title || '');
export const isLongSleeve = (it) => (it.jersey?.sleeves ? it.jersey.sleeves === 'longues' : /long sleeve|manches longues|\bml\b|长袖/i.test(it.title || ''));

// Patchs courants, selon le championnat devinable dans le titre
const LEAGUES = [
  { re: /psg|paris|marseille|\bom\b|lyon|monaco|lille|lens|rennes|nice|nantes|ligue 1/i, patches: ['Ligue 1 McDonald\'s', 'Champion de France'] },
  { re: /real madrid|barcelon|barça|atl[eé]tico|sevill|valencia|betis|villarreal|bilbao|laliga|la liga/i, patches: ['LaLiga EA Sports', 'Campeón LaLiga'] },
  { re: /bayern|dortmund|leverkusen|leipzig|frankfurt|stuttgart|schalke|bundesliga/i, patches: ['Bundesliga', 'Meister (champion)', 'DFB-Pokal'] },
  { re: /arsenal|chelsea|liverpool|manchester|man utd|man city|tottenham|newcastle|aston villa|premier league/i, patches: ['Premier League', 'No Room For Racism', 'Champion Premier League'] },
  { re: /juventus|juve|milan|inter|napoli|roma|lazio|atalanta|fiorentina|serie a/i, patches: ['Serie A', 'Scudetto'] },
  { re: /france|italie|italy|espagne|spain|allemagne|germany|br[eé]sil|brazil|argentin|portugal|england|angleterre|maroc|morocco|belgique|belgium|pays-bas|netherlands/i, patches: ['Coupe du monde', 'Champion du monde', 'Euro'] },
];
const EUROPE = ['Ligue des champions + Respect', 'Ligue Europa', 'Ligue Conférence'];

export function presetPatches(it) {
  if (isBasket(it)) return ['NBA', 'Badge NBA Champions', 'Sponsor de la franchise'];
  const t = it.title || '';
  const l = LEAGUES.find((x) => x.re.test(t));
  return [...(l ? l.patches : []), ...EUROPE, 'Coupe nationale'];
}

// Options de la boutique : badges/patchs, flocage, taille
export function shopGroups(it) {
  const gs = it.options || [];
  return {
    badge: gs.find((g) => /badge|patch|écusson|ecusson|parche/i.test(g.name)) || null,
    flocage: gs.find((g) => /name|number|flocage|personal|custom|nom|num/i.test(g.name)) || null,
    size: gs.find((g) => /size|taille|talla/i.test(g.name)) || null,
    others: gs.filter((g) => !/badge|patch|écusson|ecusson|parche|name|number|flocage|personal|custom|nom|num|size|taille|talla/i.test(g.name)),
  };
}

export const defaultJersey = (it) => ({ name: '', number: '', patches: [], shop: {}, version: isBasket(it) ? 'Swingman' : 'Fan', sleeves: isLongSleeve(it) ? 'longues' : 'courtes', ...(it.jersey || {}) });

/** Supplément des options choisies dans la boutique (en euros) */
export function optionsExtra(it, j) {
  let s = 0;
  for (const g of it.options || []) {
    const v = g.values.find((x) => x.label === j.shop?.[g.name]);
    if (v?.add) s += v.add;
  }
  return Math.round(s * 100) / 100;
}

/** Résumé texte (fiche, export Word, partage) */
export function jerseySummary(j) {
  if (!j) return '';
  const parts = [];
  if (j.name || j.number) parts.push(`Flocage : ${[j.name, j.number].filter(Boolean).join(' ')}`);
  const shopVals = Object.entries(j.shop || {}).filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`);
  if (j.patches?.length) parts.push(`Patchs : ${j.patches.join(', ')}`);
  parts.push(...shopVals);
  if (j.version) parts.push(`Version ${j.version}`);
  if (j.sleeves === 'longues') parts.push('Manches longues');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Aperçu 3D
// ---------------------------------------------------------------------------
function silhouette(long) {
  const half = long
    ? [[0, 1.42], [0.2, 1.55], [0.42, 1.52], [0.88, 0.36], [0.7, 0.3], [0.5, 1.02], [0.5, 0]]
    : [[0, 1.42], [0.2, 1.55], [0.42, 1.52], [0.8, 1.27], [0.67, 0.99], [0.5, 1.1], [0.5, 0]];
  const pts = [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y])];
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return s;
}

function normalizeUV(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x);
    uv[i * 2 + 1] = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return b;
}

const luminance = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const short = (label) => {
  const s = String(label).replace(/\+.*$/, '').trim();
  const known = { 'ligue des champions': 'UCL', 'champions league': 'UCL', 'ligue europa': 'UEL', 'ligue conférence': 'UECL', 'premier league': 'PL', 'coupe du monde': 'WC', 'champion du monde': '★', 'scudetto': 'ITA' };
  for (const [k, v] of Object.entries(known)) if (s.toLowerCase().includes(k)) return v;
  const w = s.split(/[\s/]+/).filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('') : s).slice(0, 4).toUpperCase();
};

function drawSide(ctx, W, H, bbox, side, j, colors) {
  const X = (x) => ((x - bbox.min.x) / (bbox.max.x - bbox.min.x)) * W;
  const Y = (y) => (1 - (y - bbox.min.y) / (bbox.max.y - bbox.min.y)) * H;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.ink;
  const font = (px, w = 800) => `${w} ${px}px Bricolage, "DM Sans", system-ui, sans-serif`;
  if (side === 'back') {
    if (j.name) {
      ctx.font = font(Math.min(64, 560 / Math.max(4, j.name.length)));
      ctx.save();
      ctx.translate(X(0), Y(1.2));
      ctx.scale(1, 1.15);
      ctx.fillText(j.name.toUpperCase(), 0, 0);
      ctx.restore();
    }
    if (j.number !== '' && j.number != null) {
      ctx.font = font(250, 900);
      ctx.lineWidth = 10;
      ctx.strokeStyle = colors.trim;
      ctx.strokeText(String(j.number), X(0), Y(0.72));
      ctx.fillText(String(j.number), X(0), Y(0.72));
    }
  } else {
    // écusson du club + petit numéro, patchs sur les manches et le torse
    ctx.beginPath();
    ctx.arc(X(-0.22), Y(1.22), 26, 0, Math.PI * 2);
    ctx.fillStyle = colors.trim; ctx.fill();
    ctx.fillStyle = colors.ink;
    if (j.number !== '' && j.number != null) { ctx.font = font(64, 900); ctx.fillText(String(j.number), X(0), Y(0.98)); }
    const spots = [[0.62, 1.24], [-0.62, 1.24], [0, 1.28]];
    (j.patches || []).slice(0, 3).forEach((p, i) => {
      const [x, y] = spots[i];
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 30, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd21f'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#17171c'; ctx.stroke();
      ctx.fillStyle = '#17171c'; ctx.font = font(20, 800);
      ctx.fillText(short(p), X(x), Y(y));
    });
  }
}

/**
 * Construit le maillot 3D.
 * @returns {{ object: THREE.Group, update(j, color): void }}
 */
export function buildJersey3D(j, color = '#c8102e', trim = null) {
  const group = new THREE.Group();
  let long = j.sleeves === 'longues';
  let shape = silhouette(long);
  const D = 0.05;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.62 });
  const W = 640, H = 640;
  const canvases = { front: document.createElement('canvas'), back: document.createElement('canvas') };
  const tex = {};
  const decal = {};
  for (const k of ['front', 'back']) {
    canvases[k].width = W; canvases[k].height = H;
    tex[k] = new THREE.CanvasTexture(canvases[k]);
    tex[k].colorSpace = THREE.SRGBColorSpace;
    tex[k].anisotropy = 4;
    decal[k] = new THREE.MeshStandardMaterial({ map: tex[k], transparent: true, roughness: 0.5, depthWrite: false });
  }
  let meshes = [];
  let bbox;
  function build() {
    meshes.forEach((m) => { group.remove(m); m.geometry.dispose(); });
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: D * 2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4, curveSegments: 6 }), bodyMat);
    body.position.z = -D;
    const fg = new THREE.ShapeGeometry(shape);
    bbox = normalizeUV(fg);
    const front = new THREE.Mesh(fg, decal.front);
    front.position.z = D + 0.053;
    const bg = new THREE.ShapeGeometry(shape);
    normalizeUV(bg);
    const back = new THREE.Mesh(bg, decal.back);
    back.rotation.y = Math.PI;
    back.position.z = -D - 0.053;
    // col
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: trim || '#ffffff', roughness: 0.5 }));
    collar.rotation.z = Math.PI;
    collar.position.set(0, 1.56, 0);
    collar.scale.set(1, 0.7, 1.6);
    meshes = [body, front, back, collar];
    meshes.forEach((m) => { m.castShadow = true; group.add(m); });
  }
  build();
  group.position.y = 0.02;

  function update(nj, c = color) {
    if ((nj.sleeves === 'longues') !== long) { long = nj.sleeves === 'longues'; shape = silhouette(long); build(); }
    color = c;
    bodyMat.color.set(c);
    const ink = luminance(c) > 0.6 ? '#17171c' : '#ffffff';
    const colors = { ink, trim: trim || (ink === '#ffffff' ? 'rgba(23,23,28,.55)' : 'rgba(255,255,255,.7)') };
    for (const k of ['front', 'back']) { drawSide(canvases[k].getContext('2d'), W, H, bbox, k, nj, colors); tex[k].needsUpdate = true; }
  }
  update(j, color);
  // tourner pour montrer le dos (le flocage) en premier
  group.rotation.y = Math.PI * 0.92;
  return { object: group, update };
}

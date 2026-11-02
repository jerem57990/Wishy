// Couleurs des vêtements : extraction depuis la photo, correspondance Pantone TCX, combos et harmonie.
import PANTONE from './vendor/pantone-tcx.js';

// ---------------------------------------------------------------------------
// Conversions sRGB ↔ CIELAB / LCh
// ---------------------------------------------------------------------------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const hexToRgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const delin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const F = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const Finv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
const WP = [0.95047, 1, 1.08883];

export function rgbToLab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / WP[0];
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / WP[1];
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / WP[2];
  const fx = F(X), fy = F(Y), fz = F(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = Finv(fx) * WP[0], Y = Finv(fy) * WP[1], Z = Finv(fz) * WP[2];
  const R = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  const G = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  const B = X * 0.0557 + Y * -0.204 + Z * 1.057;
  return [delin(R), delin(G), delin(B)];
}
export const labToLch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
export const lchToLab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
export const hexToLch = (h) => labToLch(rgbToLab(hexToRgb(h)));

// Ramène une couleur LCh dans le gamut sRGB en réduisant la chroma
function lchToHexSafe([L, C, h]) {
  L = clamp(L, 3, 97);
  for (let c = C; c >= 0; c -= 2) {
    const rgb = labToRgb(lchToLab([L, c, h]));
    if (rgb.every((v) => v >= -0.5 && v <= 255.5)) return rgbToHex(rgb);
  }
  return rgbToHex(labToRgb([L, 0, 0]));
}

// CIEDE2000
export function deltaE(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360);
  const h1p = h(b1, a1p), h2p = h(b2, a2p);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p) { if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360; hpm /= 2; }
  const T = 1 - 0.17 * Math.cos(((hpm - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * hpm * Math.PI) / 180) + 0.32 * Math.cos(((3 * hpm + 6) * Math.PI) / 180) - 0.2 * Math.cos(((4 * hpm - 63) * Math.PI) / 180);
  const dTh = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---------------------------------------------------------------------------
// Pantone TCX
// ---------------------------------------------------------------------------
const P = PANTONE.map(([code, name, hex]) => ({ code, name, hex, lab: rgbToLab(hexToRgb(hex)) }));
const byName = new Map(P.map((p) => [p.name, p]));
const pick = (...names) => names.map((n) => byName.get(n)).filter(Boolean);
export const pantoneByName = (...names) => pick(...names);

export function nearestPantone(hex, exclude = new Set()) {
  const lab = rgbToLab(hexToRgb(hex));
  let best = null, bd = Infinity;
  for (const p of P) {
    if (exclude.has(p.code)) continue;
    // pré-filtre rapide sur la luminance
    if (Math.abs(p.lab[0] - lab[0]) > 25) continue;
    const d = deltaE(lab, p.lab);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { ...best, dE: bd } : null;
}

// ---------------------------------------------------------------------------
// Extraction de la couleur d'un vêtement depuis sa photo
// ---------------------------------------------------------------------------
export function extractPalette(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const S = 72;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      // on garde les proportions, centré, sur fond transparent
      const k = Math.min(S / img.width, S / img.height);
      const w = img.width * k, h = img.height * k;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      const px = ctx.getImageData(0, 0, S, S).data;

      // couleur de fond = médiane approximative du pourtour de l'image
      const ring = [];
      const x0 = Math.round((S - w) / 2), y0 = Math.round((S - h) / 2), x1 = Math.round(x0 + w) - 1, y1 = Math.round(y0 + h) - 1;
      for (let x = x0; x <= x1; x += 2) for (const y of [y0 + 1, y1 - 1]) ring.push((y * S + x) * 4);
      for (let y = y0; y <= y1; y += 2) for (const x of [x0 + 1, x1 - 1]) ring.push((y * S + x) * 4);
      const ringLab = ring.filter((i) => px[i + 3] > 200).map((i) => rgbToLab([px[i], px[i + 1], px[i + 2]]));
      ringLab.sort((a, b) => a[0] - b[0]);
      const bg = ringLab[Math.floor(ringLab.length / 2)] || [100, 0, 0];
      const bgUniform = ringLab.filter((l) => deltaE(l, bg) < 8).length > ringLab.length * 0.55;

      const pts = [];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        if (px[i + 3] < 200) continue;
        const lab = rgbToLab([px[i], px[i + 1], px[i + 2]]);
        if (bgUniform && deltaE(lab, bg) < 9) continue;
        // poids : le centre de l'image compte davantage
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
        pts.push({ lab, w: Math.exp(-(dx * dx + dy * dy) * 1.4) });
      }
      // vêtement de la même couleur que le fond (ex. t-shirt blanc sur blanc)
      if (pts.length < S * S * 0.05) return resolve([{ hex: rgbToHex(labToRgb(bg)), pct: 100 }]);

      // k-moyennes (k = 4) avec initialisation par points éloignés
      const K = Math.min(4, pts.length);
      const cents = [pts.reduce((a, b) => (b.w > a.w ? b : a)).lab.slice()];
      while (cents.length < K) {
        let far = null, fd = -1;
        for (const p of pts) { const d = Math.min(...cents.map((c) => deltaE(c, p.lab))) * p.w; if (d > fd) { fd = d; far = p; } }
        cents.push(far.lab.slice());
      }
      let assign = new Array(pts.length).fill(0);
      for (let it = 0; it < 8; it++) {
        assign = pts.map((p) => { let bi = 0, bd = Infinity; cents.forEach((c, j) => { const d = (c[0] - p.lab[0]) ** 2 + (c[1] - p.lab[1]) ** 2 + (c[2] - p.lab[2]) ** 2; if (d < bd) { bd = d; bi = j; } }); return bi; });
        cents.forEach((c, j) => {
          let W = 0; const s = [0, 0, 0];
          pts.forEach((p, i) => { if (assign[i] === j) { W += p.w; s[0] += p.lab[0] * p.w; s[1] += p.lab[1] * p.w; s[2] += p.lab[2] * p.w; } });
          if (W) cents[j] = s.map((v) => v / W);
        });
      }
      let clusters = cents.map((c, j) => ({ lab: c, w: pts.reduce((s, p, i) => s + (assign[i] === j ? p.w : 0), 0) }));
      // fusion des groupes très proches
      clusters.sort((a, b) => b.w - a.w);
      const merged = [];
      for (const c of clusters) {
        const m = merged.find((x) => deltaE(x.lab, c.lab) < 10);
        if (m) { const W = m.w + c.w; m.lab = m.lab.map((v, i) => (v * m.w + c.lab[i] * c.w) / W); m.w = W; } else merged.push({ ...c });
      }
      const total = merged.reduce((s, c) => s + c.w, 0);
      resolve(merged.sort((a, b) => b.w - a.w).map((c) => ({ hex: rgbToHex(labToRgb(c.lab)), pct: Math.round((c.w / total) * 100) })).filter((c) => c.pct >= 8).slice(0, 3));
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Combos de couleurs
// ---------------------------------------------------------------------------
// « Neutres de la mode » : gris/blancs/noirs, mais aussi marine, jean brut, chocolat, camel, kaki…
const isNeutral = ([L, C, h]) => C < 12 || (L < 36 && C < 30) || (h >= 35 && h <= 105 && C < 28 && L >= 30 && L <= 78);
const isWarm = (h) => h < 105 || h > 340;
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const NEUTRALS_WARM = pick('Ecru', 'Egret', 'Oatmeal', 'Sand', 'Camel', 'Tan', 'Mocha Mousse', 'Cognac', 'Chocolate Brown', 'Coffee Bean', 'Navy Blazer', 'Olive Branch');
const NEUTRALS_COOL = pick('Bright White', 'Cloud Dancer', 'Silver Sconce', 'Neutral Gray', 'Charcoal Gray', 'Pirate Black', 'Jet Black', 'Navy Blazer', 'Dress Blues', 'Dark Denim', 'Black Iris');
const ACCENTS = pick('Classic Blue', 'Burgundy', 'Olive Branch', 'Rust', 'Mocha Mousse', 'Peach Fuzz', 'Ensign Blue', 'Sage', 'Cream Gold', 'Living Coral', 'Turmeric', 'Greenery');

// choisit n couleurs d'une liste qui contrastent assez en luminosité avec L
function contrasting(list, L, n, used) {
  return list
    .filter((p) => !used.has(p.code) && Math.abs(p.lab[0] - L) > 18)
    .slice(0, n);
}

function toPantones(lchs, used) {
  const out = [];
  for (const lch of lchs) {
    const p = nearestPantone(lchToHexSafe(lch), used);
    if (p) { used.add(p.code); out.push(p); }
  }
  return out;
}

/** Familles de combos Pantone pour une couleur de vêtement */
export function suggestions(hex) {
  const lch = hexToLch(hex);
  const [L, C, h] = lch;
  const self = nearestPantone(hex);
  const used = new Set(self ? [self.code] : []);
  const fam = [];
  if (isNeutral(lch)) {
    fam.push({ key: 'neutres', label: 'Neutres', hint: 'Un contraste clair/foncé, toujours élégant', colors: contrasting(L > 50 ? NEUTRALS_COOL.concat(NEUTRALS_WARM) : NEUTRALS_WARM.concat(NEUTRALS_COOL), L, 3, used) });
    fam.forEach((f) => f.colors.forEach((c) => used.add(c.code)));
    fam.push({ key: 'accent', label: 'Une touche de couleur', hint: 'Une pièce colorée suffit avec un neutre', colors: contrasting(ACCENTS, L, 4, used).slice(0, 4) });
    fam.forEach((f) => f.colors.forEach((c) => used.add(c.code)));
    fam.push({ key: 'ton', label: 'Ton sur ton', hint: 'Même famille, plus clair ou plus foncé', colors: toPantones([[L + 22, C, h], [L - 22, C, h], [L + 40, C, h]], used) });
  } else {
    fam.push({ key: 'ton', label: 'Ton sur ton', hint: 'La même couleur en plus clair ou plus foncé', colors: toPantones([[L + 24, C * 0.6, h], [L - 22, C * 0.8, h], [L + 40, C * 0.35, h]], used) });
    fam.push({ key: 'analogue', label: 'Couleurs voisines', hint: 'Des teintes proches sur le cercle chromatique', colors: toPantones([[L, C * 0.8, (h + 32) % 360], [L, C * 0.8, (h + 328) % 360], [L + 14, C * 0.55, (h + 16) % 360]], used) });
    fam.push({ key: 'complementaire', label: 'Contraste complémentaire', hint: 'La couleur opposée, en version adoucie', colors: toPantones([[clamp(100 - L, 25, 80), Math.min(C, 40) * 0.75, (h + 180) % 360], [L, Math.min(C, 45) * 0.55, (h + 160) % 360], [L, Math.min(C, 45) * 0.55, (h + 200) % 360]], used) });
    const neutrals = isWarm(h) ? NEUTRALS_WARM : NEUTRALS_COOL;
    fam.push({ key: 'neutres', label: 'Neutres assortis', hint: isWarm(h) ? 'Teinte chaude : beiges, camels, bruns et marine' : 'Teinte froide : blancs, gris, noirs et marine', colors: contrasting(neutrals, L, 3, used) });
  }
  return { self, families: fam.filter((f) => f.colors.length) };
}

// ---------------------------------------------------------------------------
// Harmonie entre deux couleurs (0 à 1) et verdict d'une tenue
// ---------------------------------------------------------------------------
export function harmony(hexA, hexB) {
  const a = hexToLch(hexA), b = hexToLch(hexB);
  const dL = Math.abs(a[0] - b[0]);
  if (isNeutral(a) && isNeutral(b)) return dL < 10 ? { score: 0.6, label: 'Deux neutres très proches : ajoute du contraste' } : { score: 0.9, label: 'Neutres bien contrastés' };
  if (isNeutral(a) || isNeutral(b)) return { score: 0.92, label: 'Neutre + couleur : accord sûr' };
  const dh = hueDist(a[2], b[2]);
  const vivid = a[1] > 40 && b[1] > 40;
  if (dh <= 14) return dL < 8 ? { score: 0.72, label: 'Ton sur ton très proche' } : { score: 0.88, label: 'Ton sur ton' };
  if (dh <= 40) return { score: 0.85, label: 'Couleurs voisines' };
  if (dh >= 150) return vivid ? { score: 0.6, label: 'Complémentaires vives : audacieux' } : { score: 0.82, label: 'Complémentaires adoucies' };
  return vivid ? { score: 0.35, label: 'Deux couleurs vives qui se heurtent' } : { score: 0.62, label: 'Accord libre' };
}

export function outfitVerdict(hexes) {
  const hs = hexes.filter(Boolean);
  if (hs.length < 2) return null;
  const pairs = [];
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) pairs.push(harmony(hs[i], hs[j]));
  const vivid = hs.filter((h) => hexToLch(h)[1] > 40).length;
  const worst = pairs.reduce((a, b) => (b.score < a.score ? b : a));
  const avg = pairs.reduce((s, p) => s + p.score, 0) / pairs.length;
  let label = worst.label, score = avg;
  if (vivid >= 3) { label = 'Beaucoup de couleurs vives : garde-en une seule'; score = Math.min(score, 0.45); }
  const level = score >= 0.8 ? 'top' : score >= 0.6 ? 'ok' : 'risque';
  return { score, label, level };
}

// API de démonstration (utilisée seulement si la page est ouverte hors d'Electron).
const img = (bg, fg, emoji) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#f6f6f4"/><rect x="40" y="40" width="120" height="120" rx="28" fill="${bg}"/><text x="100" y="122" font-size="60" text-anchor="middle" fill="${fg}">${emoji}</text></svg>`);

const day = 86400000;
const iso = (dAgo) => new Date(Date.now() - dAgo * day).toISOString();
const hist = (arr) => arr.map(([d, p]) => ({ d: iso(d), p }));
const uid = () => Math.random().toString(36).slice(2, 9);

const db = {
  items: [
    { id: 'a1', url: 'https://www.zalando.fr/nike-air-max-90', title: 'Nike Air Max 90 — Blanc / Jaune', image: img('#ffd21f', '#17171c', '👟'), price: 119.99, store: 'zalando.fr', category: 'vetements', priority: 3, addedAt: iso(20), lastCheck: iso(0.1), status: 'wish', history: hist([[20, 149.99], [9, 139.99], [2, 119.99]]), alternatives: [{ url: 'https://www.courir.com/air-max-90', store: 'courir.com', price: 124.99 }], targetPrice: 120, size: '43' },
    { id: 'a2', url: 'https://www.asos.com/fr/levis-501', title: "Jean Levi's 501 Original brut", image: img('#3e5f9e', '#fff', '👖'), price: 89.0, store: 'asos.com', category: 'vetements', priority: 2, addedAt: iso(14), lastCheck: iso(0.1), status: 'wish', history: hist([[14, 109], [3, 89]]), alternatives: [], size: 'W32 L32' },
    { id: 'a3', url: 'https://www.zalando.fr/carhartt-hoodie', title: 'Carhartt WIP Hooded Chase Sweat — Vert', image: img('#2f7d5b', '#fff', '🧥'), price: 99.99, store: 'zalando.fr', category: 'vetements', priority: 2, addedAt: iso(6), lastCheck: iso(0.1), status: 'wish', history: hist([[6, 99.99]]), alternatives: [] },
    { id: 'a4', url: 'https://www.micromania.fr/ea-fc-27', title: 'EA Sports FC 27 — PS5', image: img('#17171c', '#ffd21f', '🎮'), price: 49.99, store: 'micromania.fr', category: 'jeux', priority: 3, addedAt: iso(30), lastCheck: iso(0.1), status: 'wish', history: hist([[30, 79.99], [12, 59.99], [1, 49.99]]), alternatives: [{ url: 'https://www.instant-gaming.com/fc27', store: 'instant-gaming.com', price: 44.9 }] },
    { id: 'a5', url: 'https://www.fnac.com/zelda', title: 'The Legend of Zelda — Nintendo Switch 2', image: img('#ff4f81', '#fff', '🗡️'), price: 69.99, store: 'fnac.com', category: 'jeux', priority: 1, addedAt: iso(4), lastCheck: iso(0.1), status: 'wish', history: hist([[4, 69.99]]), alternatives: [] },
    { id: 'a6', url: 'https://www.ldlc.com/sony-wh1000xm6', title: 'Sony WH-1000XM6 casque à réduction de bruit', image: img('#cfd3db', '#17171c', '🎧'), price: 379, store: 'ldlc.com', category: 'tech', priority: 2, addedAt: iso(40), lastCheck: iso(0.1), status: 'wish', history: hist([[40, 419], [25, 399], [8, 379]]), alternatives: [], targetPrice: 330 },
    { id: 'a8', url: 'https://www.notino.fr/eau-de-parfum', title: 'Eau de parfum boisée — 100 ml', image: img('#f3d9e6', '#17171c', '🌸'), price: 92.5, store: 'notino.fr', category: 'parfums', priority: 2, addedAt: iso(3), lastCheck: iso(0.1), status: 'wish', history: hist([[3, 104], [1, 92.5]]), alternatives: [] },
    { id: 'a9', url: 'https://www.kkgool2.com/26-27-Bayern-Away-Long-Sleeve-Soccer-Jersey-p2902381.html', title: '26-27 Bayern Away Long Sleeve Soccer Jersey', image: img('#e8e4d8', '#c8102e', '⚽'), price: 13.33, priceOrig: { amount: 15.5, currency: 'USD' }, fx: { from: 'USD', rate: 0.86 }, store: 'kkgool2.com', category: 'vetements', priority: 2, addedAt: iso(1), lastCheck: iso(0.1), status: 'wish', history: hist([[1, 13.33]]), alternatives: [], palette: [{ hex: '#E8E4D8', pct: 70 }, { hex: '#C8102E', pct: 20 }], paletteSrc: img('#e8e4d8', '#c8102e', '⚽'),
      options: [{ name: 'Size', values: [{ label: 'S', add: 0 }, { label: 'M', add: 0 }, { label: 'L', add: 0 }, { label: 'XL', add: 0 }] }, { name: 'Badge', values: [{ label: 'Allianz', add: 0 }, { label: '35DM +Allianz', add: 0.86 }, { label: 'C2025/2026 +Allianz', add: 0.86 }, { label: 'UCL +Allianz', add: 1.72 }, { label: 'DFB +Allianz', add: 1.29 }] }, { name: 'Name / Number', values: [{ label: 'No Name No Number', add: 0 }, { label: 'Name / Number', add: 2.58 }] }] },
    { id: 'b1', url: 'https://www.sephora.fr/libre', title: 'Yves Saint Laurent Libre Eau de Parfum 50 ml', image: img('#ffe1b8', '#17171c', '🧴'), price: 98, store: 'sephora.fr', category: 'parfums', priority: 3, addedAt: iso(5), lastCheck: iso(0.1), status: 'wish', history: hist([[5, 98]]), alternatives: [],
      scent: { top: ['Mandarine', 'Néroli', 'Lavande'], heart: ["Fleur d'oranger", 'Jasmin sambac'], base: ['Musc', 'Vanille'], family: 'White Bloom', character: ['floral', 'creamy', 'fresh'], source: { name: 'Libre', house: 'Yves Saint Laurent', url: 'https://www.scento.com/perfumes/libre-yves-saint-laurent', id: 'ysl-libre' } }, scentTried: true },
    { id: 'b2', url: 'https://www.notino.fr/shalimar', title: 'Guerlain Shalimar Eau de Parfum', image: img('#cfe0ff', '#17171c', '💎'), price: 86, store: 'notino.fr', category: 'parfums', priority: 2, addedAt: iso(7), lastCheck: iso(0.1), status: 'wish', history: hist([[7, 86]]), alternatives: [],
      scent: { top: ['Notes florales', 'Bergamote'], heart: ['Iris', 'Jasmin', 'Rose'], base: ['Vanille', 'Opoponax', 'Fève tonka'], family: 'Petal Garden', character: ['floral', 'sweet', 'warm'], source: { name: 'Shalimar', house: 'Guerlain', url: 'https://www.scento.com/perfumes/shalimar-eau-de-parfum-guerlain', id: 'guerlain-shalimar' } }, scentTried: true },
    { id: 'c1', url: 'https://www.uniqlo.com/chemise-oxford', title: 'Chemise Oxford coupe droite — Bleu ciel', image: img('#b9d3ee', '#17171c', '👔'), price: 34.9, store: 'uniqlo.com', category: 'vetements', priority: 2, addedAt: iso(8), lastCheck: iso(0.1), status: 'wish', history: hist([[8, 39.9], [2, 34.9]]), alternatives: [] },
    { id: 'c2', url: 'https://www.cos.com/chino', title: 'Pantalon chino ample — Camel', image: img('#c19a6b', '#fff', '👖'), price: 79, store: 'cos.com', category: 'vetements', priority: 2, addedAt: iso(9), lastCheck: iso(0.1), status: 'wish', history: hist([[9, 79]]), alternatives: [] },
    { id: 'c3', url: 'https://www.zara.com/pull-bordeaux', title: 'Pull col rond maille — Bordeaux', image: img('#7b1e3a', '#fff', '🧶'), price: 45.95, store: 'zara.com', category: 'vetements', priority: 1, addedAt: iso(10), lastCheck: iso(0.1), status: 'wish', history: hist([[10, 45.95]]), alternatives: [] },
    { id: 'a7', url: 'https://www.ikea.com/fr/lampe', title: 'Lampe à poser champignon jaune', image: img('#ffe36e', '#17171c', '💡'), price: 34.99, store: 'ikea.com', category: 'maison', priority: 1, addedAt: iso(2), lastCheck: iso(0.1), status: 'wish', history: hist([[2, 34.99]]), alternatives: [] },
  ],
  purchases: [],
  lists: [{ id: 'l1', name: 'Idées cadeaux Noël', itemIds: ['a1', 'a4', 'a8'], createdAt: iso(1), shareToken: null }],
  settings: { checkHours: 6, alwaysOnTop: false, autostart: false, monthlyBudget: 300, notify: true },
  lastGlobalCheck: iso(0.05),
};
// Historique d'achats sur l'année
const past = [
  ['Adidas Samba OG', 'vetements', 120, 8], ['Manette DualSense', 'jeux', 64.99, 20], ['Clavier mécanique', 'tech', 89.9, 38], ['T-shirt oversize', 'vetements', 29.99, 45],
  ['Mario Kart World', 'jeux', 79.99, 70], ['Veste coupe-vent', 'vetements', 74.5, 95], ['SSD 2 To', 'tech', 129, 130], ['Coussins', 'maison', 24, 150],
  ['Maillot domicile', 'vetements', 89.99, 190], ['Manga coffret', 'livres', 42, 220], ['Ballon match', 'sport', 35, 250], ['Écouteurs', 'tech', 59, 300], ['Hoodie', 'vetements', 55, 3],
];
for (const [t, c, p, d] of past) db.purchases.push({ id: uid(), itemId: null, title: t, category: c, price: p, date: iso(d), store: 'boutique' });

const listeners = {};
const emit = (ch, data) => (listeners[ch] || []).forEach((f) => f(data));
const clone = () => structuredClone(db);

export default {
  getDb: async () => clone(),
  addItem: async (url) => {
    let host = 'boutique';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { ok: false, error: "Ce n'est pas un lien valide" }; }
    const item = { id: uid(), url, title: 'Nouvel article ' + host, image: null, price: null, store: host, category: 'autre', priority: 2, addedAt: new Date().toISOString(), lastCheck: new Date().toISOString(), status: 'wish', history: [], alternatives: [], fetchError: 'Mode démo' };
    db.items.unshift(item);
    return { ok: true, item };
  },
  updateItem: async (id, patch) => { const it = db.items.find((i) => i.id === id); if (!it) return { ok: false }; if (patch.price != null) it.history.push({ d: new Date().toISOString(), p: patch.price }); Object.assign(it, patch); for (const p of db.purchases) if (p.itemId === id && patch.title) p.title = patch.title; return { ok: true }; },
  setLists: async (lists) => { db.lists = lists; return { ok: true }; },
  deleteItem: async (id) => { db.items = db.items.filter((i) => i.id !== id); return { ok: true }; },
  refreshItem: async () => ({ ok: true }),
  addAlt: async (id, url) => { const it = db.items.find((i) => i.id === id); it.alternatives.push({ url, store: new URL(url).hostname, price: null }); return { ok: true, error: 'Mode démo' }; },
  removeAlt: async (id, idx) => { db.items.find((i) => i.id === id).alternatives.splice(idx, 1); return { ok: true }; },
  buyItem: async (id, { price, date, store }) => {
    const it = db.items.find((i) => i.id === id);
    Object.assign(it, { status: 'bought', boughtAt: date, boughtPrice: price });
    db.purchases.push({ id: uid(), itemId: id, title: it.title, image: it.image, category: it.category, price, date, store });
    return { ok: true };
  },
  deletePurchase: async (pid) => { const p = db.purchases.find((x) => x.id === pid); db.purchases = db.purchases.filter((x) => x.id !== pid); const it = p && db.items.find((i) => i.id === p.itemId); if (it) it.status = 'wish'; return { ok: true }; },
  checkPrices: async () => { emit('checking', true); await new Promise((r) => setTimeout(r, 900)); db.lastGlobalCheck = new Date().toISOString(); emit('checking', false); emit('toast', { type: 'ok', text: `${db.items.length} article(s) vérifié(s)` }); return { ok: true }; },
  setSettings: async (patch) => Object.assign(db.settings, patch),
  importData: async (d) => d,
  open: async (url) => window.open(url, '_blank'),
  imageData: async (url) => url,
  _photo: null,
  getPhoto: async function () { return this._photo; },
  setPhoto: async function (u) { this._photo = u; return { ok: true }; },
  tryOn: async function () {
    for (const [t, p] of [['Envoi de ta photo et du haut…', 5], ["File d'attente : position 2 (~20 s)", 15], ["L'IA enfile le haut…", 40], ["L'IA enfile le bas…", 80]]) { emit('tryon:progress', { text: t, pct: p }); await new Promise((r) => setTimeout(r, 400)); }
    return { ok: false, error: "Mode démo : l'essayage IA ne fonctionne que dans l'application Windows." };
  },
  getLook: async () => null,
  deleteLook: async () => ({ ok: true }),
  minimize() {}, hide() {}, maximize() {},
  on: (ch, cb) => (listeners[ch] = listeners[ch] || []).push(cb),
};

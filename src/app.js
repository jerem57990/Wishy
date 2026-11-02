import { createHeroScene, createBarsScene } from './scenes.js';
import { extractPalette, suggestions, nearestPantone, harmony, outfitVerdict, pantoneByName, hexToLch } from './colors.js';

// ---------------------------------------------------------------------------
// Pont vers Electron (ou démo en mémoire si on ouvre la page dans un navigateur)
// ---------------------------------------------------------------------------
const api = window.api || (await import('./demo-api.js')).default;
const isDemo = !window.api;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const CATS = {
  vetements: { label: 'Vêtements', emoji: '👕', color: '#ff4f81' },
  jeux: { label: 'Jeux vidéo', emoji: '🎮', color: '#4f7cff' },
  tech: { label: 'Tech', emoji: '💻', color: '#17171c' },
  maison: { label: 'Maison', emoji: '🛋️', color: '#0fae7b' },
  livres: { label: 'Livres', emoji: '📚', color: '#a35cff' },
  sport: { label: 'Sport', emoji: '⚽', color: '#ff8a3d' },
  parfums: { label: 'Parfums', emoji: '🌸', color: '#e05aa8' },
  autre: { label: 'Autre', emoji: '✨', color: '#f5b800' },
};

// Sites fiables où chercher le même article, selon la catégorie
const SHOPS = {
  common: [
    { name: 'Idealo', url: (q) => `https://www.idealo.fr/prechcat.html?q=${q}` },
    { name: 'Google Shopping', url: (q) => `https://www.google.com/search?tbm=shop&q=${q}` },
    { name: 'Amazon', url: (q) => `https://www.amazon.fr/s?k=${q}` },
  ],
  vetements: [
    { name: 'Zalando', url: (q) => `https://www.zalando.fr/catalogue/?q=${q}` },
    { name: 'ASOS', url: (q) => `https://www.asos.com/fr/search/?q=${q}` },
    { name: 'Courir', url: (q) => `https://www.courir.com/fr/search?q=${q}` },
    { name: 'Vinted', url: (q) => `https://www.vinted.fr/catalog?search_text=${q}` },
  ],
  jeux: [
    { name: 'Instant Gaming', url: (q) => `https://www.instant-gaming.com/fr/rechercher/?q=${q}` },
    { name: 'Micromania', url: (q) => `https://www.micromania.fr/search?q=${q}` },
    { name: 'Fnac', url: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}` },
    { name: 'Steam', url: (q) => `https://store.steampowered.com/search/?term=${q}` },
  ],
  tech: [
    { name: 'LDLC', url: (q) => `https://www.ldlc.com/recherche/${q}/` },
    { name: 'Boulanger', url: (q) => `https://www.boulanger.com/resultats?tr=${q}` },
    { name: 'Fnac', url: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}` },
    { name: 'Back Market', url: (q) => `https://www.backmarket.fr/fr-fr/search?q=${q}` },
  ],
  maison: [
    { name: 'IKEA', url: (q) => `https://www.ikea.com/fr/fr/search/?q=${q}` },
    { name: 'Maisons du Monde', url: (q) => `https://www.maisonsdumonde.com/FR/fr/search?q=${q}` },
    { name: 'Cdiscount', url: (q) => `https://www.cdiscount.com/search/10/${q}.html` },
  ],
  parfums: [
    { name: 'Notino', url: (q) => `https://www.notino.fr/search.asp?exps=${q}` },
    { name: 'Sephora', url: (q) => `https://www.sephora.fr/recherche?q=${q}` },
    { name: 'Nocibé', url: (q) => `https://www.nocibe.fr/fr/search?q=${q}` },
    { name: 'Marionnaud', url: (q) => `https://www.marionnaud.fr/search?text=${q}` },
    { name: 'Douglas (DE)', url: (q) => `https://www.douglas.de/de/search?q=${q}` },
    { name: 'Scento (échantillons)', url: (q) => `https://www.scento.com/search?q=${q}` },
  ],
  livres: [
    { name: 'Fnac', url: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}` },
    { name: 'Cultura', url: (q) => `https://www.cultura.com/search/results?search_query=${q}` },
    { name: 'Decitre', url: (q) => `https://www.decitre.fr/rechercher/result?q=${q}` },
  ],
  sport: [
    { name: 'Decathlon', url: (q) => `https://www.decathlon.fr/search?Ntt=${q}` },
    { name: 'Intersport', url: (q) => `https://www.intersport.fr/search/?q=${q}` },
    { name: 'Foot Locker', url: (q) => `https://www.footlocker.fr/fr/search?query=${q}` },
  ],
  autre: [{ name: 'Cdiscount', url: (q) => `https://www.cdiscount.com/search/10/${q}.html` }, { name: 'Fnac', url: (q) => `https://www.fnac.com/SearchResult/ResultList.aspx?Search=${q}` }],
};

const PIECES = {
  top: { label: 'Haut', words: ['t-shirt', 'tee', 'pull', 'sweat', 'hoodie', 'veste', 'chemise', 'polo', 'manteau', 'doudoune', 'maillot', 'top', 'gilet', 'blouson', 'parka', 'jacket', 'shirt'] },
  bottom: { label: 'Bas', words: ['jean', 'pantalon', 'short', 'jogging', 'jupe', 'cargo', 'chino', 'legging', 'pants', 'bermuda'] },
  shoes: { label: 'Chaussures', words: ['sneakers', 'baskets', 'chaussures', 'bottes', 'boots', 'air max', 'air force', 'jordan', 'dunk', 'samba', 'gazelle', 'running', 'mocassins', 'derbies', 'shoe'] },
};

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (n, d = 2) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: d, minimumFractionDigits: d === 0 ? 0 : undefined }).format(n));
const eur0 = (n) => eur(n, n != null && n % 1 ? 2 : 0);
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthName = (d, opt = { month: 'long', year: 'numeric' }) => new Date(d).toLocaleDateString('fr-FR', opt);
const ago = (iso) => {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
};
const firstPrice = (it) => (it.history?.length ? it.history[0].p : it.price);
const maxPrice = (it) => Math.max(it.price || 0, ...(it.history || []).map((h) => h.p));
const bestPrice = (it) => {
  const all = [{ store: it.store, price: it.price, url: it.url }, ...(it.alternatives || [])].filter((x) => x.price);
  return all.sort((a, b) => a.price - b.price)[0] || null;
};
const dropOf = (it) => {
  // référence : le prix le plus haut observé, ou le prix barré affiché par la boutique
  const seen = maxPrice(it), ref = Math.max(seen, it.listPrice || 0), cur = bestPrice(it)?.price;
  if (!ref || !cur || cur >= ref - 0.009) return null;
  return { from: ref, to: cur, pct: Math.round((1 - cur / ref) * 100), onSite: (it.listPrice || 0) > seen - 0.009 };
};
const atTarget = (it) => it.targetPrice && bestPrice(it)?.price && bestPrice(it).price <= it.targetPrice;
const pieceOf = (it) => {
  if (it.piece) return it.piece;
  const t = (it.title || '').toLowerCase();
  for (const [k, p] of Object.entries(PIECES)) if (p.words.some((w) => t.includes(w))) return k;
  return null;
};
const cleanQuery = (t) => encodeURIComponent((t || '').replace(/[|–\-:].*$/, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' '));

// ---------- Couleurs Pantone ----------
const isClothing = (it) => it && (it.category === 'vetements' || !!pieceOf(it));
const mainColor = (it) => it?.colorOverride || it?.palette?.[0]?.hex || null;
const palettePending = new Map();
function ensurePalette(it) {
  const src = it?.tryonImage || it?.image;
  if (!src) return Promise.resolve([]);
  if (it.palette && it.paletteSrc === src) return Promise.resolve(it.palette);
  if (palettePending.has(it.id)) return palettePending.get(it.id);
  const pr = (async () => {
    const data = src.startsWith('data:') || isDemo ? src : await api.imageData(src);
    const pal = data ? await extractPalette(data) : [];
    it.palette = pal;
    it.paletteSrc = src;
    await api.updateItem(it.id, { palette: pal, paletteSrc: src });
    return pal;
  })();
  palettePending.set(it.id, pr);
  pr.finally(() => palettePending.delete(it.id));
  return pr;
}
function chipHTML(p, { size = '', note = '', sel = false, data = '' } = {}) {
  return `<button class="pchip ${size} ${sel ? 'sel' : ''}" ${data} title="PANTONE ${p.code} TCX ${esc(p.name)} — cliquer pour copier"><i style="background:${p.hex}"></i><span class="pc-cap"><b>PANTONE</b><span>${p.code} TCX</span><em>${esc(p.name)}</em>${note}</span></button>`;
}
const PAIRS = { top: ['bottom', 'shoes'], bottom: ['top', 'shoes'], shoes: ['top', 'bottom'] };

async function fillColors(it) {
  const box = $('#dColors');
  if (!box) return;
  const pal = await ensurePalette(it);
  if (ui.openId !== it.id || !$('#dColors')) return;
  if (!pal.length) { $('#dColors').innerHTML = '<h4>Couleurs et combos Pantone</h4><p class="muted" style="font-size:13px">Impossible de lire les couleurs de la photo de cet article.</p>'; return; }
  const main = mainColor(it);
  const sug = suggestions(main);
  const own = pal.map((c) => ({ ...nearestPantone(c.hex), pct: c.pct, src: c.hex }));
  let html = `<h4>Couleurs et combos Pantone</h4>
    <p class="d-sub">Couleur détectée sur la photo${own.length > 1 ? ' : touche la bonne teinte si besoin' : ''}</p>
    <div class="pchips">${own.map((p) => chipHTML(p, { sel: p.src === main, note: own.length > 1 ? `<small>${p.pct} %</small>` : '', data: `data-main="${p.src}"` })).join('')}</div>`;
  for (const f of sug.families) html += `<p class="d-sub"><strong>${f.label}</strong> · ${f.hint}</p><div class="pchips">${f.colors.map((p) => chipHTML(p, { size: 's', data: 'data-copy' })).join('')}</div>`;

  // Articles de la wishlist qui vont bien avec
  const piece = pieceOf(it);
  const others = db.items.filter((o) => o.id !== it.id && o.status === 'wish' && isClothing(o) && (!piece || !pieceOf(o) || PAIRS[piece].includes(pieceOf(o)))).slice(0, 16);
  html += `<div id="dMatches"><p class="d-sub"><strong>Dans ta wishlist, ça va avec</strong></p><p class="muted" style="font-size:13px">Analyse des couleurs…</p></div>`;
  html += '<p class="fineprint">Références du nuancier Pantone TCX (textile). Les teintes affichées sont des approximations écran.</p>';
  $('#dColors').innerHTML = html;

  await Promise.all(others.map(ensurePalette));
  if (ui.openId !== it.id || !$('#dMatches')) return;
  const matches = others.filter((o) => mainColor(o)).map((o) => ({ o, h: harmony(main, mainColor(o)) })).filter((m) => m.h.score >= 0.8).sort((a, b) => b.h.score - a.h.score).slice(0, 6);
  $('#dMatches').innerHTML = `<p class="d-sub"><strong>Dans ta wishlist, ça va avec</strong></p>` + (matches.length
    ? `<ul class="matches">${matches.map(({ o, h }) => `<li><button data-goto="${o.id}">${thumbHTML(o)}<span><b>${esc(o.title)}</b><small><i style="background:${mainColor(o)}"></i>${h.label}</small></span></button></li>`).join('')}</ul>`
    : '<p class="muted" style="font-size:13px">Aucun autre vêtement de ta wishlist ne s\'accorde vraiment. Les combos ci-dessus peuvent guider tes prochains ajouts.</p>');
}

function thumbHTML(it, cls = 'thumb') {
  const c = CATS[it.category] || CATS.autre;
  const img = it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="${cls}">${img || c.emoji}${img ? `<span class="cat-dot">${c.emoji}</span>` : ''}</div>`;
}

function sparkSVG(it, w = 96, h = 34) {
  const pts = (it.history || []).map((x) => x.p);
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * (w - 4) + 2).toFixed(1)} ${(h - 4 - ((p - min) / span) * (h - 8)).toFixed(1)}`).join(' ');
  const down = pts.at(-1) < pts[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}"><path d="${d}" stroke="${down ? '#0fae7b' : pts.at(-1) > pts[0] ? '#ff4f81' : '#9a9daf'}" /></svg>`;
}

function toast(text, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

function confetti(fromEl) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = fromEl.getBoundingClientRect();
  const colors = ['#ffd21f', '#f5b800', '#ff4f81', '#4f7cff', '#0fae7b'];
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.background = colors[i % colors.length];
    c.style.left = r.left + r.width / 2 + 'px';
    c.style.top = r.top + r.height / 2 + 'px';
    document.body.append(c);
    const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160;
    c.animate(
      [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 140}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
      { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).onfinish = () => c.remove();
  }
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
let db = await api.getDb();
const ui = { cat: 'all', q: '', sort: 'recent', monthOffset: 0, openId: null, list: null, selecting: false, sel: new Set() };
let hero, bars;
const outfit = { top: null, bottom: null, shoes: null };
const cab = { photo: null, lookId: null, lookUrl: null, busy: false, init: false };
const lookCache = new Map();

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
function render() {
  renderHero();
  renderListsBar();
  renderChips();
  renderList();
  renderPromos();
  renderDash();
  renderCabinePick();
  renderLooks();
  renderSettings();
  if (ui.openId) openDrawer(ui.openId, true);
}

function wishItems() { return db.items.filter((i) => i.status === 'wish'); }

function totalSaved() {
  let s = 0;
  for (const it of db.items) {
    if (it.status === 'wish') { const d = dropOf(it); if (d) s += d.from - d.to; }
    else if (it.boughtPrice != null) s += Math.max(0, maxPrice(it) - it.boughtPrice);
  }
  return s;
}

function renderHero() {
  const w = wishItems();
  const total = w.reduce((s, i) => s + (bestPrice(i)?.price || 0), 0);
  $('#heroTotal').textContent = eur0(Math.round(total * 100) / 100);
  $('#heroCount').textContent = w.length;
  $('#heroSaved').textContent = eur0(Math.round(totalSaved()));
  const mk = monthKey(new Date());
  $('#heroMonth').textContent = eur0(db.purchases.filter((p) => monthKey(p.date) === mk).reduce((s, p) => s + p.price, 0));
  $('#lastCheck').textContent = db.lastGlobalCheck ? `Dernière vérification ${ago(db.lastGlobalCheck)}` : 'Les prix sont vérifiés automatiquement en arrière-plan.';
  hero?.setGiftCount(w.length);
  const promoN = w.filter((i) => dropOf(i) || atTarget(i)).length;
  $('#promoBadge').hidden = !promoN;
  $('#promoBadge').textContent = promoN;
}

function renderChips() {
  const w = wishItems();
  const counts = w.reduce((m, i) => ((m[i.category] = (m[i.category] || 0) + 1), m), {});
  const chips = [['all', 'Tout', '', w.length], ...Object.entries(CATS).filter(([k]) => counts[k]).map(([k, c]) => [k, c.label, c.emoji, counts[k]])];
  if (ui.cat !== 'all' && !counts[ui.cat]) ui.cat = 'all';
  $('#catChips').innerHTML = chips.map(([k, l, e, n]) => `<button class="chip ${ui.cat === k ? 'active' : ''}" data-cat="${k}" role="tab" aria-selected="${ui.cat === k}">${e ? `<span>${e}</span>` : ''}${l}<small>${n}</small></button>`).join('');
}

function rowHTML(it) {
  const c = CATS[it.category] || CATS.autre;
  const best = bestPrice(it);
  const d = dropOf(it);
  const badges = [];
  if (d) badges.push(`<span class="pill drop" title="${d.onSite ? 'Prix barré affiché par la boutique' : 'Baisse depuis l\'ajout'}">−${d.pct} %</span>`);
  if (atTarget(it)) badges.push('<span class="pill target">Prix cible</span>');
  if (it.status === 'bought') badges.push('<span class="pill bought">Acheté</span>');
  const otherShop = best && best.store !== it.store ? ` · moins cher chez ${esc(best.store)}` : '';
  const on = ui.sel.has(it.id);
  return `<li class="row ${on ? 'sel' : ''}" data-id="${it.id}" tabindex="0" ${ui.selecting ? `role="checkbox" aria-checked="${on}"` : ''}>
    <div class="thumb-wrap"><span class="check ${on ? 'on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>${thumbHTML(it)}</div>
    <div class="r-main">
      <div class="r-title">${esc(it.title)}</div>
      <div class="r-sub"><span>${esc(it.store || '')}</span><span class="prio" title="Priorité">${'★'.repeat(it.priority || 0)}</span>${it.fetchError && !it.price ? `<span class="warn">Prix à saisir</span>` : `<span>${c.label}${otherShop}</span>`}</div>
    </div>
    ${sparkSVG(it)}
    <div class="r-price"><strong>${eur(best?.price)}</strong>${d ? `<s>${eur(d.from)}</s> ` : ''}${badges.join(' ')}</div>
    <svg class="r-more" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
  </li>`;
}

function currentList() { return (db.lists || []).find((l) => l.id === ui.list) || null; }
function renderList() {
  const L = currentList();
  if (ui.list && !L) ui.list = null;
  let items = L ? db.items.filter((i) => L.itemIds.includes(i.id)) : wishItems();
  if (ui.cat !== 'all') items = items.filter((i) => i.category === ui.cat);
  if (ui.q) { const q = ui.q.toLowerCase(); items = items.filter((i) => (i.title + ' ' + i.store + ' ' + (i.brand || '')).toLowerCase().includes(q)); }
  const by = {
    recent: (a, b) => b.addedAt.localeCompare(a.addedAt),
    drop: (a, b) => (dropOf(b)?.pct || 0) - (dropOf(a)?.pct || 0),
    priceAsc: (a, b) => (bestPrice(a)?.price ?? 1e9) - (bestPrice(b)?.price ?? 1e9),
    priceDesc: (a, b) => (bestPrice(b)?.price ?? -1) - (bestPrice(a)?.price ?? -1),
    priority: (a, b) => (b.priority || 0) - (a.priority || 0),
  };
  items.sort(by[ui.sort]);
  ui.visible = items.map((i) => i.id);
  $('#itemList').classList.toggle('selecting', ui.selecting);
  $('#itemList').innerHTML = items.map(rowHTML).join('');
  $('#emptyState').hidden = wishItems().length > 0 || !!L;
  renderListHead(L, items);
  renderSelBar();
}

function renderPromos() {
  const items = wishItems().filter((i) => dropOf(i) || atTarget(i)).sort((a, b) => (dropOf(b)?.pct || 0) - (dropOf(a)?.pct || 0));
  $('#promoList').innerHTML = items.map(rowHTML).join('');
  $('#promoEmpty').hidden = items.length > 0;
}

// --- Sous-listes ---
const listItems = (L) => db.items.filter((i) => L.itemIds.includes(i.id));
async function saveLists(lists) { db.lists = lists; await api.setLists(lists); }
function renderListsBar() {
  const lists = db.lists || [];
  $('#listsBar').innerHTML = `<button class="lchip ${!ui.list ? 'active' : ''}" data-list="">Toute la wishlist</button>`
    + lists.map((l) => `<button class="lchip ${ui.list === l.id ? 'active' : ''}" data-list="${l.id}">${esc(l.name)}<small>${listItems(l).length}</small></button>`).join('')
    + '<button class="lchip add" data-newlist>＋ Nouvelle liste</button>';
}
function renderListHead(L, items) {
  const h = $('#listHead');
  h.hidden = !L;
  if (!L) return;
  const total = items.filter((i) => i.status === 'wish').reduce((s, i) => s + (bestPrice(i)?.price || 0), 0);
  h.innerHTML = `<div><h3>${esc(L.name)}</h3><p>${items.length} article${items.length > 1 ? 's' : ''} · ${eur(total)}${L.shareToken ? ' · <span class="shared">partagée</span>' : ''}</p></div>
    <div class="acts"><button class="btn-sun small" data-lact="word">Exporter en Word</button><button class="btn-ghost small" data-lact="share">${L.shareToken ? 'Copier le lien' : 'Partager'}</button>${L.shareToken ? '<button class="btn-ghost small" data-lact="unshare">Ne plus partager</button>' : ''}<button class="btn-ghost small" data-lact="rename">Renommer</button><button class="btn-ghost small" data-lact="delete">Supprimer</button></div>`;
}
function renderSelBar() {
  const bar = $('#selBar');
  bar.hidden = !ui.selecting;
  $('#selectBtn').classList.toggle('on', ui.selecting);
  $('#selectBtn').textContent = ui.selecting ? 'Terminer' : 'Sélectionner';
  if (!ui.selecting) return;
  const n = ui.sel.size, L = currentList();
  bar.innerHTML = `<strong>${n} sélectionné${n > 1 ? 's' : ''}</strong>
    <button data-sact="all">${ui.visible?.length && ui.visible.every((id) => ui.sel.has(id)) ? 'Aucun' : 'Tout'}</button>
    <button data-sact="addto" ${n ? '' : 'disabled'}>Ajouter à une liste</button>
    ${L ? `<button data-sact="remove" ${n ? '' : 'disabled'}>Retirer de la liste</button>` : ''}
    <button class="prim" data-sact="word" ${n ? '' : 'disabled'}>Exporter en Word</button>`;
}
function askText(title, label, value = '', ok = 'OK') {
  return new Promise((resolve) => {
    const d = $('#askDlg');
    $('#askTitle').textContent = title; $('#askLabel').textContent = label; $('#askInput').value = value; $('#askOk').textContent = ok;
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok' ? $('#askInput').value.trim() || null : null);
    d.showModal();
    setTimeout(() => $('#askInput').select(), 30);
  });
}
async function newList(itemIds = []) {
  const name = await askText('Nouvelle liste', 'Nom de la liste', '', 'Créer la liste');
  if (!name) return null;
  const L = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, itemIds: [...new Set(itemIds)], createdAt: new Date().toISOString(), shareToken: null };
  await saveLists([...(db.lists || []), L]);
  toast(`Liste « ${name} » créée`);
  return L;
}
async function addToList(listId, ids) {
  const lists = (db.lists || []).map((l) => (l.id === listId ? { ...l, itemIds: [...new Set([...l.itemIds, ...ids])] } : l));
  await saveLists(lists);
  toast(`Ajouté à « ${lists.find((l) => l.id === listId).name} »`);
}
function openListMenu(anchor, ids) {
  const m = $('#listMenu');
  m.innerHTML = (db.lists || []).map((l) => `<button data-to="${l.id}">${esc(l.name)}</button>`).join('') + ((db.lists || []).length ? '<hr>' : '') + '<button data-to="__new">＋ Nouvelle liste…</button>';
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 10) + 'px';
  m.style.top = Math.max(10, r.top - m.offsetHeight - 8) + 'px';
  m.onclick = async (e) => {
    const b = e.target.closest('[data-to]');
    if (!b) return;
    m.hidden = true;
    if (b.dataset.to === '__new') await newList(ids); else await addToList(b.dataset.to, ids);
    ui.selecting = false; ui.sel.clear();
    render();
  };
}
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#listMenu') && !e.target.closest('[data-sact="addto"]') && !e.target.closest('[data-dact="addto"]')) $('#listMenu').hidden = true; });

// --- Dashboard dépenses ---
function monthsWindow() {
  const now = new Date();
  const arr = [];
  for (let i = 11; i >= 0; i--) arr.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  return arr;
}

function renderDash() {
  const months = monthsWindow();
  const sums = months.map((m) => {
    const k = monthKey(m);
    const v = db.purchases.filter((p) => monthKey(p.date) === k).reduce((s, p) => s + p.price, 0);
    return { label: monthName(m), short: monthName(m, { month: 'short' }).replace('.', ''), value: v, fmt: eur0(v) };
  });
  const idx = 11 + ui.monthOffset;
  bars?.setData(sums, idx);
  renderMonth(months[idx]);
}

function renderMonth(m) {
  const k = monthKey(m);
  const list = db.purchases.filter((p) => monthKey(p.date) === k).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, p) => s + p.price, 0);
  const budget = Number(db.settings.monthlyBudget) || 0;
  $('#mLabel').textContent = monthName(m);
  $('#mNext').disabled = ui.monthOffset >= 0;
  $('#mPrev').disabled = ui.monthOffset <= -11;
  $('#mTotal').textContent = eur(total);
  $('#mCount').textContent = list.length;
  $('#mAvg').textContent = eur0(list.length ? Math.round(total / list.length) : 0);
  let saved = 0;
  for (const p of list) { const it = db.items.find((i) => i.id === p.itemId); if (it) saved += Math.max(0, maxPrice(it) - p.price); }
  $('#mSaved').textContent = eur0(Math.round(saved));

  // Jauge du budget
  const ratio = budget ? Math.min(total / budget, 1) : 0;
  const over = budget && total > budget;
  const R = 44, L = 2 * Math.PI * R;
  $('#budgetRing').innerHTML = `<svg viewBox="0 0 104 104" style="width:104px;height:104px">
      <circle cx="52" cy="52" r="${R}" stroke="rgba(23,23,28,.12)" stroke-width="12" fill="none"/>
      <circle cx="52" cy="52" r="${R}" stroke="${over ? '#ff4f81' : '#17171c'}" stroke-width="12" fill="none" stroke-linecap="round"
        stroke-dasharray="${L * ratio} ${L}" transform="rotate(-90 52 52)" style="transition:stroke-dasharray .8s"/>
      <text x="52" y="58" text-anchor="middle" font-family="Bricolage, sans-serif" font-weight="800" font-size="20" fill="#17171c" stroke="none">${budget ? Math.round((total / budget) * 100) : 0}%</text></svg>`;
  $('#mBudgetTxt').textContent = budget ? (over ? `${eur0(total - budget)} au-dessus de ton budget de ${eur0(budget)}` : `Il te reste ${eur0(budget - total)} sur ${eur0(budget)}`) : 'Définis un budget dans les réglages';

  // Par catégorie
  const byCat = {};
  for (const p of list) byCat[p.category] = (byCat[p.category] || 0) + p.price;
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('#catBreakdown').innerHTML = rows.length
    ? rows.map(([k, v]) => { const c = CATS[k] || CATS.autre; return `<div class="cat-row"><span>${c.emoji}</span><span>${c.label}</span><strong>${eur0(v)}</strong><div class="bar"><i style="width:${(v / total) * 100}%;background:${c.color}"></i></div></div>`; }).join('')
    : '<p class="muted">Aucun achat ce mois-ci.</p>';

  $('#purchaseList').innerHTML = list.length
    ? list.map((p) => `<li>${thumbHTML(p)}<div><div class="r-title">${esc(p.title)}</div><div class="r-sub">${new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${esc(p.store || '')}</div></div><strong>${eur(p.price)}</strong><button class="del" data-pid="${p.id}" title="Annuler cet achat (l'article revient dans la wishlist)" aria-label="Annuler cet achat"><svg viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`).join('')
    : `<li class="empty-line">Rien d'acheté en ${monthName(m, { month: 'long' })}. Quand tu achètes un article, ouvre-le dans ta wishlist et touche « Marquer comme acheté ».</li>`;
}

// --- Cabine (essayage IA) ---
const outfitItems = () => Object.fromEntries(Object.keys(PIECES).map((k) => [k, db.items.find((i) => i.id === outfit[k]) || null]));

function renderCabinePick() {
  const clothes = db.items.filter((i) => i.category === 'vetements' || pieceOf(i));
  const notes = { top: '', bottom: '', shoes: "affichées avec la tenue, pas encore enfilées par l'IA" };
  let html = '';
  for (const [slot, p] of Object.entries(PIECES)) {
    const list = clothes.filter((i) => pieceOf(i) === slot);
    html += `<div class="slot"><h4>${p.label}${notes[slot] ? `<small>${notes[slot]}</small>` : ''}</h4>`;
    // couleur de référence = pièce déjà choisie dans un autre emplacement
    const refs = PAIRS[slot].map((k) => mainColor(db.items.find((x) => x.id === outfit[k]))).filter(Boolean);
    const good = (i) => mainColor(i) && refs.length && refs.every((r) => harmony(r, mainColor(i)).score >= 0.85);
    html += list.length
      ? `<div class="slot-items">${list.map((i) => `<button class="slot-item ${outfit[slot] === i.id ? 'on' : ''}" data-slot="${slot}" data-id="${i.id}" title="${esc(i.title)} — ${eur(bestPrice(i)?.price)}${good(i) ? ' · couleurs assorties' : ''}" aria-pressed="${outfit[slot] === i.id}">${i.image || i.tryonImage ? `<img src="${esc(i.tryonImage || i.image)}" alt="${esc(i.title)}" referrerpolicy="no-referrer">` : CATS.vetements.emoji}${good(i) && outfit[slot] !== i.id ? '<span class="match-dot" aria-hidden="true">♥</span>' : ''}${mainColor(i) ? `<span class="slot-color" style="background:${mainColor(i)}"></span>` : ''}</button>`).join('')}</div>`
      : `<p class="slot-empty">Aucun ${p.label.toLowerCase()} dans ta wishlist. Ajoute un vêtement, ou choisis son type dans sa fiche.</p>`;
    html += '</div>';
  }
  const sum = Object.values(outfitItems()).reduce((s, i) => s + (i ? bestPrice(i)?.price || 0 : 0), 0);
  html += `<div class="cabine-total"><span class="muted">Total de la tenue</span><strong>${eur(sum)}</strong></div>`;
  $('#cabinePick').innerHTML = html;
  renderHarmony();
  // calcule en arrière-plan les couleurs manquantes, puis redessine une fois
  const missing = clothes.filter((i) => i.status === 'wish' && !(i.palette && i.paletteSrc === (i.tryonImage || i.image)) && (i.tryonImage || i.image));
  if (missing.length && !renderCabinePick.busy) {
    renderCabinePick.busy = true;
    Promise.all(missing.map(ensurePalette)).finally(() => { renderCabinePick.busy = false; renderCabinePick(); });
  }
  const o = outfitItems();
  $('#tryBtn').disabled = cab.busy || !cab.photo || (!o.top && !o.bottom);
  $('#tryBtn').textContent = cab.busy ? 'Essayage en cours…' : !cab.photo ? 'Ajoute ta photo pour commencer' : !o.top && !o.bottom ? 'Choisis un haut ou un bas' : 'Essayer la tenue';
}

function renderHarmony() {
  const box = $('#harmony');
  if (!box) return;
  const o = outfitItems();
  const chosen = Object.entries(o).filter(([, i]) => i && mainColor(i));
  if (!chosen.length) { box.hidden = true; return; }
  box.hidden = false;
  const v = outfitVerdict(chosen.map(([, i]) => mainColor(i)));
  let html = `<h4>Harmonie des couleurs</h4><div class="pchips">${chosen.map(([k, i]) => chipHTML(nearestPantone(mainColor(i)), { size: 's', note: `<small>${PIECES[k].label}</small>`, data: 'data-copy' })).join('')}</div>`;
  if (v) html += `<p class="verdict ${v.level}"><span>${v.level === 'top' ? 'Bel accord' : v.level === 'ok' ? 'Ça passe' : 'Risqué'}</span>${v.label}</p>`;
  // idées de couleurs pour l'emplacement encore vide (haut ou bas)
  const empty = ['bottom', 'top'].find((k) => !o[k]);
  const base = chosen[0][1];
  if (empty) {
    // basiques qui fonctionnent pour l'emplacement vide, filtrés par harmonie et contraste
    const STAPLES = {
      bottom: ['Dark Denim', 'Navy Blazer', 'Jet Black', 'Charcoal Gray', 'Khaki', 'Ecru', 'Oatmeal', 'Olive Branch', 'Camel', 'Chocolate Brown'],
      top: ['Bright White', 'Ecru', 'Neutral Gray', 'Navy Blazer', 'Jet Black', 'Oatmeal', 'Camel', 'Classic Blue', 'Burgundy', 'Olive Branch'],
    };
    const ref = mainColor(base), refL = hexToLch(ref)[0];
    const ideas = pantoneByName(...STAPLES[empty])
      .filter((p) => harmony(ref, p.hex).score >= 0.85 && Math.abs(p.lab[0] - refL) > 12)
      .slice(0, 4);
    html += `<p class="d-sub"><strong>Idées pour le ${PIECES[empty].label.toLowerCase()}</strong> · d'après « ${esc(base.title)} »</p><div class="pchips">${ideas.map((p) => chipHTML(p, { size: 's', data: 'data-copy' })).join('')}</div>`;
  }
  box.innerHTML = html;
}

function setOutfit(slot, id) {
  outfit[slot] = outfit[slot] === id ? null : id;
  renderCabinePick();
  renderStage();
}

function captionHTML(items) {
  return items.filter(Boolean).map((i) => `<span>${i.image || i.tryonImage ? `<img src="${esc(i.tryonImage || i.image)}" alt="" referrerpolicy="no-referrer">` : ''}<b>${esc(i.title)}</b></span>`).join('');
}

function renderStage() {
  const has = !!cab.photo;
  $('#stageDrop').hidden = has;
  $('#stagePhoto').hidden = !has;
  if (!has) return;
  const showing = cab.lookUrl || cab.photo;
  if ($('#stageImg').getAttribute('src') !== showing) $('#stageImg').src = showing;
  $('#stageBefore').src = cab.photo;
  $('#compareBtn').hidden = !cab.lookUrl;
  $('#downloadBtn').hidden = !cab.lookUrl;
  $('#scan').hidden = !cab.busy;
  let items;
  if (cab.lookId) {
    const l = (db.looks || []).find((x) => x.id === cab.lookId);
    items = l ? [l.topId, l.bottomId, l.shoesId].map((id) => db.items.find((i) => i.id === id)) : [];
  } else items = Object.values(outfitItems());
  $('#stageCap').innerHTML = captionHTML(items);
}

async function renderLooks() {
  const looks = db.looks || [];
  $('#looksWrap').hidden = !looks.length;
  $('#looks').innerHTML = looks.map((l) => {
    const its = [l.topId, l.bottomId, l.shoesId].map((id) => db.items.find((i) => i.id === id)).filter(Boolean);
    const total = its.reduce((s, i) => s + (bestPrice(i)?.price || 0), 0);
    return `<li class="look ${cab.lookId === l.id ? 'on' : ''}" data-look="${l.id}" tabindex="0"><img data-lid="${l.id}" alt="Tenue : ${esc(l.titles.join(' + '))}" /><p><b>${eur0(total)}</b>${new Date(l.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</p><button class="x" data-dellook="${l.id}" aria-label="Supprimer cette tenue">✕</button></li>`;
  }).join('');
  for (const img of $$('#looks img[data-lid]')) {
    const id = img.dataset.lid;
    if (!lookCache.has(id)) lookCache.set(id, await api.getLook(id));
    if (lookCache.get(id)) img.src = lookCache.get(id);
  }
}

async function initCabine() {
  if (cab.init) return;
  cab.init = true;
  cab.photo = await api.getPhoto();
  // présélectionne le premier haut et le premier bas
  for (const slot of ['top', 'bottom']) { const first = db.items.find((i) => i.status === 'wish' && pieceOf(i) === slot); if (first && !outfit[slot]) outfit[slot] = first.id; }
  renderCabinePick();
  renderStage();
}

// Redimensionne la photo (max 1024 px de haut) avant de l'enregistrer
function loadPhoto(file) {
  if (!file || !file.type.startsWith('image/')) return toast('Choisis une image (JPG ou PNG)', 'err');
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      const k = Math.min(1, 1024 / img.height);
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/jpeg', 0.92);
      await api.setPhoto(url);
      cab.photo = url; cab.lookId = null; cab.lookUrl = null;
      if (img.width / img.height > 0.95) toast('Astuce : une photo en hauteur (en pied) donne de meilleurs résultats', 'err');
      renderStage(); renderCabinePick(); renderLooks();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function runTryOn() {
  const o = outfitItems();
  cab.busy = true; cab.lookId = null; cab.lookUrl = null;
  $('#tryProgress').hidden = false;
  $('#tpBar').style.width = '2%';
  $('#tpText').textContent = 'Démarrage…';
  renderStage(); renderCabinePick();
  const r = await api.tryOn({ topId: o.top?.id, bottomId: o.bottom?.id, shoesId: o.shoes?.id });
  cab.busy = false;
  $('#tryProgress').hidden = true;
  if (r.ok) {
    lookCache.set(r.look.id, r.dataUrl);
    cab.lookId = r.look.id; cab.lookUrl = r.dataUrl;
    db = await api.getDb();
    toast('Tenue prête, elle est enregistrée dans « Mes tenues »');
    confetti($('#tryBtn'));
  } else toast(r.error, 'err');
  render();
}

function renderSettings() {
  const s = db.settings;
  $('#sAutostart').checked = !!s.autostart;
  $('#sTop').checked = !!s.alwaysOnTop;
  $('#sNotify').checked = s.notify !== false;
  $('#sHours').value = String(s.checkHours || 6);
  $('#sBudget').value = s.monthlyBudget ?? 300;
  if (document.activeElement !== $('#sToken')) $('#sToken').value = s.hfToken || '';
  $('#pinBtn').classList.toggle('on', !!s.alwaysOnTop);
}

// ---------------------------------------------------------------------------
// Fiche article (panneau latéral)
// ---------------------------------------------------------------------------
function historyChart(it) {
  const h = it.history || [];
  if (h.length < 2) return '<p class="muted">L\'historique se construit à chaque vérification. Reviens dans quelques jours.</p>';
  const W = 400, H = 120, P = 8;
  const ps = h.map((x) => x.p), ts = h.map((x) => +new Date(x.d));
  const min = Math.min(...ps) * 0.97, max = Math.max(...ps) * 1.03, t0 = ts[0], t1 = ts.at(-1) || t0 + 1;
  const X = (t) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P), Y = (p) => H - P - ((p - min) / (max - min || 1)) * (H - 2 * P - 14);
  let d = '';
  h.forEach((x, i) => { const xx = X(ts[i]), yy = Y(x.p); d += i ? `H${xx.toFixed(1)}V${yy.toFixed(1)}` : `M${xx.toFixed(1)} ${yy.toFixed(1)}`; });
  d += `H${W - P}`;
  const area = `${d}V${H}H${P}Z`;
  const lo = Math.min(...ps);
  return `<svg class="d-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="#fff4b8" stroke="none"/>
    <path d="${d}" stroke="#17171c" stroke-width="2.5" fill="none" vector-effect="non-scaling-stroke"/>
    ${it.targetPrice ? `<line x1="0" x2="${W}" y1="${Y(it.targetPrice)}" y2="${Y(it.targetPrice)}" stroke="#0fae7b" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>` : ''}
  </svg><p class="muted" style="font-size:13px">Plus bas : ${eur(lo)} · Plus haut : ${eur(Math.max(...ps))} · ${h.length} relevés depuis le ${new Date(h[0].d).toLocaleDateString('fr-FR')}</p>`;
}

function openDrawer(id, refreshOnly = false) {
  const it = db.items.find((i) => i.id === id);
  if (!it) return closeDrawer();
  ui.openId = id;
  const c = CATS[it.category] || CATS.autre;
  const best = bestPrice(it);
  const d = dropOf(it);
  const q = cleanQuery(it.title);
  const shops = [...(SHOPS[it.category] || []), ...SHOPS.common].filter((s, i, a) => a.findIndex((x) => x.name === s.name) === i && !it.store?.includes(s.name.toLowerCase().replace(/\s/g, '')));
  const alts = [{ store: it.store, price: it.price, url: it.url, main: true }, ...(it.alternatives || []).map((a, i) => ({ ...a, idx: i }))];
  const piece = pieceOf(it);

  $('#drawerBody').innerHTML = `
    <div class="d-img">${it.image ? `<img src="${esc(it.image)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith('${c.emoji}')">` : c.emoji}</div>
    <div class="d-body">
      <div class="d-store"><span>${c.emoji} ${c.label}</span><span>·</span><span>${esc(it.store || '')}</span><span>·</span><span>vérifié ${ago(it.lastCheck)}</span></div>
      <label class="d-title-wrap"><span class="sr">Nom de l'article</span><textarea class="d-title" id="dTitle" rows="1" spellcheck="false" title="Clique pour renommer">${esc(it.title)}</textarea><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg></label>
      <div class="d-price">${it.price == null ? `<input type="number" step="0.01" id="dManualPrice" placeholder="Prix €" aria-label="Saisir le prix" />` : `<strong>${eur(best?.price)}</strong>`}
        ${d ? `<s class="muted">${eur(d.from)}</s><span class="pill drop">−${d.pct} %${d.onSite ? ' sur le site' : ''}</span>` : ''}${atTarget(it) ? '<span class="pill target">Prix cible atteint</span>' : ''}</div>
      ${it.fetchError && it.price == null ? `<p class="muted" style="font-size:13px;margin-top:6px">Le site n'a pas laissé lire le prix automatiquement. Saisis-le une fois ; Wishy réessaiera à chaque vérification.</p>` : ''}
      <div class="d-actions">
        ${it.status === 'wish' ? '<button class="btn-sun" data-act="buy">Marquer comme acheté</button>' : `<span class="pill bought">Acheté le ${new Date(it.boughtAt).toLocaleDateString('fr-FR')} · ${eur(it.boughtPrice)}</span>`}
        <button class="btn-ghost" data-act="open">Ouvrir ${best && best.store !== it.store ? 'le moins cher' : 'la boutique'}</button>
        <button class="btn-ghost" data-act="refresh"><span class="spin"></span>Actualiser</button>
      </div>

      <div class="d-section"><h4>Historique du prix</h4>${historyChart(it)}</div>
      ${isClothing(it) ? '<div class="d-section" id="dColors"><h4>Couleurs et combos Pantone</h4><p class="muted" style="font-size:13px">Analyse de la photo…</p></div>' : ''}

      <div class="d-section">
        <h4>Le même ailleurs</h4>
        <ul class="alts">${alts.map((a) => `<li class="${best && a.price === best.price && alts.filter((x) => x.price).length > 1 ? 'best' : ''}"><span class="a-store" data-url="${esc(a.url)}">${esc(a.store)}${a.main ? ' <span class="muted" style="font-weight:400">(lien d\'origine)</span>' : ''}</span><strong>${eur(a.price)}</strong>${a.main ? '' : `<button class="a-x" data-alt="${a.idx}" aria-label="Retirer ce site">✕</button>`}</li>`).join('')}</ul>
        <form class="alt-form" id="altForm"><input id="altUrl" placeholder="Colle le lien du même article sur un autre site" aria-label="Lien sur un autre site" /><button class="btn-ink" type="submit">Suivre</button></form>
        <p class="muted" style="font-size:13px;margin:12px 0 6px">Chercher sur des sites fiables :</p>
        <div class="shops">${shops.map((s) => `<button class="shop" data-url="${esc(s.url(q))}">${s.name}</button>`).join('')}</div>
      </div>

      <div class="d-section">
        <h4>Mes réglages pour cet article</h4>
        <div class="d-grid">
          <label class="field">Prix cible (€)<input type="number" step="0.01" min="0" id="dTarget" value="${it.targetPrice ?? ''}" placeholder="ex. ${best?.price ? Math.round(best.price * 0.8) : 50}" /></label>
          <label class="field">Catégorie<select id="dCat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === it.category ? 'selected' : ''}>${v.emoji} ${v.label}</option>`).join('')}</select></label>
          ${it.category === 'vetements' ? `<label class="field">Type<select id="dPiece"><option value="">Autre / accessoire</option>${Object.entries(PIECES).map(([k, v]) => `<option value="${k}" ${k === piece ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          <label class="field">Taille<input id="dSize" value="${esc(it.size || '')}" placeholder="M, 42, W32…" /></label>
          <label class="field" style="grid-column:1/-1">Photo pour la cabine (lien d'image, facultatif)<input id="dTryImg" value="${esc(it.tryonImage || '')}" placeholder="Idéalement le vêtement seul, sur fond blanc" /></label>` : ''}
          <label class="field" style="grid-column:1/-1">Note (visible dans l'export et le partage)<textarea id="dNotes" class="d-notes" placeholder="Couleur, coupe, idée cadeau…">${esc(it.notes || '')}</textarea></label>
          <div class="field">Priorité<div class="stars">${[1, 2, 3].map((n) => `<button data-prio="${n}" class="${n <= (it.priority || 0) ? 'on' : ''}" aria-label="Priorité ${n}">★</button>`).join('')}</div></div>
        </div>
      </div>
      <div class="d-section">
        <h4>Listes</h4>
        <div class="d-lists">${(db.lists || []).filter((l) => l.itemIds.includes(it.id)).map((l) => `<button class="lchip" data-golist="${l.id}">${esc(l.name)}</button>`).join('')}<button class="lchip add" data-dact="addto">＋ Ajouter à une liste</button></div>
      </div>
      <button class="danger" data-act="delete">Retirer de la wishlist</button>
    </div>`;
  if (isClothing(it)) fillColors(it);
  if (!refreshOnly) {
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('.drawer-x').focus(), 50);
  }
}

function closeDrawer() {
  ui.openId = null;
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function addFromInput() {
  const input = $('#quickUrl');
  const url = input.value.trim();
  if (!url) { input.focus(); return; }
  const btn = $('#addBtn');
  btn.disabled = true;
  btn.textContent = 'Lecture…';
  const r = await api.addItem(url);
  btn.disabled = false;
  btn.textContent = 'Ajouter';
  if (!r.ok) return toast(r.error, 'err');
  input.value = '';
  confetti(btn);
  hero?.pop();
  toast(r.item.price ? `Ajouté · ${eur(r.item.price)}` : 'Ajouté — saisis le prix dans la fiche');
  db = await api.getDb();
  switchView('wishlist');
  render();
  requestAnimationFrame(() => $(`.row[data-id="${r.item.id}"]`)?.classList.add('flash'));
}

async function update(id, patch) { await api.updateItem(id, patch); db = await api.getDb(); render(); }

function switchView(v) {
  $$('.nav').forEach((n) => n.classList.toggle('active', n.dataset.view === v));
  $$('.view').forEach((s) => s.classList.toggle('active', s.id === `view-${v}`));
  $('#main').scrollTop = 0;
  if (v === 'depenses' && !bars) { bars = createBarsScene($('#bars3d'), { onSelect: (i) => { ui.monthOffset = i - 11; renderMonth(monthsWindow()[i]); } }); renderDash(); }
  if (v === 'cabine') initCabine();
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------
$('#quickAdd').addEventListener('submit', (e) => { e.preventDefault(); addFromInput(); });
$('#pasteBtn').addEventListener('click', async () => {
  try { $('#quickUrl').value = (await navigator.clipboard.readText()).trim(); addFromInput(); } catch { $('#quickUrl').focus(); }
});
$('#quickUrl').addEventListener('paste', () => setTimeout(() => { if (/^https?:\/\//.test($('#quickUrl').value.trim())) addFromInput(); }, 0));

$$('.nav').forEach((n) => n.addEventListener('click', () => switchView(n.dataset.view)));
$('#catChips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) { ui.cat = b.dataset.cat; renderChips(); renderList(); } });
$('#search').addEventListener('input', (e) => { ui.q = e.target.value; renderList(); });
$('#sort').addEventListener('change', (e) => { ui.sort = e.target.value; renderList(); });

function toggleSel(id) { ui.sel.has(id) ? ui.sel.delete(id) : ui.sel.add(id); renderList(); }
for (const sel of ['#itemList', '#promoList']) {
  const act = (r) => (ui.selecting && sel === '#itemList' ? toggleSel(r.dataset.id) : openDrawer(r.dataset.id));
  $(sel).addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) act(r); });
  $(sel).addEventListener('keydown', (e) => { const r = e.target.closest('.row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act(r); } });
}

// Sous-listes, sélection, export, partage
async function doExport(items, title) {
  if (!items.length) return toast('Aucun article à exporter', 'err');
  toast('Création du document Word…');
  try {
    const { exportWord } = await import('./export-docx.js');
    await exportWord(items, title, { api, CATS, PIECES, bestPrice, dropOf, pieceOf });
  } catch (e) { console.error(e); toast(`Export impossible : ${e.message}`, 'err'); }
}
async function doShare(L) {
  try {
    const { shareList } = await import('./share.js');
    const r = await shareList(L, { api, saveLists, db: () => db, askText, toast });
    if (r) render();
  } catch (e) { console.error(e); toast(e.message, 'err'); }
}
$('#selectBtn').addEventListener('click', () => { ui.selecting = !ui.selecting; ui.sel.clear(); renderList(); });
$('#listsBar').addEventListener('click', async (e) => {
  const b = e.target.closest('.lchip');
  if (!b) return;
  if ('newlist' in b.dataset) {
    const L = await newList(ui.selecting ? [...ui.sel] : []);
    if (L) { ui.list = L.id; ui.selecting = false; ui.sel.clear(); }
  } else { ui.list = b.dataset.list || null; ui.sel.clear(); }
  ui.cat = 'all';
  render();
});
$('#listHead').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-lact]')?.dataset.lact, L = currentList();
  if (!a || !L) return;
  if (a === 'word') doExport(listItems(L), L.name);
  if (a === 'share') doShare(L);
  if (a === 'unshare') { const { stopSharing } = await import('./share.js'); await stopSharing(L, { api, saveLists, db: () => db, toast }); render(); }
  if (a === 'rename') {
    const name = await askText('Renommer la liste', 'Nouveau nom', L.name, 'Renommer');
    if (name) { await saveLists(db.lists.map((l) => (l.id === L.id ? { ...l, name } : l))); render(); }
  }
  if (a === 'delete') {
    const name = await askText(`Supprimer « ${L.name} » ?`, 'Les articles restent dans ta wishlist. Tape SUPPRIMER pour confirmer', '', 'Supprimer');
    if (name && name.toUpperCase() === 'SUPPRIMER') { await saveLists(db.lists.filter((l) => l.id !== L.id)); ui.list = null; render(); toast('Liste supprimée'); }
  }
});
$('#selBar').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sact]');
  if (!b) return;
  const a = b.dataset.sact, ids = [...ui.sel], L = currentList();
  if (a === 'all') { const all = ui.visible.every((id) => ui.sel.has(id)); ui.sel = new Set(all ? [] : ui.visible); renderList(); }
  if (a === 'addto') openListMenu(b, ids);
  if (a === 'remove' && L) { await saveLists(db.lists.map((l) => (l.id === L.id ? { ...l, itemIds: l.itemIds.filter((id) => !ui.sel.has(id)) } : l))); ui.sel.clear(); render(); toast('Retiré de la liste'); }
  if (a === 'word') doExport(db.items.filter((i) => ui.sel.has(i.id)), L ? L.name : 'Ma wishlist');
});

$('#checkBtn').addEventListener('click', async () => { await api.checkPrices(); db = await api.getDb(); render(); });

// Panneau
$('#drawer').addEventListener('click', async (e) => {
  if (e.target.closest('[data-close]')) return closeDrawer();
  const it = db.items.find((i) => i.id === ui.openId);
  if (!it) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'open') api.open(bestPrice(it)?.url || it.url);
  if (act === 'refresh') {
    const b = e.target.closest('button'); b.classList.add('is-checking'); b.disabled = true;
    await api.refreshItem(it.id); db = await api.getDb(); render(); toast('Prix actualisé');
  }
  if (act === 'delete') { await api.deleteItem(it.id); closeDrawer(); db = await api.getDb(); render(); toast('Retiré de la wishlist'); }
  if (act === 'buy') openBuy(it);
  const chipEl = e.target.closest('.pchip');
  if (chipEl) {
    if (chipEl.dataset.main && chipEl.dataset.main !== mainColor(it)) { update(it.id, { colorOverride: chipEl.dataset.main }); return; }
    const t = chipEl.title.replace(' — cliquer pour copier', '');
    navigator.clipboard?.writeText(t).then(() => toast(`Copié : ${t}`), () => {});
    return;
  }
  const da = e.target.closest('[data-dact="addto"]');
  if (da) { openListMenu(da, [it.id]); return; }
  const gl = e.target.closest('[data-golist]');
  if (gl) { ui.list = gl.dataset.golist; closeDrawer(); switchView('wishlist'); render(); return; }
  const go = e.target.closest('[data-goto]');
  if (go) { openDrawer(go.dataset.goto); return; }
  const shop = e.target.closest('.shop, .a-store');
  if (shop) api.open(shop.dataset.url);
  const altX = e.target.closest('[data-alt]');
  if (altX) { await api.removeAlt(it.id, +altX.dataset.alt); db = await api.getDb(); render(); }
  const prio = e.target.closest('[data-prio]');
  if (prio) update(it.id, { priority: +prio.dataset.prio === it.priority ? 0 : +prio.dataset.prio });
});
$('#drawer').addEventListener('change', (e) => {
  const id = ui.openId;
  if (e.target.id === 'dTitle') {
    const v = e.target.value.replace(/\s+/g, ' ').trim();
    if (v) { update(id, { title: v, titleEdited: true }); toast('Article renommé'); } else e.target.value = db.items.find((i) => i.id === id)?.title || '';
  }
  if (e.target.id === 'dTarget') update(id, { targetPrice: e.target.value ? +e.target.value : null });
  if (e.target.id === 'dCat') update(id, { category: e.target.value, categoryEdited: true });
  if (e.target.id === 'dPiece') update(id, { piece: e.target.value || null });
  if (e.target.id === 'dSize') update(id, { size: e.target.value });
  if (e.target.id === 'dNotes') update(id, { notes: e.target.value.trim() });
  if (e.target.id === 'dTryImg') update(id, { tryonImage: e.target.value.trim() || null });
  if (e.target.id === 'dManualPrice' && e.target.value) update(id, { price: +e.target.value });
});
$('#drawer').addEventListener('submit', async (e) => {
  if (e.target.id !== 'altForm') return;
  e.preventDefault();
  const url = $('#altUrl').value.trim();
  if (!/^https?:\/\//.test(url)) return toast('Colle un lien complet (https://…)', 'err');
  const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = '…';
  const r = await api.addAlt(ui.openId, url);
  db = await api.getDb(); render();
  toast(r.error ? r.error : `Site suivi · ${eur(r.price)}`, r.error ? 'err' : 'ok');
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'dTitle' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); return; }
  if (e.target.id === 'dTitle' && e.key === 'Escape') { e.target.value = db.items.find((i) => i.id === ui.openId)?.title || ''; e.target.blur(); return; }
  if (e.key === 'Escape' && ui.openId) closeDrawer();
});

// Achat
let buyingId = null;
function openBuy(it) {
  buyingId = it.id;
  $('#buyName').textContent = it.title;
  $('#buyPrice').value = bestPrice(it)?.price ?? '';
  $('#buyDate').value = new Date().toISOString().slice(0, 10);
  $('#buyStore').value = bestPrice(it)?.store || it.store || '';
  $('#buyDlg').showModal();
}
$('#buyDlg').addEventListener('close', async () => {
  if ($('#buyDlg').returnValue !== 'ok' || !buyingId) return;
  const date = new Date($('#buyDate').value + 'T12:00:00').toISOString();
  await api.buyItem(buyingId, { price: +$('#buyPrice').value, date, store: $('#buyStore').value });
  buyingId = null;
  closeDrawer();
  db = await api.getDb();
  render();
  confetti($('.nav[data-view="depenses"]'));
  toast('Achat enregistré dans tes dépenses');
});

// Dépenses
$('#mPrev').addEventListener('click', () => { ui.monthOffset = Math.max(-11, ui.monthOffset - 1); bars?.select(11 + ui.monthOffset); renderMonth(monthsWindow()[11 + ui.monthOffset]); });
$('#mNext').addEventListener('click', () => { ui.monthOffset = Math.min(0, ui.monthOffset + 1); bars?.select(11 + ui.monthOffset); renderMonth(monthsWindow()[11 + ui.monthOffset]); });
$('#purchaseList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pid]');
  if (!b) return;
  await api.deletePurchase(b.dataset.pid);
  db = await api.getDb(); render(); toast("Achat annulé, l'article est revenu dans ta wishlist");
});

// Cabine
$('#cabinePick').addEventListener('click', (e) => { const b = e.target.closest('.slot-item'); if (b) setOutfit(b.dataset.slot, b.dataset.id); });
for (const id of ['#photoInput', '#photoInput2']) $(id).addEventListener('change', (e) => { loadPhoto(e.target.files[0]); e.target.value = ''; });
const drop = $('#stageDrop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadPhoto(e.dataTransfer.files[0]); });
$('#tryBtn').addEventListener('click', runTryOn);
$('#harmony').addEventListener('click', (e) => {
  const c = e.target.closest('.pchip');
  if (!c) return;
  const t = c.title.replace(' — cliquer pour copier', '');
  navigator.clipboard?.writeText(t).then(() => toast(`Copié : ${t}`), () => {});
});
const cmp = $('#compareBtn');
const showBefore = (on) => { $('#stageBefore').hidden = !on; cmp.classList.toggle('holding', on); };
cmp.addEventListener('pointerdown', () => showBefore(true));
for (const ev of ['pointerup', 'pointerleave']) cmp.addEventListener(ev, () => showBefore(false));
cmp.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') showBefore(true); });
cmp.addEventListener('keyup', () => showBefore(false));
$('#downloadBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = cab.lookUrl; a.download = `wishy-tenue-${new Date().toISOString().slice(0, 10)}.png`; a.click();
});
$('#looks').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-dellook]');
  if (del) {
    e.stopPropagation();
    await api.deleteLook(del.dataset.dellook);
    if (cab.lookId === del.dataset.dellook) { cab.lookId = null; cab.lookUrl = null; }
    db = await api.getDb(); render(); renderStage(); return;
  }
  const li = e.target.closest('.look');
  if (!li) return;
  cab.lookId = li.dataset.look;
  cab.lookUrl = lookCache.get(cab.lookId) || (await api.getLook(cab.lookId));
  renderStage(); renderLooks();
  $('#stage').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#looks').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.closest('.look')?.click(); });
document.addEventListener('click', (e) => { const a = e.target.closest('[data-ext]'); if (a) { e.preventDefault(); api.open(a.dataset.ext); } });

// Réglages
const setS = async (patch) => { db.settings = await api.setSettings(patch); renderSettings(); renderDash(); };
$('#sAutostart').addEventListener('change', (e) => setS({ autostart: e.target.checked }));
$('#sTop').addEventListener('change', (e) => setS({ alwaysOnTop: e.target.checked }));
$('#sNotify').addEventListener('change', (e) => setS({ notify: e.target.checked }));
$('#sHours').addEventListener('change', (e) => setS({ checkHours: +e.target.value }));
$('#sBudget').addEventListener('change', (e) => setS({ monthlyBudget: +e.target.value }));
$('#sToken').addEventListener('change', (e) => setS({ hfToken: e.target.value.trim() }));
$('#pinBtn').addEventListener('click', () => setS({ alwaysOnTop: !db.settings.alwaysOnTop }));
$('#exportBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `wishy-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
});
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { db = await api.importData(JSON.parse(await f.text())); render(); toast('Sauvegarde restaurée'); } catch { toast("Ce fichier n'est pas une sauvegarde Wishy", 'err'); }
});

// Fenêtre
$('#minBtn').addEventListener('click', () => api.minimize());
$('#maxBtn').addEventListener('click', () => { api.maximize(); document.body.classList.toggle('maxed'); });
$('#closeBtn').addEventListener('click', () => api.hide());

// Messages du processus principal
api.on('db:changed', (d) => { db = d; render(); });
api.on('toast', (t) => toast(t.text, t.type));
api.on('checking', (on) => { $('#checkBtn').classList.toggle('is-checking', on); $('#checkBtn').disabled = on; $('#checkBtn .lbl').textContent = on ? 'Vérification…' : 'Vérifier les prix'; });
api.on('focus-item', (id) => { switchView('wishlist'); openDrawer(id); });
// Synchronisation avec l'iPhone (app PC)
function renderCloud(st) {
  const box = $('#cloudBox');
  if (!box || !st) return;
  if (!st.connected) {
    box.innerHTML = `<div><strong>Synchronisation avec l'iPhone</strong><span>Connecte-toi pour retrouver ta wishlist sur ton iPhone (${esc(st.appUrl.replace('https://', ''))}). Utilise le même compte sur les deux appareils.</span></div>
      <form class="cloud-form" id="cloudForm"><input type="email" name="email" placeholder="Email" autocomplete="email" required /><input type="password" name="password" placeholder="Mot de passe (6 caractères min.)" autocomplete="current-password" minlength="6" required /></form>
      <div class="cloud-actions"><button class="btn-ink" id="cloudLogin">Se connecter</button><button class="btn-ghost" id="cloudSignup">Créer mon compte</button><p class="cloud-msg" id="cloudMsg"></p></div>`;
    const go = async (mode) => {
      const f = $('#cloudForm'), email = f.email.value.trim(), pw = f.password.value;
      if (!email || pw.length < 6) { $('#cloudMsg').textContent = 'Saisis ton email et un mot de passe de 6 caractères minimum.'; return; }
      $('#cloudMsg').textContent = mode === 'signup' ? 'Création du compte…' : 'Connexion…';
      const r = await api.cloudLogin(email, pw, mode);
      $('#cloudMsg').textContent = r.ok ? (r.message || '') : r.error;
    };
    $('#cloudLogin').onclick = () => go('login');
    $('#cloudSignup').onclick = () => go('signup');
    $('#cloudForm').onsubmit = (e) => { e.preventDefault(); go('login'); };
    return;
  }
  const label = { ok: `synchronisé ${ago(st.at)}`, sync: 'synchronisation…', error: `erreur : ${st.error}`, idle: 'connecté' }[st.state] || '';
  const prev = $('#cloudState');
  if (prev && $('#cloudSyncNow')) { prev.innerHTML = `<i class="cloud-dot ${st.state}"></i>${esc(label)}`; return; }
  box.innerHTML = `<div><strong>Synchronisation avec l'iPhone</strong><span>Compte ${esc(st.email)} · <b id="cloudState"><i class="cloud-dot ${st.state}"></i>${esc(label)}</b></span></div>
    <div class="cloud-actions"><button class="btn-ghost" id="cloudSyncNow">Synchroniser maintenant</button><button class="btn-ghost" data-ext="${esc(st.appUrl)}">Ouvrir la version iPhone</button><button class="btn-ghost" id="cloudLogout">Se déconnecter</button></div>`;
  $('#cloudSyncNow').onclick = async () => renderCloud(await api.cloudSync());
  $('#cloudLogout').onclick = async () => renderCloud(await api.cloudLogout());
}
if (api.cloudStatus) {
  api.cloudStatus().then(renderCloud);
  api.on('cloud:status', (st) => { if (!st.connected || !$('#cloudSyncNow')) renderCloud(st); else renderCloud(st); });
}

// Mises à jour
function renderUpdate(u) {
  if (!u) return;
  $('#appVersion').textContent = u.version || '';
  const bar = $('#updateBar');
  bar.hidden = u.status !== 'ready';
  if (u.status === 'ready') $('#updateText').textContent = `Wishy ${u.next} est prêt à être installé.`;
  const info = {
    unsupported: "Mises à jour automatiques indisponibles dans cette version (portable ou mode développeur). Utilise l'installateur Wishy-Setup.",
    checking: 'Recherche de mise à jour…',
    uptodate: 'Tu as la dernière version.',
    downloading: `Téléchargement de la version ${u.next || ''}… ${u.percent || 0} %`,
    ready: `Version ${u.next} téléchargée : redémarre pour l'installer.`,
    error: `Vérification impossible pour le moment (${u.error || 'erreur réseau'}).`,
    idle: 'Wishy se met à jour tout seul depuis GitHub.',
  }[u.status];
  $('#updateInfo').textContent = info || '';
  $('#checkUpdateBtn').disabled = ['checking', 'downloading', 'unsupported'].includes(u.status);
}
if (api.getUpdate) {
  api.getUpdate().then(renderUpdate);
  api.on('update:status', renderUpdate);
  $('#updateBtn').addEventListener('click', () => api.installUpdate());
  $('#checkUpdateBtn').addEventListener('click', async () => renderUpdate(await api.checkUpdate()));
} else { $('#appVersion').textContent = 'démo'; $('#checkUpdateBtn').disabled = true; }
api.on('tryon:progress', ({ text, pct }) => { $('#tpBar').style.width = Math.max(2, pct) + '%'; $('#tpText').textContent = `${text}  ${pct ? pct + ' %' : ''}`; });

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
try { hero = createHeroScene($('#hero3d')); } catch (e) { console.warn('WebGL indisponible', e); }
render();
setInterval(renderHero, 60000);
window.__wishy = { switchView, openDrawer, setOutfit, cab, renderStage, renderCabinePick, ui, render };

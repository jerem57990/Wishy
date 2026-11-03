// Page publique d'une liste partagée (lecture seule).
import CONFIG from './config.js';
import { playGift } from './gift3d.js';

const CATS = {
  vetements: ['Vêtements', '👕'], jeux: ['Jeux vidéo', '🎮'], tech: ['Tech', '💻'], maison: ['Maison', '🛋️'],
  livres: ['Livres', '📚'], sport: ['Sport', '⚽'], parfums: ['Parfums', '🌸'], autre: ['Autre', '✨'],
};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const eur = (n) => (n == null ? '' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n));
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
let items = [], cat = 'all';

function card(it) {
  const c = CATS[it.category] || CATS.autre;
  const price = it.best?.price && it.best.price < (it.price || Infinity) ? it.best.price : it.price;
  const where = it.best?.price === price ? it.best : { store: it.store, url: it.url };
  const ref = Math.max(it.listPrice || 0, it.seenHigh || 0);
  const pct = ref && price && ref > price ? Math.round((1 - price / ref) * 100) : 0;
  const facts = [it.size && `Taille <b>${esc(it.size)}</b>`, it.priority >= 3 && 'Très envie ★★★'].filter(Boolean);
  return `<li class="sh-card${it.status === 'bought' ? ' bought' : ''}">
    <a class="sh-img" href="${esc(safeUrl(where.url))}" target="_blank" rel="noopener noreferrer"><span class="sh-ph" aria-hidden="true">${c[1]}</span>${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span class="sh-cat">${c[1]} ${c[0]}</span>${it.status === 'bought' ? '<span class="sh-bought">Déjà acheté</span>' : ''}</a>
    <div class="sh-body">
      <p class="sh-store">${esc(it.brand || where.store || '')}</p>
      <h2>${esc(it.title)}</h2>
      <p class="sh-price">${eur(price)}${pct ? ` <s>${eur(ref)}</s> <span class="pill drop">−${pct} %</span>` : ''}</p>
      ${facts.length ? `<p class="sh-facts">${facts.join(' · ')}</p>` : ''}
      ${it.notes ? `<p class="sh-note">${esc(it.notes)}</p>` : ''}
      ${it.model3d ? `<button class="sh-3d" data-m3d="${esc(it.model3d)}" data-title="${esc(it.title)}"><b>3D</b> Voir en 3D</button>` : ''}
      <a class="btn-sun sh-go" href="${esc(safeUrl(where.url))}" target="_blank" rel="noopener noreferrer">Voir chez ${esc(where.store || 'la boutique')}</a>
    </div>
  </li>`;
}

function render() {
  const list = cat === 'all' ? items : items.filter((i) => (i.category || 'autre') === cat);
  $('#shGrid').innerHTML = list.map(card).join('');
  const counts = items.reduce((m, i) => ((m[i.category || 'autre'] = (m[i.category || 'autre'] || 0) + 1), m), {});
  const keys = Object.keys(counts);
  $('#shFilters').innerHTML = keys.length > 1 ? [['all', 'Tout', '', items.length], ...keys.map((k) => [k, (CATS[k] || CATS.autre)[0], (CATS[k] || CATS.autre)[1], counts[k]])]
    .map(([k, l, e, n]) => `<button class="chip ${cat === k ? 'active' : ''}" data-cat="${k}">${e ? `<span>${e}</span>` : ''}${l}<small>${n}</small></button>`).join('') : '';
}

$('#shFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; render(); } });

// Visionneuse 3D (et réalité augmentée sur iPhone / Android)
let viewer = null, current = null;
const AR_OK = /iP(hone|ad|od)|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
$('#shGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-m3d]');
  if (!b) return;
  current = { src: b.dataset.m3d, title: b.dataset.title };
  const dlg = $('#sh3d');
  $('#sh3dTitle').textContent = current.title;
  $('#sh3dAr').hidden = !AR_OK;
  dlg.showModal();
  const { mountViewer } = await import('./viewer3d.js');
  viewer?.dispose();
  $('#sh3dStage').innerHTML = '';
  viewer = await mountViewer($('#sh3dStage'), current.src);
});
$('#sh3dAr').addEventListener('click', async () => {
  const { openAR } = await import('./viewer3d.js');
  await openAR({ src: current.src, publicUrl: current.src, key: current.src, title: current.title });
});
$('#sh3d').addEventListener('close', () => { viewer?.dispose(); viewer = null; });
$('#sh3dClose').addEventListener('click', () => $('#sh3d').close());

const token = new URLSearchParams(location.search).get('l');
try {
  if (!token) throw new Error('Lien de partage incomplet.');
  const r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/shared-list?l=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (!data.ok) throw new Error(data.error || 'Liste introuvable.');
  items = data.items;
  document.title = `${data.name} · Wishy`;
  $('#shTitle').textContent = data.name;
  const total = items.filter((i) => i.status !== 'bought').reduce((s, i) => s + (Math.min(i.price || Infinity, i.best?.price || Infinity) || 0), 0);
  $('#shMeta').textContent = `${items.length} article${items.length > 1 ? 's' : ''} · ${eur(isFinite(total) ? total : 0)} · mise à jour le ${new Date(data.updatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  render();
  // ouverture du cadeau, une fois par liste et par appareil
  const seenKey = `wishy-gift-${token}`;
  let seen = false;
  try { seen = localStorage.getItem(seenKey) === '1'; localStorage.setItem(seenKey, '1'); } catch { /* navigation privée */ }
  if (!seen && items.length) { document.body.classList.add('gifting'); playGift({ title: data.name, onDone: () => document.body.classList.remove('gifting') }); }
  if (!items.length) { $('#shEmpty').hidden = false; $('#shEmpty').textContent = 'Cette liste est vide pour le moment.'; }
} catch (e) {
  $('#shTitle').textContent = 'Liste indisponible';
  $('#shEmpty').hidden = false;
  $('#shEmpty').textContent = e.message;
}

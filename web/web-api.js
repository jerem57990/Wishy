// API de Wishy pour la web app iPhone : même interface que le preload Electron (window.api),
// mais les données vivent dans le navigateur et se synchronisent avec Supabase.
import { createClient } from './vendor/supabase.js';
import { emptyMeta, markChanges, push, pull, syncSettings } from './sync-core.mjs';
import { tryOnWeb } from './web-tryon.js';
import { generateGLB } from './model3d-core.mjs';
import CONFIG from './config.js';

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const LS_DB = 'wishy-db', LS_META = 'wishy-sync-meta';
const DEFAULT = { items: [], purchases: [], lists: [], looks: [], cabine: { hasPhoto: false }, settings: { monthlyBudget: 300, notify: true, hfToken: '' } };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => JSON.parse(JSON.stringify(o));

let db = (() => { try { const d = JSON.parse(localStorage.getItem(LS_DB)); return d ? { ...DEFAULT, ...d, settings: { ...DEFAULT.settings, ...d.settings } } : clone(DEFAULT); } catch { return clone(DEFAULT); } })();
let meta = (() => { try { return JSON.parse(localStorage.getItem(LS_META)) || emptyMeta(); } catch { return emptyMeta(); } })();

const listeners = {};
const emit = (ch, data) => (listeners[ch] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } });

function persist() {
  try { localStorage.setItem(LS_DB, JSON.stringify(db)); localStorage.setItem(LS_META, JSON.stringify(meta)); }
  catch (e) { console.warn('Stockage plein', e); }
}
let settingsDirty = false;
function save({ silent = false, settings = false } = {}) {
  if (settings) settingsDirty = true;
  persist();
  scheduleSync();
  if (!silent) emit('db:changed', clone(db));
}

// ---------- Synchronisation ----------
let syncTimer = null, syncing = false, again = false;
export const syncStatus = { state: 'idle', at: null, error: null };
function scheduleSync(delay = 1200) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay); }
export async function syncNow() {
  if (syncing) { again = true; return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  syncing = true;
  Object.assign(syncStatus, { state: 'sync', error: null });
  emit('sync', { ...syncStatus });
  try {
    markChanges(db, meta);
    await push(supabase, db, meta);
    const applied = await pull(supabase, db, meta);
    const s = await syncSettings(supabase, db, meta, settingsDirty);
    settingsDirty = false;
    persist();
    if (applied || s === 'pulled') emit('db:changed', clone(db));
    Object.assign(syncStatus, { state: 'ok', at: new Date().toISOString() });
  } catch (e) {
    Object.assign(syncStatus, { state: 'error', error: String(e.message || e) });
  } finally {
    syncing = false;
    emit('sync', { ...syncStatus });
    if (again) { again = false; scheduleSync(300); }
  }
}
let channel = null;
export function startSync() {
  syncNow();
  setInterval(syncNow, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  if (!channel) {
    channel = supabase.channel('wishy-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => scheduleSync(400))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => scheduleSync(400))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => scheduleSync(400))
      .subscribe();
  }
}
export function resetLocal() {
  db = clone(DEFAULT); meta = emptyMeta(); persist();
}

// ---------- Fonctions Edge ----------
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || 'Service indisponible');
  return data;
}
const fetchProduct = (url) => invoke('fetch-product', { url }).catch((e) => ({ ok: false, error: e.message, url }));

// ---------- Photos (IndexedDB) ----------
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('wishy', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('blobs');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idbGet(k) { const d = await idb; return new Promise((res) => { const q = d.transaction('blobs').objectStore('blobs').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function idbSet(k, v) { const d = await idb; return new Promise((res) => { const t = d.transaction('blobs', 'readwrite'); v == null ? t.objectStore('blobs').delete(k) : t.objectStore('blobs').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); }

// ---------- Prix ----------
// Prix en devise étrangère : si le prix d'origine n'a pas bougé, on garde le prix en euros
// déjà connu (sinon chaque variation du taux de change ressemblerait à une promo).
function keepFx(item, info) {
  if (!info || !info.ok) return info;
  const a = item.priceOrig, b = info.priceOrig;
  // article ajouté avant la conversion : son prix était en devise étrangère, on convertit l'historique
  if (!a && b && info.fx?.rate && item.price != null && Math.abs(item.price - b.amount) < 0.005) {
    const k = info.fx.rate, c = (n) => (n == null ? n : Math.round(n * k * 100) / 100);
    item.price = c(item.price); item.listPrice = c(item.listPrice); item.targetPrice = c(item.targetPrice);
    for (const h of item.history || []) h.p = c(h.p);
    item.currency = 'EUR';
    info.price = item.price;
    if (info.listPrice && item.listPrice) info.listPrice = item.listPrice;
  } else if (a && b && a.currency === b.currency && Math.abs(a.amount - b.amount) < 0.005 && item.price != null) {
    info.price = item.price;
    if (info.listPrice && item.listPrice) info.listPrice = item.listPrice;
  }
  if (b) { item.priceOrig = b; item.fx = info.fx; } else { delete item.priceOrig; delete item.fx; }
  if (info.options?.length && !item.options?.length) item.options = info.options;
  return info;
}
async function checkItem(item) {
  const now = new Date().toISOString();
  const info = keepFx(item, await fetchProduct(item.url));
  if (info.ok && info.price) {
    if (!item.image && info.image) item.image = info.image;
    if (item.price && info.price < item.price - 0.009) item.lastDrop = { from: item.price, to: info.price, d: now };
    if (item.price !== info.price) (item.history = item.history || []).push({ d: now, p: info.price });
    item.price = info.price;
    item.listPrice = info.listPrice || null;
    item.fetchError = null;
    delete item.needsFetch;
  } else if (!item.price) item.fetchError = info.error || 'Prix non détecté';
  for (const alt of item.alternatives || []) {
    const a = await fetchProduct(alt.url);
    if (a.ok && a.price) { alt.price = a.price; alt.lastCheck = now; }
  }
  item.lastCheck = now;
}

// ---------- API identique à celle de l'app PC ----------
const api = {
  platform: 'web',
  getDb: async () => clone(db),

  async addItem(url, extra = {}) {
    url = String(url || '').trim();
    const m = url.match(/https?:\/\/\S+/);
    if (!m) return { ok: false, error: "Ce n'est pas un lien valide" };
    url = m[0];
    const existing = db.items.find((i) => i.url === url);
    if (existing) return { ok: false, error: 'Déjà dans ta wishlist', item: existing };
    const info = await fetchProduct(url);
    const now = new Date().toISOString();
    let host = ''; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    const item = {
      id: uid(), url: info.url || url, title: extra.title || info.title || info.store || host || 'Article', image: info.image || null,
      price: extra.price ?? info.price ?? null, listPrice: info.listPrice || null, currency: info.currency || 'EUR', store: info.store || host, brand: info.brand || null,
      priceOrig: info.priceOrig || undefined, fx: info.fx || undefined, options: info.options?.length ? info.options : undefined,
      category: extra.category || info.category || 'autre', size: '', targetPrice: null, priority: 2, addedAt: now, lastCheck: now,
      status: 'wish', history: info.price ? [{ d: now, p: info.price }] : [], alternatives: [],
      fetchError: info.ok && info.price ? null : (info.error || 'Prix non détecté — tu peux le saisir à la main'),
      ...(info.ok ? {} : { needsFetch: true }),
    };
    db.items.unshift(item);
    save({ silent: true });
    return { ok: true, item };
  },
  async updateItem(id, patch) {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    if (patch.price != null && patch.price !== it.price) (it.history = it.history || []).push({ d: new Date().toISOString(), p: patch.price });
    Object.assign(it, patch);
    if (patch.price != null) it.fetchError = null;
    for (const p of db.purchases) if (p.itemId === id) { if (patch.title) p.title = patch.title; if (patch.category) p.category = patch.category; }
    save({ silent: true });
    return { ok: true, item: it };
  },
  async setLists(lists) { db.lists = Array.isArray(lists) ? lists : []; save({ silent: true }); return { ok: true }; },
  async deleteItem(id) { db.items = db.items.filter((i) => i.id !== id); save({ silent: true }); return { ok: true }; },
  async refreshItem(id) { const it = db.items.find((i) => i.id === id); if (it) { await checkItem(it); save({ silent: true }); } return { ok: true, item: it }; },
  async addAlt(id, url) {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    const info = await fetchProduct(url);
    (it.alternatives = it.alternatives || []).push({ url: info.url || url, store: info.store, price: info.price || null, lastCheck: new Date().toISOString() });
    save({ silent: true });
    return { ok: true, price: info.price, error: info.price ? null : 'Prix non détecté sur ce site' };
  },
  async removeAlt(id, idx) { const it = db.items.find((i) => i.id === id); if (it) { it.alternatives.splice(idx, 1); save({ silent: true }); } return { ok: true }; },
  async buyItem(id, { price, date, store }) {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    Object.assign(it, { status: 'bought', boughtAt: date || new Date().toISOString(), boughtPrice: price ?? it.price });
    db.purchases.push({ id: uid(), itemId: it.id, title: it.title, image: it.image, category: it.category, price: it.boughtPrice, date: it.boughtAt, store: store || it.store });
    save({ silent: true });
    return { ok: true };
  },
  async deletePurchase(pid) {
    const p = db.purchases.find((x) => x.id === pid);
    db.purchases = db.purchases.filter((x) => x.id !== pid);
    if (p) { const it = db.items.find((i) => i.id === p.itemId); if (it) it.status = 'wish'; }
    save({ silent: true });
    return { ok: true };
  },
  async checkPrices() {
    emit('checking', true);
    let n = 0;
    try {
      for (const it of db.items.filter((i) => i.status === 'wish')) { await checkItem(it); n++; }
      db.lastGlobalCheck = new Date().toISOString();
      save({ silent: true });
    } finally { emit('checking', false); }
    emit('toast', { type: 'ok', text: `${n} article(s) vérifié(s)` });
    return { ok: true, count: n };
  },
  async setSettings(patch) { Object.assign(db.settings, patch); save({ silent: true, settings: true }); return db.settings; },
  async importData(data) { if (data && Array.isArray(data.items)) { db = { ...clone(DEFAULT), ...data }; save(); } return clone(db); },
  async open(url) { window.open(url, '_blank', 'noopener'); },
  async imageData(url) {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    try { const r = await invoke('fetch-product', { image: url }); return r.ok ? r.dataUrl : null; } catch { return null; }
  },
  minimize() {}, hide() {}, maximize() {},

  // 3D : photo → modèle GLB (TRELLIS), stocké dans Supabase Storage pour tous les appareils et le partage
  async make3D(id) {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false, error: 'Article introuvable' };
    try {
      const src = await api.imageData(it.tryonImage || it.image);
      if (!src) throw new Error("La photo de l'article est inaccessible");
      const photo = await (await fetch(src)).blob();
      const gradio = await import('./vendor/gradio.js');
      const glb = await generateGLB(gradio, photo, db.settings.hfToken, (text, pct) => emit('3d:progress', { text, pct: Math.round(pct) }));
      const { data: { session } } = await supabase.auth.getSession();
      const path = `${session.user.id}/${id}.glb`;
      const up = await supabase.storage.from('models').upload(path, new Blob([glb], { type: 'model/gltf-binary' }), { upsert: true, contentType: 'model/gltf-binary' });
      if (up.error) throw new Error(`Enregistrement impossible : ${up.error.message}`);
      const url = supabase.storage.from('models').getPublicUrl(path).data.publicUrl + `?v=${Date.now().toString(36)}`;
      it.model3d = url;
      it.model3dAt = new Date().toISOString();
      save({ silent: true });
      return { ok: true, url };
    } catch (e) { return { ok: false, error: e.message }; }
  },
  modelData: async () => null,

  // Cabine
  async setPhoto(dataUrl) { await idbSet('person', dataUrl); db.cabine = { ...(db.cabine || {}), hasPhoto: true }; persist(); return { ok: true }; },
  getPhoto: () => idbGet('person'),
  async tryOn({ topId, bottomId, shoesId }) {
    const person = await idbGet('person');
    if (!person) return { ok: false, error: "Ajoute d'abord une photo de toi" };
    const top = db.items.find((i) => i.id === topId), bottom = db.items.find((i) => i.id === bottomId);
    if (!top && !bottom) return { ok: false, error: 'Choisis au moins un haut ou un bas' };
    try {
      const outfit = {};
      for (const [slot, it] of [['top', top], ['bottom', bottom]]) {
        if (!it) continue;
        const src = await api.imageData(it.tryonImage || it.image);
        if (!src) throw new Error(`La photo de « ${it.title} » est inaccessible. Mets un autre lien d'image dans sa fiche.`);
        outfit[slot] = { image: src, title: it.title };
      }
      const result = await tryOnWeb(person, outfit, db.settings.hfToken, (text, pct) => emit('tryon:progress', { text, pct: Math.round(pct) }));
      const look = { id: uid(), date: new Date().toISOString(), topId: top?.id || null, bottomId: bottom?.id || null, shoesId: shoesId || null, titles: [top?.title, bottom?.title].filter(Boolean) };
      await idbSet('look:' + look.id, result);
      db.looks = [look, ...(db.looks || [])].slice(0, 40);
      persist();
      return { ok: true, look, dataUrl: result };
    } catch (e) { return { ok: false, error: e.message }; }
  },
  getLook: (id) => idbGet('look:' + id),
  async deleteLook(id) { db.looks = (db.looks || []).filter((l) => l.id !== id); await idbSet('look:' + id, null); persist(); return { ok: true }; },

  on: (ch, cb) => { (listeners[ch] = listeners[ch] || []).push(cb); },
};

export default api;

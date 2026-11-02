const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, globalShortcut, clipboard, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { fetchProduct } = require('./scraper');
const { tryOn, download } = require('./tryon');
const { autoUpdater } = require('electron-updater');
const cloud = require('./cloud');

app.setAppUserModelId('fr.jeremy.wishy'); // nécessaire pour les notifications Windows

let win = null;
let tray = null;
let quitting = false;
let checkTimer = null;
let checking = false;

// ---------- Stockage JSON local (%APPDATA%/Wishy/wishy-data.json) ----------
const DATA_FILE = () => path.join(app.getPath('userData'), 'wishy-data.json');
const DEFAULT = {
  items: [],
  purchases: [],
  looks: [],
  cabine: { hasPhoto: false },
  settings: { checkHours: 6, alwaysOnTop: false, autostart: false, monthlyBudget: 300, notify: true, compact: false, hfToken: '' },
};

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'));
    return { ...DEFAULT, ...d, settings: { ...DEFAULT.settings, ...(d.settings || {}) } };
  } catch (_) {
    return structuredClone(DEFAULT);
  }
}
let db = null;
function writeDb() {
  const f = DATA_FILE();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(f + '.tmp', f);
}
function save({ settings = false } = {}) {
  writeDb();
  if (win && !win.isDestroyed()) win.webContents.send('db:changed', db);
  cloud.schedule({ settings });
}
// Après une synchronisation : on enregistre ; si des données sont arrivées du cloud, on rafraîchit l'écran
// et on complète les fiches ajoutées depuis l'iPhone que le cloud n'a pas réussi à lire.
async function afterSync(applied) {
  writeDb();
  if (!applied) return;
  if (win && !win.isDestroyed()) win.webContents.send('db:changed', db);
  const pending = db.items.filter((i) => i.needsFetch && i.status === 'wish');
  for (const it of pending) { await checkItem(it); await sleep(800); }
  if (pending.length) save();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Fenêtre widget ----------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const W = 1180, H = 780;
  win = new BrowserWindow({
    width: W, height: H, minWidth: 420, minHeight: 600,
    x: workArea.x + workArea.width - W - 24, y: workArea.y + Math.max(16, (workArea.height - H) / 2),
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: true,
    alwaysOnTop: db.settings.alwaysOnTop, show: false, title: 'Wishy',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
  else { win.show(); win.focus(); }
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16 }) : img);
  tray.setToolTip('Wishy — ta wishlist');
  tray.on('click', toggleWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir Wishy', click: () => { win.show(); win.focus(); } },
    { label: 'Ajouter le lien copié  (Ctrl+Alt+W)', click: addFromClipboard },
    { label: 'Vérifier les prix maintenant', click: () => checkPrices(true) },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---------- Ajout d'articles ----------
async function addItem(url, extra = {}) {
  url = String(url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Ce n'est pas un lien valide" };
  const existing = db.items.find((i) => i.url === url);
  if (existing) return { ok: false, error: 'Déjà dans ta wishlist', item: existing };

  const info = await fetchProduct(url);
  const now = new Date().toISOString();
  const item = {
    id: uid(),
    url: info.url || url,
    title: extra.title || info.title || info.store || 'Article',
    image: info.image || null,
    price: extra.price ?? info.price ?? null,
    currency: info.currency || 'EUR',
    store: info.store,
    brand: info.brand || null,
    category: extra.category || info.category || 'autre',
    size: extra.size || '',
    targetPrice: extra.targetPrice ?? null,
    priority: extra.priority || 2,
    addedAt: now,
    lastCheck: now,
    status: 'wish',
    history: info.price ? [{ d: now, p: info.price }] : [],
    alternatives: [],
    fetchError: info.ok && info.price ? null : (info.error || 'Prix non détecté — tu peux le saisir à la main'),
  };
  db.items.unshift(item);
  save();
  return { ok: true, item };
}

async function addFromClipboard() {
  const text = clipboard.readText().trim();
  const r = await addItem(text);
  if (Notification.isSupported()) {
    new Notification({
      title: r.ok ? '✨ Ajouté à ta wishlist' : 'Wishy',
      body: r.ok ? `${r.item.title}${r.item.price ? ' — ' + fmt(r.item.price) : ''}` : r.error,
      icon: path.join(__dirname, 'assets', 'icon.png'),
    }).show();
  }
  if (win) win.webContents.send('toast', r.ok ? { type: 'ok', text: 'Ajouté depuis le presse-papiers' } : { type: 'err', text: r.error });
}

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

// ---------- Suivi des prix ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notifyDrop(item, oldP, newP, where) {
  if (!db.settings.notify || !Notification.isSupported()) return;
  const pct = Math.round((1 - newP / oldP) * 100);
  const n = new Notification({
    title: `🔥 -${pct}% sur ${item.title.slice(0, 50)}`,
    body: `${fmt(oldP)} → ${fmt(newP)} chez ${where}${item.targetPrice && newP <= item.targetPrice ? '  •  Prix cible atteint !' : ''}`,
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });
  n.on('click', () => { win.show(); win.focus(); win.webContents.send('focus-item', item.id); });
  n.show();
}

async function checkItem(item) {
  const now = new Date().toISOString();
  const info = await fetchProduct(item.url);
  if (info.ok && item.needsFetch) {
    // article ajouté depuis l'iPhone dont la fiche n'a pas pu être lue dans le cloud
    if (!item.titleEdited && info.title) item.title = info.title;
    if (info.store) item.store = info.store;
    if (!item.categoryEdited && info.category && info.category !== 'autre') item.category = info.category;
    if (info.ok) delete item.needsFetch;
  }
  if (info.ok && info.price) {
    const old = item.price;
    if (!item.image && info.image) item.image = info.image;
    if (old && info.price < old - 0.009) {
      notifyDrop(item, old, info.price, item.store);
      item.lastDrop = { from: old, to: info.price, d: now };
    } else if (!old && item.targetPrice && info.price <= item.targetPrice) {
      notifyDrop(item, info.price, info.price, item.store);
    }
    if (old !== info.price) (item.history = item.history || []).push({ d: now, p: info.price });
    item.price = info.price;
    item.fetchError = null;
  } else if (!item.price) {
    item.fetchError = info.error || 'Prix non détecté';
  }
  for (const alt of item.alternatives || []) {
    await sleep(800);
    const a = await fetchProduct(alt.url);
    if (a.ok && a.price) {
      if (alt.price && a.price < alt.price - 0.009 && (!item.price || a.price < item.price)) notifyDrop(item, alt.price, a.price, alt.store);
      alt.price = a.price;
      alt.lastCheck = now;
    }
  }
  item.lastCheck = now;
}

async function checkPrices(manual = false) {
  if (checking) return { ok: false, error: 'Vérification déjà en cours' };
  checking = true;
  if (win) win.webContents.send('checking', true);
  let n = 0;
  try {
    for (const item of db.items.filter((i) => i.status === 'wish')) {
      await checkItem(item);
      n++;
      await sleep(1200); // on reste poli avec les sites
    }
    db.lastGlobalCheck = new Date().toISOString();
    save();
  } finally {
    checking = false;
    if (win) win.webContents.send('checking', false);
  }
  if (manual && win) win.webContents.send('toast', { type: 'ok', text: `${n} article(s) vérifié(s)` });
  return { ok: true, count: n };
}

function scheduleChecks() {
  clearInterval(checkTimer);
  const h = Math.max(1, Number(db.settings.checkHours) || 6);
  checkTimer = setInterval(() => checkPrices(false), h * 3600 * 1000);
}

// ---------- Mises à jour automatiques (GitHub Releases) ----------
let updateState = { status: 'idle', version: app.getVersion() };
function sendUpdate(patch) {
  updateState = { ...updateState, ...patch };
  if (win && !win.isDestroyed()) win.webContents.send('update:status', updateState);
}
function setupUpdater() {
  // en développement (npm start) ou en version portable, pas de mise à jour automatique
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) {
    sendUpdate({ status: 'unsupported' });
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => sendUpdate({ status: 'uptodate', checkedAt: new Date().toISOString() }));
  autoUpdater.on('update-available', (i) => sendUpdate({ status: 'downloading', next: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => {
    sendUpdate({ status: 'ready', next: i.version });
    if (Notification.isSupported()) {
      const n = new Notification({ title: `Wishy ${i.version} est prêt`, body: 'Redémarre Wishy pour installer la mise à jour.', icon: path.join(__dirname, 'assets', 'icon.png') });
      n.on('click', () => { win.show(); win.focus(); });
      n.show();
    }
  });
  autoUpdater.on('error', (e) => sendUpdate({ status: 'error', error: String(e?.message || e).slice(0, 200) }));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 10000);
  setInterval(check, 4 * 3600 * 1000);
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('db:get', () => db);
  ipcMain.handle('cloud:status', () => cloud.status());
  ipcMain.handle('cloud:login', (_, email, password, mode) => cloud.login(email, password, mode));
  ipcMain.handle('cloud:logout', () => cloud.logout());
  ipcMain.handle('cloud:sync', async () => { await cloud.syncNow(); return cloud.status(); });
  ipcMain.handle('update:get', () => updateState);
  ipcMain.handle('update:check', async () => {
    if (updateState.status === 'unsupported') return updateState;
    try { await autoUpdater.checkForUpdates(); } catch (e) { sendUpdate({ status: 'error', error: String(e?.message || e).slice(0, 200) }); }
    return updateState;
  });
  ipcMain.handle('update:install', () => {
    if (updateState.status !== 'ready') return { ok: false };
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
  ipcMain.handle('item:add', (_, url, extra) => addItem(url, extra));
  ipcMain.handle('item:update', (_, id, patch) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    if (patch.price != null && patch.price !== it.price) it.history.push({ d: new Date().toISOString(), p: patch.price });
    Object.assign(it, patch);
    if (patch.price != null) it.fetchError = null;
    // un nom ou une catégorie modifiés à la main se reportent sur les achats liés
    for (const p of db.purchases) if (p.itemId === id) { if (patch.title) p.title = patch.title; if (patch.category) p.category = patch.category; }
    save();
    return { ok: true, item: it };
  });
  ipcMain.handle('item:delete', (_, id) => { db.items = db.items.filter((i) => i.id !== id); save(); return { ok: true }; });
  ipcMain.handle('item:refresh', async (_, id) => { const it = db.items.find((i) => i.id === id); if (it) { await checkItem(it); save(); } return { ok: true, item: it }; });
  ipcMain.handle('item:addAlt', async (_, id, url) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    const info = await fetchProduct(url);
    it.alternatives = it.alternatives || [];
    it.alternatives.push({ url: info.url || url, store: info.store, price: info.price || null, lastCheck: new Date().toISOString() });
    save();
    return { ok: true, price: info.price, error: info.price ? null : 'Prix non détecté sur ce site' };
  });
  ipcMain.handle('item:removeAlt', (_, id, idx) => { const it = db.items.find((i) => i.id === id); if (it) { it.alternatives.splice(idx, 1); save(); } return { ok: true }; });
  ipcMain.handle('item:buy', (_, id, { price, date, store }) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) return { ok: false };
    it.status = 'bought';
    it.boughtAt = date || new Date().toISOString();
    it.boughtPrice = price ?? it.price;
    db.purchases.push({ id: uid(), itemId: it.id, title: it.title, image: it.image, category: it.category, price: it.boughtPrice, date: it.boughtAt, store: store || it.store });
    save();
    return { ok: true };
  });
  ipcMain.handle('purchase:delete', (_, pid) => {
    const p = db.purchases.find((x) => x.id === pid);
    db.purchases = db.purchases.filter((x) => x.id !== pid);
    if (p) { const it = db.items.find((i) => i.id === p.itemId); if (it) it.status = 'wish'; }
    save();
    return { ok: true };
  });
  ipcMain.handle('prices:check', () => checkPrices(true));
  ipcMain.handle('settings:set', (_, patch) => {
    Object.assign(db.settings, patch);
    if ('alwaysOnTop' in patch) win.setAlwaysOnTop(!!patch.alwaysOnTop);
    if ('autostart' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.autostart, args: ['--hidden'] });
    if ('checkHours' in patch) scheduleChecks();
    save({ settings: 'monthlyBudget' in patch || 'hfToken' in patch });
    return db.settings;
  });
  ipcMain.handle('data:import', (_, data) => { if (data && Array.isArray(data.items)) { db = { ...DEFAULT, ...data }; save(); } return db; });
  ipcMain.handle('open', (_, url) => shell.openExternal(url));
  // Image produit en data-URL (évite les blocages CORS pour les textures 3D de la cabine)
  ipcMain.handle('img:data', async (_, url) => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } });
      const buf = Buffer.from(await r.arrayBuffer());
      return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
    } catch (_) { return null; }
  });
  // ---------- Cabine d'essayage IA ----------
  const cabDir = () => { const d = path.join(app.getPath('userData'), 'cabine'); fs.mkdirSync(path.join(d, 'looks'), { recursive: true }); return d; };
  const personFile = () => path.join(cabDir(), 'person.jpg');
  const lookFile = (id) => path.join(cabDir(), 'looks', id + '.png');
  const toDataUrl = (file, mime) => (fs.existsSync(file) ? `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` : null);
  let tryingOn = false;

  ipcMain.handle('cabine:setPhoto', (_, dataUrl) => {
    const b64 = String(dataUrl).split(',')[1];
    if (!b64) return { ok: false };
    fs.writeFileSync(personFile(), Buffer.from(b64, 'base64'));
    db.cabine = { ...(db.cabine || {}), hasPhoto: true, photoAt: new Date().toISOString() };
    save();
    return { ok: true };
  });
  ipcMain.handle('cabine:photo', () => toDataUrl(personFile(), 'image/jpeg'));
  ipcMain.handle('cabine:look', (_, id) => toDataUrl(lookFile(id), 'image/png'));
  ipcMain.handle('cabine:deleteLook', (_, id) => {
    db.looks = (db.looks || []).filter((l) => l.id !== id);
    try { fs.unlinkSync(lookFile(id)); } catch (_) {}
    save();
    return { ok: true };
  });
  ipcMain.handle('cabine:tryon', async (_, { topId, bottomId, shoesId }) => {
    if (tryingOn) return { ok: false, error: 'Un essayage est déjà en cours' };
    if (!fs.existsSync(personFile())) return { ok: false, error: "Ajoute d'abord une photo de toi" };
    const top = db.items.find((i) => i.id === topId);
    const bottom = db.items.find((i) => i.id === bottomId);
    if (!top && !bottom) return { ok: false, error: 'Choisis au moins un haut ou un bas' };
    tryingOn = true;
    const progress = (text, pct) => win && win.webContents.send('tryon:progress', { text, pct: Math.round(pct) });
    try {
      progress('Préparation des photos des vêtements…', 1);
      const outfit = {};
      for (const [slot, it] of [['top', top], ['bottom', bottom]]) {
        if (!it) continue;
        const src = it.tryonImage || it.image;
        if (!src) throw new Error(`« ${it.title} » n'a pas de photo. Ajoute un lien d'image dans sa fiche.`);
        outfit[slot] = { image: await download(src), title: it.title };
      }
      const result = await tryOn(fs.readFileSync(personFile()), outfit, db.settings.hfToken, progress);
      const look = {
        id: uid(), date: new Date().toISOString(),
        topId: top?.id || null, bottomId: bottom?.id || null, shoesId: shoesId || null,
        titles: [top?.title, bottom?.title].filter(Boolean),
      };
      fs.writeFileSync(lookFile(look.id), result);
      db.looks = [look, ...(db.looks || [])].slice(0, 60);
      save();
      return { ok: true, look, dataUrl: `data:image/png;base64,${result.toString('base64')}` };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      tryingOn = false;
    }
  });

  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:hide', () => win.hide());
  ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
}

// ---------- Démarrage ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    db = load();
    registerIpc();
    createWindow();
    createTray();
    if (process.argv.includes('--hidden')) win.once('ready-to-show', () => win.hide());
    globalShortcut.register('CommandOrControl+Alt+W', addFromClipboard);
    globalShortcut.register('CommandOrControl+Alt+Space', toggleWindow);
    scheduleChecks();
    setupUpdater();
    cloud.init({
      dir: app.getPath('userData'),
      getDb: () => db,
      persist: (applied) => afterSync(applied),
      onStatus: (st) => win && !win.isDestroyed() && win.webContents.send('cloud:status', st),
    }).catch((e) => console.error('Synchronisation indisponible', e));
    setTimeout(() => checkPrices(false), 20000); // 1re vérif 20 s après le lancement
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', (e) => e.preventDefault());
}

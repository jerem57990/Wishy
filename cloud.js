// Synchronisation de Wishy PC avec le compte Supabase (le même que la web app iPhone).
const fs = require('fs');
const path = require('path');
const CLOUD = require('./cloud-config.json');

let lib = null;
async function libs() {
  if (!lib) {
    const [{ createClient }, core] = await Promise.all([import('@supabase/supabase-js'), import('./sync-core.mjs')]);
    lib = { createClient, core };
  }
  return lib;
}

let ctx = null;          // { dir, getDb, onApplied, onStatus }
let sb = null;
let meta = null;
let timer = null, pollTimer = null, syncing = false, again = false, settingsDirty = false;
const status = { connected: false, email: null, state: 'off', at: null, error: null, appUrl: CLOUD.APP_URL };

const metaFile = () => path.join(ctx.dir, 'sync-meta.json');
const sessionFile = () => path.join(ctx.dir, 'supabase-session.json');
function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } }
function writeJson(f, v) { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); }
const emit = () => ctx?.onStatus?.({ ...status });

// Stockage de la session Supabase dans un fichier (au lieu du localStorage d'un navigateur)
const fileStorage = {
  getItem: (k) => readJson(sessionFile(), {})[k] ?? null,
  setItem: (k, v) => { const all = readJson(sessionFile(), {}); all[k] = v; writeJson(sessionFile(), all); },
  removeItem: (k) => { const all = readJson(sessionFile(), {}); delete all[k]; writeJson(sessionFile(), all); },
};

async function init(options) {
  ctx = options;
  const { createClient, core } = await libs();
  meta = readJson(metaFile(), null) || core.emptyMeta();
  sb = createClient(CLOUD.SUPABASE_URL, CLOUD.SUPABASE_ANON_KEY, {
    auth: { storage: fileStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    // Electron 33 embarque Node 20, sans WebSocket natif
    realtime: { transport: globalThis.WebSocket || require('ws') },
  });
  const { data: { session } } = await sb.auth.getSession();
  if (session) { Object.assign(status, { connected: true, email: session.user.email, state: 'idle' }); startLoop(); }
  emit();
}

function startLoop() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => syncNow(), 30000);
  syncNow();
}

async function login(email, password, mode = 'login') {
  const r = mode === 'signup'
    ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: CLOUD.APP_URL } })
    : await sb.auth.signInWithPassword({ email, password });
  if (r.error) {
    const m = r.error.message;
    return { ok: false, error: /Invalid login/i.test(m) ? 'Email ou mot de passe incorrect.' : /confirm/i.test(m) ? "Confirme d'abord ton adresse avec le lien reçu par email." : m };
  }
  if (!r.data.session) return { ok: true, pending: true, message: 'Compte créé ! Ouvre le lien reçu par email, puis connecte-toi.' };
  // Changement de compte : on repart d'un suivi de synchronisation vierge (les données locales sont fusionnées)
  const prev = readJson(path.join(ctx.dir, 'sync-user.json'), {});
  if (prev.id && prev.id !== r.data.user.id) meta = (await libs()).core.emptyMeta();
  writeJson(path.join(ctx.dir, 'sync-user.json'), { id: r.data.user.id });
  Object.assign(status, { connected: true, email: r.data.user.email, state: 'idle', error: null });
  emit();
  startLoop();
  return { ok: true };
}

async function logout() {
  clearInterval(pollTimer);
  await sb.auth.signOut().catch(() => {});
  Object.assign(status, { connected: false, email: null, state: 'off', at: null, error: null });
  emit();
  return { ok: true };
}

function schedule({ settings = false } = {}) {
  if (settings) settingsDirty = true;
  if (!status.connected) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 1500);
}

async function syncNow() {
  if (!status.connected || !sb) return;
  if (syncing) { again = true; return; }
  syncing = true;
  Object.assign(status, { state: 'sync' });
  emit();
  try {
    const { core } = await libs();
    const db = ctx.getDb();
    core.markChanges(db, meta);
    await core.push(sb, db, meta);
    const applied = await core.pull(sb, db, meta);
    const s = await core.syncSettings(sb, db, meta, settingsDirty);
    settingsDirty = false;
    writeJson(metaFile(), meta);
    ctx.persist?.(!!(applied || s === 'pulled'));
    Object.assign(status, { state: 'ok', at: new Date().toISOString(), error: null });
  } catch (e) {
    Object.assign(status, { state: 'error', error: String(e.message || e).slice(0, 160) });
  } finally {
    syncing = false;
    emit();
    if (again) { again = false; schedule(); }
  }
}

module.exports = { init, login, logout, schedule, syncNow, status: () => ({ ...status }) };

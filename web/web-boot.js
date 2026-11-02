// Démarrage de la web app iPhone : connexion, synchronisation, notifications, puis chargement de l'interface Wishy.
import api, { supabase, startSync, syncNow, syncStatus, resetLocal } from './web-api.js';
import CONFIG from './config.js';

document.body.classList.add('web');
const qu = document.querySelector('#quickUrl');
if (qu && matchMedia('(max-width: 700px)').matches) qu.placeholder = "Colle le lien d'un article";
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// Service worker (hors-ligne + notifications)
let swReg = null;
if ('serviceWorker' in navigator) {
  swReg = await navigator.serviceWorker.register('./sw.js').catch(() => null);
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'open-item') location.hash = 'item=' + e.data.id; });
}

// ---------- Connexion ----------
async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'login';
    box.innerHTML = `
      <form class="login-card" novalidate>
        <img src="assets/icon.png" alt="" class="login-icon" />
        <h1>Wishy</h1>
        <p class="login-sub">Connecte-toi pour retrouver ta wishlist sur ton iPhone et sur ton PC.</p>
        <label>Email<input type="email" name="email" autocomplete="email" required /></label>
        <label>Mot de passe<input type="password" name="password" autocomplete="current-password" minlength="6" required /></label>
        <p class="login-msg" role="status"></p>
        <button class="btn-sun big-btn" name="login">Se connecter</button>
        <button class="btn-ghost big-btn" name="signup" type="button">Créer mon compte</button>
      </form>`;
    document.body.append(box);
    const form = $('form', box), msg = $('.login-msg', box);
    const go = async (mode) => {
      const email = form.email.value.trim(), password = form.password.value;
      if (!email || password.length < 6) { msg.textContent = 'Saisis ton email et un mot de passe de 6 caractères minimum.'; return; }
      msg.textContent = mode === 'signup' ? 'Création du compte…' : 'Connexion…';
      const r = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (r.error) {
        msg.textContent = /Invalid login/i.test(r.error.message) ? 'Email ou mot de passe incorrect.' : /confirm/i.test(r.error.message) ? "Confirme d'abord ton adresse avec le lien reçu par email." : r.error.message;
        return;
      }
      if (!r.data.session) { msg.textContent = 'Compte créé ! Ouvre le lien reçu par email pour le confirmer, puis connecte-toi ici.'; return; }
      box.remove();
      resolve(r.data.session);
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); go('login'); });
    form.signup.addEventListener('click', () => go('signup'));
  });
}

const session = await ensureSession();
// Changement de compte : on repart d'une liste locale vide
if (localStorage.getItem('wishy-user') && localStorage.getItem('wishy-user') !== session.user.id) resetLocal();
localStorage.setItem('wishy-user', session.user.id);

window.api = api;
await import('./app.js');
startSync();

// ---------- Lien reçu (ex. ?add=https://…) ----------
const params = new URLSearchParams(location.search);
const toAdd = params.get('add') || params.get('url') || params.get('text');
if (toAdd) {
  history.replaceState(null, '', location.pathname + location.hash);
  $('#quickUrl').value = toAdd;
  $('#quickAdd').requestSubmit();
}

// ---------- Réglages propres à l'iPhone ----------
const settings = $('#view-reglages .settings');
const block = document.createElement('div');
block.innerHTML = `
  <div class="set"><div><strong>Compte</strong><span>${esc(session.user.email)} · <b id="syncState">synchronisation…</b></span></div><button class="btn-ghost" id="logoutBtn">Se déconnecter</button></div>
  <div class="set"><div><strong>Notifications de promo sur l'iPhone</strong><span id="pushInfo"></span></div><button class="btn-ghost" id="pushBtn">Activer</button></div>
  <div class="set col"><div><strong>Raccourci « Ajouter à Wishy »</strong><span>Pour ajouter un article depuis le bouton Partager de Safari ou d'une app de shopping, sans ouvrir Wishy. Colle cette clé dans le raccourci :</span></div>
    <div class="token-row"><code id="addToken">…</code><button class="btn-ghost" id="copyToken">Copier</button></div>
    <a href="#" id="shortcutHelp" class="link">Comment créer le raccourci</a></div>`;
settings.prepend(...block.children);

function renderSync(s) {
  const el = $('#syncState');
  if (!el) return;
  el.textContent = s.state === 'error' ? `erreur de synchronisation (${s.error})` : s.state === 'sync' ? 'synchronisation…' : s.at ? 'synchronisé' : '';
  el.className = s.state === 'error' ? 'warn' : '';
}
api.on('sync', renderSync);
renderSync(syncStatus);
$('#logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); resetLocal(); localStorage.removeItem('wishy-user'); location.reload(); });

// Notifications push
async function pushState() {
  const info = $('#pushInfo'), btn = $('#pushBtn');
  if (!('PushManager' in window) || !swReg) {
    info.textContent = isStandalone() ? "Ton iPhone ne prend pas en charge les notifications web (iOS 16.4 minimum)." : "Ajoute d'abord Wishy à ton écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvre-le depuis son icône.";
    btn.hidden = true;
    return;
  }
  const sub = await swReg.pushManager.getSubscription();
  info.textContent = sub ? 'Activées : tu es prévenu dès qu\'un prix baisse.' : 'Reçois une alerte dès qu\'un article de ta wishlist baisse.';
  btn.textContent = sub ? 'Désactiver' : 'Activer';
  btn.hidden = false;
}
const b64ToU8 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
$('#pushBtn').addEventListener('click', async () => {
  const sub = await swReg.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } else {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { $('#pushInfo').textContent = 'Autorisation refusée. Tu peux la changer dans Réglages iPhone → Notifications → Wishy.'; return; }
    const s = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
    const j = s.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, keys: j.keys }, { onConflict: 'endpoint' });
    if (error) { $('#pushInfo').textContent = `Erreur : ${error.message}`; return; }
  }
  pushState();
});
pushState();

// Clé du raccourci
async function loadToken() {
  let { data } = await supabase.from('add_tokens').select('token').maybeSingle();
  if (!data) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, '0')).join('');
    const r = await supabase.from('add_tokens').insert({ token }).select('token').single();
    data = r.data;
  }
  $('#addToken').textContent = data?.token || 'indisponible';
}
loadToken();
$('#copyToken').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#addToken').textContent); $('#copyToken').textContent = 'Copiée ✓'; setTimeout(() => ($('#copyToken').textContent = 'Copier'), 1800); } catch {}
});
$('#shortcutHelp').addEventListener('click', (e) => { e.preventDefault(); api.open('https://github.com/jerem57990/Wishy/blob/main/docs/raccourci-ios.md'); });

// Ouverture d'un article depuis une notification (#item=…)
function openFromHash() {
  const m = location.hash.match(/item=([\w-]+)/);
  if (m && window.__wishy) { window.__wishy.switchView('wishlist'); window.__wishy.openDrawer(m[1]); history.replaceState(null, '', location.pathname); }
}
window.addEventListener('hashchange', openFromHash);
setTimeout(openFromHash, 600);
window.__wishySync = syncNow;

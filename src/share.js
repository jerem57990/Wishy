// Partage d'une liste en lecture seule (lien public). Utilisé par l'app PC et la web app iPhone.
const APP_URL_FALLBACK = 'https://jerem57990.github.io/Wishy/';

function newToken() {
  const a = crypto.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function appUrl(api) {
  if (api.platform === 'web') return location.origin + location.pathname.replace(/[^/]*$/, '');
  const st = api.cloudStatus ? await api.cloudStatus() : null;
  return st?.appUrl || APP_URL_FALLBACK;
}

async function ensureCloud(api) {
  if (api.platform === 'web') return true;
  const st = api.cloudStatus ? await api.cloudStatus() : null;
  return !!st?.connected;
}

async function syncNow(api) {
  if (api.cloudSync) await api.cloudSync();
  else if (window.__wishySync) await window.__wishySync();
}

/** Active le partage (si besoin), synchronise, puis propose le lien. */
export async function shareList(L, { api, saveLists, db, toast }) {
  if (!(await ensureCloud(api))) {
    toast('Pour partager une liste, connecte d\'abord la synchronisation dans les Réglages.', 'err');
    return false;
  }
  let token = L.shareToken;
  if (!token) {
    token = newToken();
    await saveLists(db().lists.map((l) => (l.id === L.id ? { ...l, shareToken: token } : l)));
  }
  await syncNow(api);
  const url = `${await appUrl(api)}share.html?l=${token}`;
  if (api.platform === 'web' && navigator.share) {
    try { await navigator.share({ title: L.name, text: `Ma liste Wishy « ${L.name} »`, url }); return true; } catch (e) { if (e.name === 'AbortError') return true; }
  }
  try { await navigator.clipboard.writeText(url); toast('Lien de partage copié : colle-le dans un message'); }
  catch { prompt('Lien de partage', url); }
  return true;
}

export async function stopSharing(L, { api, saveLists, db, toast }) {
  await saveLists(db().lists.map((l) => (l.id === L.id ? { ...l, shareToken: null } : l)));
  await syncNow(api);
  toast('Le lien ne fonctionne plus');
}

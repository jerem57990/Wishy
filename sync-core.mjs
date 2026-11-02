// Synchronisation Wishy ⇄ Supabase, partagée par l'app PC (Electron) et la web app iPhone.
//
// Principe : chaque article / achat est une ligne { id, data, deleted, updated_at }.
// - On détecte les changements locaux en comparant une empreinte de chaque ligne.
// - On envoie les lignes modifiées (et les suppressions) ; on récupère celles modifiées ailleurs.
// - En cas de conflit, la modification la plus récente gagne.

const TABLES = ['items', 'purchases'];

// Empreinte rapide (FNV-1a) d'une ligne, sans les champs techniques
function hashRow(row) {
  const { updatedAt, ...rest } = row;
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const ts = (iso) => (iso ? Date.parse(iso) || 0 : 0);

export function emptyMeta() {
  return { hashes: { items: {}, purchases: {} }, dirty: { items: {}, purchases: {} }, tomb: { items: {}, purchases: {} }, lastPull: null, settingsAt: null };
}

/**
 * Repère les changements locaux depuis la dernière fois.
 * Les lignes modifiées reçoivent updatedAt = maintenant ; les lignes disparues deviennent des suppressions.
 * @returns {boolean} vrai s'il y a quelque chose à envoyer
 */
export function markChanges(store, meta, nowIso = new Date().toISOString()) {
  let any = false;
  for (const t of TABLES) {
    const rows = store[t] || [];
    const seen = new Set();
    for (const r of rows) {
      seen.add(r.id);
      const h = hashRow(r);
      if (meta.hashes[t][r.id] !== h) {
        meta.hashes[t][r.id] = h;
        r.updatedAt = nowIso;
        meta.dirty[t][r.id] = true;
        delete meta.tomb[t][r.id];
        any = true;
      }
    }
    for (const id of Object.keys(meta.hashes[t])) {
      if (!seen.has(id)) {
        delete meta.hashes[t][id];
        delete meta.dirty[t][id];
        meta.tomb[t][id] = nowIso;
        any = true;
      }
    }
    if (Object.keys(meta.dirty[t]).length || Object.keys(meta.tomb[t]).length) any = true;
  }
  return any;
}

/** Envoie les lignes modifiées et les suppressions. */
export async function push(supabase, store, meta) {
  let sent = 0;
  for (const t of TABLES) {
    const rows = (store[t] || []).filter((r) => meta.dirty[t][r.id]);
    const payload = rows.map((r) => {
      const { updatedAt, ...data } = r;
      return { id: r.id, data, deleted: false, updated_at: updatedAt || new Date().toISOString(), ...(t === 'items' ? { needs_fetch: !!data.needsFetch } : {}) };
    });
    for (const [id, at] of Object.entries(meta.tomb[t])) payload.push({ id, data: {}, deleted: true, updated_at: at });
    if (!payload.length) continue;
    for (let i = 0; i < payload.length; i += 200) {
      const chunk = payload.slice(i, i + 200);
      const { error } = await supabase.from(t).upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(`${t} : ${error.message}`);
    }
    for (const r of rows) delete meta.dirty[t][r.id];
    meta.tomb[t] = {};
    sent += payload.length;
  }
  return sent;
}

/**
 * Récupère les lignes modifiées ailleurs et les applique localement.
 * @returns {number} nombre de lignes appliquées
 */
export async function pull(supabase, store, meta) {
  let applied = 0;
  // petite marge pour les horloges légèrement décalées
  const since = meta.lastPull ? new Date(ts(meta.lastPull) - 120000).toISOString() : '1970-01-01T00:00:00Z';
  let maxSeen = meta.lastPull;
  for (const t of TABLES) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase.from(t).select('id,data,deleted,updated_at').gt('updated_at', since).order('updated_at').range(from, from + 499);
      if (error) throw new Error(`${t} : ${error.message}`);
      for (const row of data) {
        if (!maxSeen || ts(row.updated_at) > ts(maxSeen)) maxSeen = row.updated_at;
        const list = store[t] || (store[t] = []);
        const idx = list.findIndex((r) => r.id === row.id);
        const local = idx >= 0 ? list[idx] : null;
        // une modification locale plus récente et pas encore envoyée gagne
        if (local && meta.dirty[t][row.id] && ts(local.updatedAt) > ts(row.updated_at)) continue;
        if (meta.tomb[t][row.id] && ts(meta.tomb[t][row.id]) > ts(row.updated_at)) continue;
        if (row.deleted) {
          if (local) { list.splice(idx, 1); applied++; }
          delete meta.hashes[t][row.id];
          delete meta.dirty[t][row.id];
          continue;
        }
        if (local && ts(local.updatedAt) >= ts(row.updated_at) && meta.hashes[t][row.id] === hashRow(local)) continue;
        const incoming = { ...row.data, id: row.id, updatedAt: row.updated_at };
        if (idx >= 0) list[idx] = incoming; else list.unshift(incoming);
        meta.hashes[t][row.id] = hashRow(incoming);
        delete meta.dirty[t][row.id];
        applied++;
      }
      if (data.length < 500) break;
      from += 500;
    }
  }
  meta.lastPull = maxSeen;
  return applied;
}

/** Réglages partagés (seulement ceux qui ont un sens sur les deux appareils). */
const SHARED_SETTINGS = ['monthlyBudget', 'hfToken'];

export async function syncSettings(supabase, store, meta, localChanged) {
  const pickShared = (s) => Object.fromEntries(SHARED_SETTINGS.filter((k) => s && k in s).map((k) => [k, s[k]]));
  const { data, error } = await supabase.from('settings').select('data,updated_at').maybeSingle();
  if (error) throw new Error(`settings : ${error.message}`);
  const remoteAt = ts(data?.updated_at), localAt = ts(meta.settingsAt);
  if (data && remoteAt > localAt && !localChanged) {
    Object.assign(store.settings, pickShared(data.data));
    meta.settingsAt = data.updated_at;
    return 'pulled';
  }
  if (localChanged || !data) {
    const at = new Date().toISOString();
    const { error: e2 } = await supabase.from('settings').upsert({ data: pickShared(store.settings), updated_at: at }, { onConflict: 'user_id' });
    if (e2) throw new Error(`settings : ${e2.message}`);
    meta.settingsAt = at;
    return 'pushed';
  }
  return 'same';
}

/** Cycle complet : changements locaux → envoi → réception. */
export async function syncOnce(supabase, store, meta) {
  markChanges(store, meta);
  const sent = await push(supabase, store, meta);
  const applied = await pull(supabase, store, meta);
  return { sent, applied };
}

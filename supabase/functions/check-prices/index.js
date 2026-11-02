// Vérification planifiée des prix (appelée par pg_cron toutes les 3 h).
// Met à jour les prix de tous les utilisateurs et envoie une notification push sur l'iPhone
// quand un prix baisse ou atteint le prix cible. Complète aussi les articles ajoutés depuis l'iPhone.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchProduct } from '../_shared/scraper.js';
import { sendPush } from '../_shared/webpush.js';
import { json } from '../_shared/http.js';

const MAX_ITEMS = 45;          // par exécution (limite de durée des fonctions gratuites)
const MIN_GAP_MIN = 20;        // anti-rafale entre deux exécutions
const CONCURRENCY = 4;

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const { data: last } = await sb.from('price_runs').select('started_at').order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - Date.parse(last.started_at) < MIN_GAP_MIN * 60000) return json({ ok: true, skipped: 'trop tôt' });
  const { data: run } = await sb.from('price_runs').insert({}).select('id').single();

  const { data: secrets } = await sb.from('app_secrets').select('key,value');
  const sec = Object.fromEntries((secrets || []).map((s) => [s.key, s.value]));
  const vapid = sec.vapid_private ? { publicKey: sec.vapid_public, privateKey: sec.vapid_private, subject: sec.vapid_subject || 'mailto:wishy@example.com' } : null;
  const appUrl = sec.app_url || '';

  const { data: rows, error } = await sb.from('items').select('id,user_id,data,needs_fetch').eq('deleted', false);
  if (error) return json({ ok: false, error: error.message }, 500);
  const todo = rows
    .filter((r) => r.needs_fetch || r.data?.status === 'wish')
    .sort((a, b) => (b.needs_fetch - a.needs_fetch) || String(a.data?.lastCheck || '').localeCompare(String(b.data?.lastCheck || '')))
    .slice(0, MAX_ITEMS);

  const subsCache = new Map();
  async function notify(userId, message) {
    if (!vapid) return;
    if (!subsCache.has(userId)) subsCache.set(userId, (await sb.from('push_subscriptions').select('endpoint,keys').eq('user_id', userId)).data || []);
    for (const s of subsCache.get(userId)) {
      try {
        const r = await sendPush({ endpoint: s.endpoint, keys: s.keys }, message, vapid);
        if (r.gone) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } catch (_) { /* une notification ratée ne bloque pas les autres */ }
    }
  }

  let checked = 0, drops = 0;
  async function work(row) {
    const it = { ...row.data };
    const now = new Date().toISOString();
    const info = await fetchProduct(it.url);
    if (info.ok && info.price) {
      if (row.needs_fetch) {
        if (!it.titleEdited && info.title) it.title = info.title;
        it.image = it.image || info.image || null;
        it.store = info.store || it.store;
        if (!it.categoryEdited && info.category) it.category = info.category;
        it.fetchError = null;
      }
      const old = it.price;
      it.history = it.history || [];
      const ref = old && info.price < old - 0.009 ? Math.max(old, info.listPrice || 0) : (info.listPrice && !it.listPrice ? info.listPrice : null);
      if (ref) {
        drops++;
        const pct = Math.round((1 - info.price / ref) * 100);
        await notify(row.user_id, {
          title: `🔥 -${pct} % sur ${String(it.title).slice(0, 50)}`,
          body: `${fmt(ref)} → ${fmt(info.price)} chez ${it.store}${it.targetPrice && info.price <= it.targetPrice ? ' · Prix cible atteint !' : ''}`,
          url: `${appUrl}#item=${row.id}`, tag: row.id,
        });
        it.lastDrop = { from: ref, to: info.price, d: now };
      }
      it.listPrice = info.listPrice || null;
      if (old !== info.price) it.history.push({ d: now, p: info.price });
      it.price = info.price;
      it.fetchError = null;
    } else if (row.needs_fetch) {
      if (!it.titleEdited && info.title) it.title = info.title;
      it.image = it.image || info.image || null;
      if (!it.price) it.fetchError = info.error || 'Prix non détecté — tu peux le saisir à la main';
    }
    for (const alt of it.alternatives || []) {
      const a = await fetchProduct(alt.url);
      if (a.ok && a.price) { alt.price = a.price; alt.lastCheck = now; }
    }
    it.lastCheck = now;
    delete it.needsFetch;
    await sb.from('items').update({ data: it, needs_fetch: false, updated_at: now }).eq('id', row.id);
    checked++;
  }

  const queue = [...todo];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) { const r = queue.shift(); try { await work(r); } catch (_) {} await sleep(500); }
  }));
  if (run) await sb.from('price_runs').update({ checked, drops }).eq('id', run.id);
  return json({ ok: true, checked, drops });
});

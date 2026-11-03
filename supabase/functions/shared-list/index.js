// Liste partagée en lecture seule : renvoie le contenu d'une liste à partir de son lien de partage.
// Aucune connexion requise ; seuls les champs utiles à la consultation sont renvoyés.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/http.js';

const PUBLIC_FIELDS = ['title', 'image', 'price', 'listPrice', 'currency', 'store', 'brand', 'url', 'size', 'notes', 'category', 'priority', 'status', 'piece', 'jersey', 'scent'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const u = new URL(req.url);
  let token = u.searchParams.get('l') || '';
  if (!token && req.method === 'POST') { try { token = (await req.json()).l || ''; } catch { /* ignoré */ } }
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(token)) return json({ ok: false, error: 'Lien de partage invalide' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: list } = await sb.from('lists').select('user_id,data,updated_at').eq('deleted', false).eq('data->>shareToken', token).maybeSingle();
  if (!list) return json({ ok: false, error: "Cette liste n'est plus partagée." }, 404);

  const ids = (list.data.itemIds || []).slice(0, 300);
  const { data: rows } = ids.length
    ? await sb.from('items').select('id,data,updated_at').eq('user_id', list.user_id).eq('deleted', false).in('id', ids)
    : { data: [] };
  const order = new Map(ids.map((id, i) => [id, i]));
  const items = (rows || [])
    .sort((a, b) => order.get(a.id) - order.get(b.id))
    .map((r) => {
      const it = Object.fromEntries(PUBLIC_FIELDS.filter((k) => r.data[k] != null && r.data[k] !== '').map((k) => [k, r.data[k]]));
      // prix le plus bas parmi les autres boutiques suivies
      const alt = (r.data.alternatives || []).filter((a) => a.price && (!it.price || a.price < it.price)).sort((a, b) => a.price - b.price)[0];
      if (alt) it.best = { price: alt.price, store: alt.store, url: alt.url };
      // plus haut prix observé, pour afficher les baisses
      const seen = Math.max(r.data.price || 0, ...(r.data.history || []).map((h) => h.p || 0));
      if (seen > (it.price || 0)) it.seenHigh = seen;
      return it;
    });
  const updatedAt = [list.updated_at, ...(rows || []).map((r) => r.updated_at)].sort().pop();
  return json({ ok: true, name: list.data.name || 'Wishlist', updatedAt, items }, 200);
});

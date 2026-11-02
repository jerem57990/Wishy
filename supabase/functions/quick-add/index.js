// Ajout rapide depuis le Raccourci iOS « Ajouter à Wishy » (menu Partager).
// Authentification par la clé personnelle affichée dans les Réglages de la web app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchProduct } from '../_shared/scraper.js';
import { cors } from '../_shared/http.js';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const text = (msg, status = 200) => new Response(msg, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body = {};
  try { body = await req.json(); } catch { /* ignoré */ }
  const token = String(body.token || '').trim();
  const url = String(body.url || '').trim().match(/https?:\/\/\S+/)?.[0];
  if (!token) return text('Clé du raccourci manquante. Copie-la depuis Wishy → Réglages.', 401);
  if (!url) return text("Aucun lien d'article reçu.", 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: tok } = await sb.from('add_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!tok) return text('Clé du raccourci inconnue. Recopie-la depuis Wishy → Réglages.', 401);

  const { data: existing } = await sb.from('items').select('id,data').eq('user_id', tok.user_id).eq('deleted', false);
  if ((existing || []).some((r) => r.data?.url === url)) return text('Déjà dans ta wishlist ✓');

  const info = await fetchProduct(url);
  const now = new Date().toISOString();
  const item = {
    id: uid(), url: info.url || url, title: info.title || info.store || 'Article', image: info.image || null,
    price: info.price ?? null, currency: info.currency || 'EUR', store: info.store, brand: info.brand || null,
    category: info.category || 'autre', size: '', targetPrice: null, priority: 2, addedAt: now, lastCheck: now,
    status: 'wish', history: info.price ? [{ d: now, p: info.price }] : [], alternatives: [],
    fetchError: info.ok && info.price ? null : (info.error || 'Prix non détecté — tu peux le saisir à la main'),
  };
  const { error } = await sb.from('items').insert({ id: item.id, user_id: tok.user_id, data: item, needs_fetch: !item.title || !info.ok, updated_at: now });
  if (error) return text(`Erreur : ${error.message}`, 500);
  return text(`✨ Ajouté : ${item.title.slice(0, 60)}${item.price ? ` — ${fmt(item.price)}` : ''}`);
});

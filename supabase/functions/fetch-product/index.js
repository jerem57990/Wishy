// Lit la fiche d'un produit (titre, photo, prix) pour la web app iPhone,
// ou renvoie une image produit en data-URL (pour les couleurs Pantone et la cabine).
// Réservé aux utilisateurs connectés (vérification du JWT par Supabase).
import { fetchProduct } from '../_shared/scraper.js';
import { cors, json, toBase64 } from '../_shared/http.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Requête invalide' }, 400); }

  if (body.image) {
    try {
      const r = await fetch(body.image, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' } });
      const type = r.headers.get('content-type') || 'image/jpeg';
      if (!r.ok || !type.startsWith('image/')) return json({ ok: false, error: `Image inaccessible (${r.status})` });
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) return json({ ok: false, error: 'Image trop lourde' });
      return json({ ok: true, dataUrl: `data:${type};base64,${toBase64(buf)}` });
    } catch (e) {
      return json({ ok: false, error: String(e?.message || e) });
    }
  }

  if (body.url && /^https?:\/\//i.test(body.url)) return json(await fetchProduct(body.url));
  return json({ ok: false, error: 'Lien manquant' }, 400);
});

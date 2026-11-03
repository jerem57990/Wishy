// Extraction des infos produit (titre, image, prix) depuis une URL de boutique.
// Stratégie : JSON-LD schema.org/Product → balises meta (OpenGraph, product:price) →
// microdonnées itemprop="price" → règles spécifiques (Amazon…) → heuristique €.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const CATEGORY_RULES = [
  { cat: 'parfums', domains: ['sephora', 'nocibe', 'marionnaud', 'notino', 'douglas', 'scento', 'origines-parfums', 'parfumdo', 'beautysuccess', 'lookfantastic', 'fragrantica', 'jomashop', 'guerlain', 'diptyque', 'byredo', 'creedfragrances'], words: ['parfum', 'eau de toilette', 'eau de cologne', 'cologne', 'edp', 'edt', 'extrait', 'fragrance', 'elixir', 'élixir', 'vaporisateur', 'parfum ml'] },
  { cat: 'jeux', domains: ['instant-gaming', 'micromania', 'steampowered', 'store.steampowered', 'playstation', 'nintendo', 'xbox', 'epicgames', 'gog.com', 'eneba'], words: ['ps5', 'ps4', 'xbox', 'switch', 'nintendo', 'jeu vidéo', 'steam', 'playstation', 'manette', 'edition', 'game'] },
  { cat: 'vetements', domains: ['zalando', 'asos', 'nike', 'adidas', 'zara', 'hm.com', 'uniqlo', 'courir', 'jdsports', 'footlocker', 'snipes', 'vinted', 'shein', 'celio', 'jules', 'kiabi', 'sezane', 'lacoste', 'decathlon'], words: ['t-shirt', 'tee', 'pull', 'sweat', 'hoodie', 'veste', 'jean', 'pantalon', 'chemise', 'sneakers', 'baskets', 'chaussures', 'manteau', 'short', 'polo', 'jogging', 'doudoune', 'maillot', 'casquette'] },
  { cat: 'tech', domains: ['ldlc', 'materiel.net', 'topachat', 'boulanger', 'darty', 'apple.com', 'samsung', 'backmarket', 'rueducommerce'], words: ['iphone', 'samsung', 'écran', 'ecran', 'casque', 'clavier', 'souris', 'pc ', 'laptop', 'ordinateur', 'ssd', 'rtx', 'airpods', 'tv ', 'montre connectée', 'enceinte'] },
  { cat: 'maison', domains: ['ikea', 'maisonsdumonde', 'leroymerlin', 'castorama', 'conforama', 'but.fr'], words: ['lampe', 'canapé', 'table', 'chaise', 'déco', 'coussin', 'tapis', 'cuisine'] },
  { cat: 'livres', domains: ['decitre', 'cultura', 'leslibraires'], words: ['livre', 'roman', 'manga', 'tome', 'broché', 'bd '] },
  { cat: 'sport', domains: ['decathlon', 'intersport', 'go-sport'], words: ['ballon', 'vélo', 'velo', 'fitness', 'haltère', 'running', 'crampons'] },
];

function guessCategory(url, title) {
  const u = url.toLowerCase();
  const t = (title || '').toLowerCase();
  for (const r of CATEGORY_RULES) if (r.domains.some((d) => u.includes(d))) {
    // Decathlon : vêtements ou sport selon le titre
    if (r.cat === 'vetements' && u.includes('decathlon') && !CATEGORY_RULES[1].words.some((w) => t.includes(w))) continue;
    return r.cat;
  }
  for (const r of CATEGORY_RULES) if (r.words.some((w) => t.includes(w))) return r.cat;
  return 'autre';
}

function decode(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, ' ').trim();
}

function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  // "1.299,99" → 1299.99 ; "1,299.99" → 1299.99 ; "49,90" → 49.9
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isFinite(n) && n > 0 && n < 1e6 ? n : null;
}

function meta(html, keys) {
  for (const k of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m) return decode(m[1]);
  }
  return null;
}

function findProductsInJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        const type = [].concat(node['@type'] || []).map(String);
        if (type.some((t) => /Product|ProductGroup|VideoGame|IndividualProduct/i.test(t))) out.push(node);
        if (node['@graph']) walk(node['@graph']);
        if (node.mainEntity) walk(node.mainEntity);
      };
      walk(data);
    } catch (_) { /* JSON-LD invalide, on ignore */ }
  }
  return out;
}

const USED = /Used|Refurbished|Damaged/i;
function priceFromOffers(offers) {
  if (!offers) return null;
  const list = [].concat(offers);
  let best = null, currency = null, old = null;
  for (const o of list) {
    const inner = o.offers ? [].concat(o.offers) : [o];
    for (const x of inner) {
      if (USED.test(String(x.itemCondition || ''))) continue; // pas d'occasion ni de reconditionné
      const specs = [].concat(x.priceSpecification || []);
      const strike = specs.find((sp) => /Strikethrough|ListPrice|MSRP/i.test(String(sp.priceType || '')));
      const sale = specs.find((sp) => sp !== strike && sp.price != null);
      const p = parsePrice(x.price ?? x.lowPrice ?? sale?.price ?? (strike ? null : specs[0]?.price));
      if (p && (best == null || p < best)) {
        best = p;
        currency = x.priceCurrency || specs[0]?.priceCurrency || currency;
        old = strike ? parsePrice(strike.price) : old;
      }
    }
  }
  return best ? { price: best, currency, old } : null;
}

// Prix barré affiché par la boutique : on ne le garde que s'il est cohérent avec le prix actuel
const plausibleList = (list, price) => (list && price && list > price * 1.01 && list < price * 4 ? Math.round(list * 100) / 100 : null);

// Cherche un prix barré dans le HTML, uniquement près de l'endroit où le prix actuel est affiché
function strikeNearPrice(html, price) {
  if (!price) return null;
  const variants = [price.toFixed(2).replace('.', ','), price.toFixed(2), String(price).replace('.', ',')];
  const strikeRe = /<(?:del|s|strike)\b[^>]*>([\s\S]{0,160}?)<\/(?:del|s|strike)>|class=["'][^"']*(?:strike|old[-_]?price|was[-_]?price|compare[-_]?at|crossed|barre|price[-_]?before|before[-_]?price|regular[-_]?price|line-through)[^"']*["'][^>]*>([\s\S]{0,160}?)</gi;
  let best = null;
  for (const v of variants) {
    let from = 0, idx;
    while ((idx = html.indexOf(v, from)) !== -1 && from < html.length) {
      from = idx + v.length;
      const win = html.slice(Math.max(0, idx - 700), idx + 700);
      let m;
      strikeRe.lastIndex = 0;
      while ((m = strikeRe.exec(win))) {
        const txt = (m[1] || m[2] || '').replace(/<[^>]+>/g, ' ');
        const am = txt.match(/(\d{1,5}(?:[ .\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|&euro;|EUR)|(?:€|&euro;)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i);
        const val = am ? parsePrice(am[1] || am[2]) : null;
        if (plausibleList(val, price) && (!best || val > best)) best = val;
      }
      if (best) return best;
    }
  }
  return null;
}

function extract(html, url) {
  const res = { title: null, image: null, price: null, listPrice: null, currency: 'EUR', brand: null };

  const products = findProductsInJsonLd(html);
  for (const p of products) {
    res.title = res.title || decode(p.name);
    const img = Array.isArray(p.image) ? p.image[0] : p.image;
    res.image = res.image || (typeof img === 'string' ? img : img?.url) || null;
    res.brand = res.brand || (typeof p.brand === 'string' ? p.brand : p.brand?.name) || null;
    const po = priceFromOffers(p.offers) || (p.hasVariant ? priceFromOffers([].concat(p.hasVariant).map((v) => ({ offers: v.offers }))) : null);
    if (po && !res.price) { res.price = po.price; if (po.currency) res.currency = po.currency; if (po.old) res.listPrice = po.old; }
  }

  res.title = res.title || meta(html, ['og:title', 'twitter:title']) || decode((html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]);
  res.image = res.image || meta(html, ['og:image', 'og:image:secure_url', 'twitter:image']);

  if (!res.price) {
    const p = parsePrice(meta(html, ['product:price:amount', 'og:price:amount', 'price', 'twitter:data1']));
    if (p) { res.price = p; res.currency = meta(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']) || res.currency; }
  }
  if (!res.price) {
    const m = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
    if (m) res.price = parsePrice(m[1]);
  }
  res.listPrice = res.listPrice || parsePrice(meta(html, ['product:original_price:amount', 'og:original_price:amount', 'product:regular_price:amount']));
  // Amazon : prix barré dans <span class="a-price a-text-price" data-a-strike="true">
  if (/amazon\./i.test(url)) {
    const st = html.match(/data-a-strike=["']true["'][^>]*>\s*<span class=["']a-offscreen["']>\s*([\d\s.,]+)\s*(?:€|&euro;)/i);
    if (st) res.listPrice = res.listPrice || parsePrice(st[1]);
  }
  if (!res.price && /amazon\./i.test(url)) {
    const m = html.match(/class=["']a-offscreen["'][^>]*>\s*([\d\s.,]+)\s*(?:€|&euro;)/i) || html.match(/"priceAmount"\s*:\s*([\d.]+)/);
    if (m) res.price = parsePrice(m[1]);
    const t = html.match(/id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
    if (t) res.title = decode(t[1]);
    const im = html.match(/"hiRes"\s*:\s*"([^"]+)"/) || html.match(/id=["']landingImage["'][^>]+src=["']([^"']+)["']/i);
    if (im) res.image = im[1];
  }
  // Steam
  if (/steampowered/i.test(url)) {
    const m = html.match(/data-price-final=["'](\d+)["']/);
    if (m && !res.price) res.price = +m[1] / 100;
    const o = html.match(/class=["']discount_original_price["']>\s*([^<]+)</i);
    if (o) res.listPrice = res.listPrice || parsePrice(o[1]);
  }
  // Heuristique de dernier recours : premier montant en € "visible" proche du mot prix
  if (!res.price) {
    const m = html.match(/(?:prix|price)[^<]{0,80}?(\d{1,5}(?:[.,]\d{2})?)\s?(?:€|&euro;|EUR)/i);
    if (m) res.price = parsePrice(m[1]);
  }

  if (!res.listPrice) res.listPrice = strikeNearPrice(html, res.price);
  res.listPrice = plausibleList(res.listPrice, res.price);

  if (res.image && res.image.startsWith('//')) res.image = 'https:' + res.image;
  if (res.image && res.image.startsWith('/')) { try { res.image = new URL(res.image, url).href; } catch (_) {} }
  if (res.title) res.title = res.title.replace(/\s*[|:–-]\s*(Amazon\.fr|Zalando|Fnac|Cdiscount)[^|]*$/i, '').slice(0, 140);

  return res;
}

// ---------- Options du produit (taille, badge/patch, flocage…) ----------
const CJK = /[　-鿿＀-￯]/;
// retire les précisions en chinois entre parenthèses : "Allianz (左袖广告)" → "Allianz"
const cleanLabel = (t) => decode(String(t || '')).replace(/\s*[（(][^()（）]*[)）]/g, (m) => (CJK.test(m) ? '' : m)).replace(/\s+/g, ' ').trim();

function extractOptions(html) {
  const groups = [];
  // Boutiques "ymcart" (kkgool, et beaucoup de boutiques de maillots) : var goods_sale_prop_str='{…}'
  const m = html.match(/goods_sale_prop_str\s*=\s*'((?:[^'\\]|\\.)*)'/);
  if (m) {
    try {
      const props = JSON.parse(m[1].replace(/\\(.)/g, '$1'));
      const all = Object.values(props);
      for (const g of all.filter((x) => String(x.parent_id) === '0').sort((a, b) => +a.listorder - +b.listorder)) {
        const values = all.filter((x) => String(x.parent_id) === String(g.id)).sort((a, b) => +a.listorder - +b.listorder)
          .map((x) => ({ label: cleanLabel(x.base_name), add: +x.price || 0, image: x.image || undefined }))
          .filter((v) => v.label);
        if (values.length) groups.push({ name: cleanLabel(g.base_name), values });
      }
    } catch (_) { /* format inattendu */ }
  }
  // Listes déroulantes génériques nommées comme des options
  if (!groups.length) {
    const re = /<select[^>]*(?:name|id)=["']([^"']*(?:option|attribute|variant|size|taille|badge|patch|flocage|custom|personal)[^"']*)["'][^>]*>([\s\S]*?)<\/select>/gi;
    let s;
    while ((s = re.exec(html)) && groups.length < 6) {
      const values = [...s[2].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)</gi)]
        .filter((o) => o[1] && !/^(choose|choisir|select|sélectionner|--)/i.test(o[2].trim()))
        .map((o) => ({ label: cleanLabel(o[2]), add: 0 })).filter((v) => v.label);
      if (values.length > 1) groups.push({ name: cleanLabel(s[1].replace(/^.*\[|\]$/g, '').replace(/[_-]+/g, ' ')), values });
    }
  }
  return groups.slice(0, 8);
}

// ---------- Conversion de devise (tout est affiché en euros) ----------
const FALLBACK_RATES = { USD: 0.86, GBP: 1.15, CHF: 1.07, CAD: 0.62, AUD: 0.57, JPY: 0.0058, CNY: 0.12, HKD: 0.11, SEK: 0.09, DKK: 0.134, PLN: 0.235 };
let rateCache = { at: 0, rates: null };
async function toEurRate(cur) {
  cur = String(cur || 'EUR').toUpperCase();
  if (cur === 'EUR') return 1;
  if (!rateCache.rates || Date.now() - rateCache.at > 12 * 3600e3) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/EUR', { headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (j && j.rates) rateCache = { at: Date.now(), rates: j.rates };
    } catch (_) { /* hors ligne : taux de secours */ }
  }
  const r = rateCache.rates?.[cur];
  return r ? 1 / r : FALLBACK_RATES[cur] || null;
}
async function normalizeCurrency(data) {
  const cur = String(data.currency || 'EUR').toUpperCase();
  if (cur === 'EUR') return data;
  const rate = await toEurRate(cur);
  if (!rate) return data;
  const conv = (n) => (n == null ? n : Math.round(n * rate * 100) / 100);
  data.priceOrig = data.price != null ? { amount: data.price, currency: cur } : null;
  data.price = conv(data.price);
  data.listPrice = conv(data.listPrice);
  for (const g of data.options || []) for (const v of g.values) if (v.add) { v.addOrig = v.add; v.add = conv(v.add); }
  data.currency = 'EUR';
  data.fx = { from: cur, rate: Math.round(rate * 10000) / 10000 };
  return data;
}

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

const isShopify = (html) => /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html);
async function shopifyEnrich(pageUrl, res, signal) {
  try {
    const u = new URL(pageUrl);
    const m = u.pathname.match(/^(.*\/products\/[^/?#]+)/);
    if (!m) return;
    const r = await fetch(`${u.origin}${m[1]}.js`, { signal, headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'fr-FR,fr;q=0.9' } });
    if (!r.ok) return;
    const p = await r.json();
    const vid = u.searchParams.get('variant');
    const v = (p.variants || []).find((x) => String(x.id) === vid) || (p.variants || []).find((x) => x.available) || (p.variants || [])[0];
    if (!v) return;
    const price = v.price / 100, cmp = v.compare_at_price ? v.compare_at_price / 100 : null;
    if (price > 0) res.price = price;
    res.listPrice = plausibleList(cmp, res.price) || null;
    if (!res.image && p.featured_image) res.image = p.featured_image.startsWith('//') ? 'https:' + p.featured_image : p.featured_image;
    if (!res.title && p.title) res.title = p.title;
    if (!res.options?.length && Array.isArray(p.options)) {
      res.options = p.options.filter((o) => o && o.name && o.values?.length > 1 && !/^title$/i.test(o.name)).map((o) => ({ name: o.name, values: o.values.map((v) => ({ label: String(v), add: 0 })) }));
    }
  } catch (_) { /* boutique Shopify sans JSON public : on garde la lecture de la page */ }
}

async function fetchProduct(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
        'Cache-Control': 'no-cache',
      },
    });
    const html = await r.text();
    const data = extract(html, r.url || url);
    data.options = extractOptions(html);
    if (isShopify(html)) await shopifyEnrich(r.url || url, data, ctrl.signal);
    await normalizeCurrency(data);
    let host = '';
    try { host = new URL(r.url || url).hostname.replace(/^www\./, ''); } catch (_) {}
    return { ok: true, status: r.status, url: r.url || url, store: host, category: guessCategory(url, data.title), ...data };
  } catch (e) {
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}
    return { ok: false, error: e.name === 'AbortError' ? 'Délai dépassé' : e.message, url, store: host, category: guessCategory(url, '') };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { keepFx, fetchProduct, extract, extractOptions, guessCategory, parsePrice, normalizeCurrency };

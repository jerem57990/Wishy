// Essayage virtuel par IA via des modèles gratuits hébergés sur Hugging Face.
// - Leffa (franciszzj/Leffa) : hauts ET bas → on applique le haut, puis le bas sur le résultat.
// - IDM-VTON (yisol/IDM-VTON) : secours pour les hauts si Leffa est indisponible.

const SPACES = {
  leffa: 'franciszzj/Leffa',
  idm: 'yisol/IDM-VTON',
};

let gradio = null;
async function lib() {
  if (!gradio) gradio = await import('@gradio/client'); // module ESM
  return gradio;
}

const clients = new Map();
async function connect(space, token) {
  const key = space + (token || '');
  if (clients.has(key)) return clients.get(key);
  const { Client } = await lib();
  const opts = token && token.startsWith('hf_') ? { hf_token: token } : {};
  const c = await Client.connect(space, opts);
  clients.set(key, c);
  return c;
}

async function download(url, token) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' };
  if (token && url.includes('hf.space')) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Image inaccessible (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

function friendly(err) {
  const m = String(err?.message || err || '');
  if (/quota|exceeded|ZeroGPU|GPU duration/i.test(m))
    return "Quota gratuit de calcul atteint pour aujourd'hui. Ajoute ton jeton Hugging Face gratuit dans les Réglages pour en avoir davantage, ou réessaie plus tard.";
  if (/paused|sleeping|building|not running|Could not resolve app config|503|502/i.test(m))
    return "Le modèle d'essayage est en veille ou indisponible pour le moment. Réessaie dans quelques minutes.";
  if (/fetch failed|ENOTFOUND|ECONNRESET|network/i.test(m)) return 'Pas de connexion à Hugging Face. Vérifie ta connexion internet.';
  if (/Image inaccessible/.test(m)) return "La photo du vêtement n'a pas pu être téléchargée. Mets un autre lien d'image dans la fiche de l'article.";
  return m.slice(0, 220) || "L'essayage a échoué.";
}

// Lance un appel en suivant la file d'attente et en remontant la progression
// Lecture des événements sans fermer le flux (un « for await » peut rester bloqué à la sortie)
async function run(client, endpoint, data, onStatus) {
  const it = client.submit(endpoint, data)[Symbol.asyncIterator]();
  for (;;) {
    const { value: ev, done } = await it.next();
    if (done) throw new Error('Aucun résultat reçu');
    if (ev.type === 'status') { if (ev.stage === 'error') throw new Error(ev.message || 'Erreur du modèle'); onStatus?.(ev); }
    if (ev.type === 'data') return ev.data;
  }
}

async function leffa(person, garment, kind, token, onStatus) {
  const { handle_file } = await lib();
  const c = await connect(SPACES.leffa, token);
  const data = await run(
    c,
    '/leffa_predict_vt',
    [handle_file(new Blob([person])), handle_file(new Blob([garment])), false, 30, 2.5, 42, 'viton_hd', kind, false],
    onStatus
  );
  const out = data[0];
  return download(out.url || out, token);
}

async function idm(person, garment, desc, token, onStatus) {
  const { handle_file } = await lib();
  const c = await connect(SPACES.idm, token);
  const data = await run(
    c,
    '/tryon',
    [{ background: handle_file(new Blob([person])), layers: [], composite: null }, handle_file(new Blob([garment])), desc || 'garment', true, true, 30, 42],
    onStatus
  );
  const out = data[0];
  return download(out.url || out, token);
}

/**
 * Essaie une tenue complète.
 * @param {Buffer} person   photo de la personne (en pied, de face)
 * @param {{top?:{image:Buffer,title:string}, bottom?:{image:Buffer,title:string}}} outfit
 * @param {string} token    jeton Hugging Face (facultatif)
 * @param {(msg:string, pct:number)=>void} progress
 */
async function tryOn(person, outfit, token, progress = () => {}) {
  const steps = [outfit.top && 'top', outfit.bottom && 'bottom'].filter(Boolean);
  if (!steps.length) throw new Error('Choisis au moins un haut ou un bas');
  let current = person;
  for (let i = 0; i < steps.length; i++) {
    const slot = steps[i];
    const label = slot === 'top' ? 'le haut' : 'le bas';
    const base = (i / steps.length) * 100, span = 100 / steps.length;
    const onStatus = (s) => {
      if (s.position != null && s.position > 0) progress(`File d'attente : position ${s.position + 1}${s.eta ? ` (~${Math.ceil(s.eta)} s)` : ''}`, base + span * 0.1);
      else if (s.stage === 'generating' || s.stage === 'pending') {
        const p = s.progress_data?.[0];
        const frac = p && p.length ? p.index / p.length : 0.4;
        progress(`L'IA enfile ${label}…`, base + span * (0.2 + 0.75 * frac));
      }
    };
    progress(`Envoi de ta photo et ${slot === 'top' ? 'du haut' : 'du bas'}…`, base + 2);
    const g = outfit[slot];
    try {
      current = await leffa(current, g.image, slot === 'top' ? 'upper_body' : 'lower_body', token, onStatus);
    } catch (e) {
      // Secours : IDM-VTON pour les hauts uniquement
      if (slot === 'top' && !/quota|exceeded/i.test(String(e?.message))) {
        progress('Premier modèle indisponible, essai avec un second…', base + 10);
        try { current = await idm(current, g.image, g.title, token, onStatus); }
        catch (e2) { throw new Error(friendly(e2)); }
      } else throw new Error(friendly(e));
    }
  }
  progress('Terminé', 100);
  return current;
}

module.exports = { tryOn, download, friendly, _setLib: (l) => { gradio = l; clients.clear(); } };

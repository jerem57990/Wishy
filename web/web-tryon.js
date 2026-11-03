// Cabine d'essayage IA pour la web app : même logique que tryon.js (app PC), dans le navigateur.
import { Client, handle_file } from './vendor/gradio.js';

const SPACES = { leffa: 'franciszzj/Leffa', idm: 'yisol/IDM-VTON' };
const clients = new Map();
async function connect(space, token) {
  const key = space + (token || '');
  if (!clients.has(key)) clients.set(key, await Client.connect(space, token && token.startsWith('hf_') ? { hf_token: token } : {}));
  return clients.get(key);
}
const toBlob = async (dataUrl) => (await fetch(dataUrl)).blob();
const toDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
async function download(url, token) {
  const r = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  if (!r.ok) throw new Error(`Résultat inaccessible (${r.status})`);
  return toDataUrl(await r.blob());
}

function friendly(err) {
  const m = String(err?.message || err || '');
  if (/quota|exceeded|ZeroGPU|GPU duration/i.test(m)) return "Quota gratuit de calcul atteint pour aujourd'hui. Ajoute ton jeton Hugging Face gratuit dans les Réglages pour en avoir davantage, ou réessaie plus tard.";
  if (/paused|sleeping|building|not running|Could not resolve app config|503|502/i.test(m)) return "Le modèle d'essayage est en veille ou indisponible pour le moment. Réessaie dans quelques minutes.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion à Hugging Face. Vérifie ta connexion internet.';
  return m.slice(0, 220) || "L'essayage a échoué.";
}

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

export async function tryOnWeb(personDataUrl, outfit, token, progress = () => {}) {
  const steps = [outfit.top && 'top', outfit.bottom && 'bottom'].filter(Boolean);
  let current = personDataUrl;
  for (let i = 0; i < steps.length; i++) {
    const slot = steps[i], label = slot === 'top' ? 'le haut' : 'le bas';
    const base = (i / steps.length) * 100, span = 100 / steps.length;
    const onStatus = (s) => {
      if (s.position != null && s.position > 0) progress(`File d'attente : position ${s.position + 1}${s.eta ? ` (~${Math.ceil(s.eta)} s)` : ''}`, base + span * 0.1);
      else { const p = s.progress_data?.[0]; progress(`L'IA enfile ${label}…`, base + span * (0.2 + 0.75 * (p && p.length ? p.index / p.length : 0.4))); }
    };
    progress(`Envoi de ta photo et ${slot === 'top' ? 'du haut' : 'du bas'}…`, base + 2);
    const person = await toBlob(current), garment = await toBlob(outfit[slot].image);
    try {
      const c = await connect(SPACES.leffa, token);
      const d = await run(c, '/leffa_predict_vt', [handle_file(person), handle_file(garment), false, 30, 2.5, 42, 'viton_hd', slot === 'top' ? 'upper_body' : 'lower_body', false], onStatus);
      current = await download(d[0].url || d[0], token);
    } catch (e) {
      if (slot !== 'top' || /quota|exceeded/i.test(String(e?.message))) throw new Error(friendly(e));
      progress('Premier modèle indisponible, essai avec un second…', base + 10);
      try {
        const c = await connect(SPACES.idm, token);
        const d = await run(c, '/tryon', [{ background: handle_file(person), layers: [], composite: null }, handle_file(garment), outfit[slot].title || 'garment', true, true, 30, 42], onStatus);
        current = await download(d[0].url || d[0], token);
      } catch (e2) { throw new Error(friendly(e2)); }
    }
  }
  progress('Terminé', 100);
  return current;
}

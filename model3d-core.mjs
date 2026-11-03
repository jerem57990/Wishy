// Génération d'un modèle 3D (GLB) à partir d'une photo produit, avec TRELLIS (Hugging Face, gratuit).
// Partagé par l'app PC (Node) et la web app (navigateur) : la bibliothèque Gradio est fournie par l'appelant.

export const TRELLIS_SPACE = 'trellis-community/TRELLIS';

function friendly(err) {
  const m = String(err?.message || err || '');
  if (/quota|exceeded|ZeroGPU|GPU duration/i.test(m)) return "Quota gratuit de calcul atteint pour aujourd'hui. Ajoute ton jeton Hugging Face dans les Réglages, ou réessaie plus tard.";
  if (/paused|sleeping|building|not running|Could not resolve app config|503|502/i.test(m)) return 'Le modèle 3D est en veille ou indisponible. Réessaie dans quelques minutes.';
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ENOTFOUND/i.test(m)) return 'Pas de connexion à Hugging Face.';
  return m.slice(0, 200) || 'La création 3D a échoué.';
}

// Lit les événements d'un appel Gradio sans attendre la fermeture du flux (évite un blocage connu)
async function run(job, onStatus) {
  const it = job[Symbol.asyncIterator]();
  for (;;) {
    const { value: ev, done } = await it.next();
    if (done) throw new Error('Aucun résultat reçu');
    if (ev.type === 'status') {
      if (ev.stage === 'error') throw new Error(ev.message || 'Erreur du modèle');
      onStatus?.(ev);
    }
    if (ev.type === 'data') return ev.data;
  }
}

/**
 * @param {{Client:any, handle_file:Function}} lib  @gradio/client
 * @param {Blob} image  photo du produit
 * @param {string} token  jeton Hugging Face (facultatif)
 * @param {(text:string, pct:number)=>void} progress
 * @returns {Promise<ArrayBuffer>} fichier GLB
 */
export async function generateGLB(lib, image, token, progress = () => {}) {
  try {
    progress('Connexion au modèle 3D…', 3);
    const app = await lib.Client.connect(TRELLIS_SPACE, token && token.startsWith('hf_') ? { hf_token: token } : {});
    try { await app.predict('/start_session', []); } catch (_) { /* facultatif selon les versions */ }
    progress("Détourage de l'article…", 10);
    const pre = await run(app.submit('/preprocess_image', [lib.handle_file(image)]), () => {});
    const processed = await (await fetch(pre[0].url || pre[0])).blob();
    progress('Sculpture en 3D…', 25);
    const data = await run(app.submit('/generate_and_extract_glb', [lib.handle_file(processed), [], false, Math.floor(Math.random() * 1e6), 7.5, 12, 3, 12, 'stochastic', 0.95, 1024]), (s) => {
      if (s.position != null && s.position > 0) progress(`File d'attente : position ${s.position + 1}${s.eta ? ` (~${Math.ceil(s.eta)} s)` : ''}`, 25);
      else progress('Sculpture en 3D…', 55);
    });
    const glbUrl = data.map((d) => d?.url).find((u) => /\.glb/i.test(u || ''));
    if (!glbUrl) throw new Error("Le modèle n'a pas renvoyé de fichier 3D");
    progress('Téléchargement du modèle…', 90);
    const r = await fetch(glbUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!r.ok) throw new Error(`Modèle inaccessible (${r.status})`);
    const buf = await r.arrayBuffer();
    progress('Terminé', 100);
    return buf;
  } catch (e) {
    throw new Error(friendly(e));
  }
}

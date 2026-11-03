// Test manuel : génère un modèle 3D (GLB) à partir d'une photo produit avec TRELLIS (Hugging Face).
import { Client, handle_file } from '@gradio/client';
import fs from 'node:fs';
const step = (name, p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${name} : délai dépassé (${ms / 1000} s)`)), ms))]);
setTimeout(() => { console.log('ARRÊT : délai global dépassé'); process.exit(2); }, 12 * 60000);

const url = process.env.IMG_URL;
const token = process.env.HF_TOKEN || undefined;
const t0 = Date.now();
const img = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130' } })).blob();
console.log('photo', img.size, 'octets', img.type);
const SPACE = process.env.SPACE || 'trellis-community/TRELLIS';
console.log('connexion à', SPACE);
const app = await step('connexion', Client.connect(SPACE, token ? { hf_token: token } : {}), 90000);
const api = await step('view_api', app.view_api(), 60000);
console.log('endpoints:', Object.keys(api.named_endpoints).join(', '));
try { await step('start_session', app.predict('/start_session', []), 60000); console.log('session ok'); } catch (e) { console.log('start_session:', e.message); }
const pre = await step('détourage', app.predict('/preprocess_image', [handle_file(img)]), 240000);
console.log('détourage ok', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(pre.data).slice(0, 160));
const processed = await (await fetch(pre.data[0].url)).blob();
const job = app.submit('/generate_and_extract_glb', [handle_file(processed), [], false, 0, 7.5, 12, 3, 12, 'stochastic', 0.95, 1024]);
const it = job[Symbol.asyncIterator]();
for (;;) {
  const { value: ev, done } = await it.next();
  if (done) break;
  if (ev.type === 'status') console.log('statut', ev.stage, ev.position ?? '', ev.message ?? '');
  if (ev.type === 'data') {
    console.log('sorties', JSON.stringify(ev.data).slice(0, 300));
    const glb = ev.data.map((d) => d?.url).find((u) => /\.glb/i.test(u || ''));
    const buf = Buffer.from(await (await fetch(glb)).arrayBuffer());
    fs.writeFileSync('model.glb', buf);
    console.log('GLB', buf.length, 'octets, magic', buf.subarray(0, 4).toString(), 'en', Math.round((Date.now() - t0) / 1000), 's');
    process.exit(0);
  }
}
process.exit(0);

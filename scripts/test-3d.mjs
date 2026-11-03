// Test manuel : génère un modèle 3D (GLB) à partir d'une photo produit avec TRELLIS (Hugging Face).
import { Client, handle_file } from '@gradio/client';
import fs from 'node:fs';

const url = process.env.IMG_URL;
const token = process.env.HF_TOKEN || undefined;
const t0 = Date.now();
const img = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130' } })).blob();
console.log('photo', img.size, 'octets', img.type);
const app = await Client.connect('trellis-community/TRELLIS', token ? { hf_token: token } : {});
const api = await app.view_api();
console.log('endpoints:', Object.keys(api.named_endpoints).join(', '));
try { await app.predict('/start_session', []); console.log('session ok'); } catch (e) { console.log('start_session:', e.message); }
const pre = await app.predict('/preprocess_image', [handle_file(img)]);
console.log('détourage ok', Math.round((Date.now() - t0) / 1000), 's', JSON.stringify(pre.data).slice(0, 160));
const processed = await (await fetch(pre.data[0].url)).blob();
const job = app.submit('/generate_and_extract_glb', [handle_file(processed), [], false, 0, 7.5, 12, 3, 12, 'stochastic', 0.95, 1024]);
for await (const ev of job) {
  if (ev.type === 'status') console.log('statut', ev.stage, ev.position ?? '', ev.message ?? '');
  if (ev.type === 'data') {
    console.log('sorties', JSON.stringify(ev.data).slice(0, 300));
    const glb = ev.data[2]?.url || ev.data[3]?.url;
    const buf = Buffer.from(await (await fetch(glb)).arrayBuffer());
    fs.writeFileSync('model.glb', buf);
    console.log('GLB', buf.length, 'octets, magic', buf.subarray(0, 4).toString(), 'en', Math.round((Date.now() - t0) / 1000), 's');
    break;
  }
}
process.exit(0);

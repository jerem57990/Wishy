// Test de bout en bout du cloud Wishy (lancé à la main depuis GitHub Actions avec un compte de test).
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { emptyMeta, syncOnce } from '../sync-core.mjs';
import fs from 'node:fs';

const CLOUD = JSON.parse(fs.readFileSync(new URL('../cloud-config.json', import.meta.url)));
const { E2E_EMAIL: email, E2E_PASSWORD: password } = process.env;
const opts = { auth: { persistSession: false }, realtime: { transport: globalThis.WebSocket || WebSocket } };
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) process.exitCode = 1; };

const A = createClient(CLOUD.SUPABASE_URL, CLOUD.SUPABASE_ANON_KEY, opts);
const B = createClient(CLOUD.SUPABASE_URL, CLOUD.SUPABASE_ANON_KEY, opts);
const la = await A.auth.signInWithPassword({ email, password });
const lb = await B.auth.signInWithPassword({ email, password });
ok(!la.error && !lb.error, `connexion (${la.error?.message || 'ok'})`);

// 1. Synchronisation entre deux appareils
const pc = { items: [{ id: 'e2e-1', title: 'Article de test', price: 10, status: 'wish', url: 'https://example.com/x', history: [] }], purchases: [], settings: {} };
const phone = { items: [], purchases: [], settings: {} };
const mPc = emptyMeta(), mPh = emptyMeta();
await syncOnce(A, pc, mPc); await syncOnce(B, phone, mPh);
ok(phone.items.some((i) => i.id === 'e2e-1'), 'article du PC reçu sur l\'iPhone');
phone.items.find((i) => i.id === 'e2e-1').price = 8;
await syncOnce(B, phone, mPh); await syncOnce(A, pc, mPc);
ok(pc.items.find((i) => i.id === 'e2e-1').price === 8, 'modification de l\'iPhone reçue sur le PC');

// 2. Sécurité : un client non connecté ne voit rien
const anon = createClient(CLOUD.SUPABASE_URL, CLOUD.SUPABASE_ANON_KEY, opts);
const { data: leak } = await anon.from('items').select('id');
ok((leak || []).length === 0, 'données invisibles sans connexion (RLS)');

// 3. Lecture de fiches produit depuis le cloud
for (const url of (process.env.E2E_URLS || '').split(/\s+/).filter(Boolean)) {
  const { data, error } = await A.functions.invoke('fetch-product', { body: { url } });
  console.log(`   ${error ? 'ERREUR ' + error.message : `${data.ok ? 'ok' : 'échec'} · ${data.title?.slice(0, 50)} · ${data.price ?? 'prix ?'} € · ${data.category} · image ${data.image ? 'oui' : 'non'}`} ← ${url}`);
}
const img = await A.functions.invoke('fetch-product', { body: { image: 'https://jerem57990.github.io/Wishy/assets/icon-192.png' } });
console.log(`   proxy image : ${img.data?.ok ? 'ok' : img.data?.error || img.error?.message}`);

// 4. Raccourci iOS (quick-add)
const token = 'e2e' + Math.random().toString(36).slice(2);
await A.from('add_tokens').delete().neq('token', '');
const ins = await A.from('add_tokens').insert({ token });
ok(!ins.error, `clé de raccourci créée ${ins.error?.message || ''}`);
const r = await fetch(`${CLOUD.SUPABASE_URL}/functions/v1/quick-add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, url: (process.env.E2E_URLS || 'https://example.com').split(/\s+/)[0] }) });
const msg = await r.text();
ok(r.ok, `raccourci : ${msg}`);
await syncOnce(B, phone, mPh);
ok(phone.items.length >= 2, 'article du raccourci synchronisé');

// Nettoyage
await A.from('items').delete().neq('id', '');
await A.from('add_tokens').delete().neq('token', '');
await A.from('settings').delete().neq('data', 'null');
console.log('Nettoyage terminé');
process.exit(process.exitCode || 0);

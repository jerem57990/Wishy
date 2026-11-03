// Assemble la web app iPhone (PWA) dans le dossier pwa/ à partir de l'interface de l'app PC (src/)
// et des fichiers propres au web (web/). Utilisé par la GitHub Action de publication sur GitHub Pages.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'pwa');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

// 1. Interface commune (src/) + fichiers web
fs.cpSync(path.join(root, 'src'), out, { recursive: true });
fs.cpSync(path.join(root, 'web'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'sync-core.mjs'), path.join(out, 'sync-core.mjs'));
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets', 'icon.png'), path.join(out, 'assets', 'icon.png'));
fs.rmSync(path.join(out, 'demo-api.js'), { force: true });

// 2. Bibliothèques pour le navigateur
const entries = { supabase: "export { createClient } from '@supabase/supabase-js';", gradio: "export { Client, handle_file } from '@gradio/client';" };
for (const [name, contents] of Object.entries(entries)) {
  await build({ stdin: { contents, resolveDir: root }, bundle: true, format: 'esm', platform: 'browser', minify: true, outfile: path.join(out, 'vendor', `${name}.js`), logLevel: 'warning' });
}

// 3. Page d'accueil adaptée au web
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; connect-src * data: blob:; worker-src 'self'" />`)
  .replace('<title>Wishy</title>', `<title>Wishy</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#eef0f4" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Wishy" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png" />
  <link rel="icon" href="assets/icon-192.png" />`)
  .replace('<link rel="stylesheet" href="styles.css" />', '<link rel="stylesheet" href="styles.css" />\n  <link rel="stylesheet" href="mobile.css" />')
  .replaceAll('../assets/icon.png', 'assets/icon.png')
  .replace('<script type="module" src="app.js"></script>', '<script type="module" src="web-boot.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

// 4. Service worker : liste des fichiers à garder hors-ligne
const files = [];
(function walk(d, rel = '') {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f), r = rel ? `${rel}/${f}` : f;
    if (fs.statSync(p).isDirectory()) walk(p, r); else if (r !== 'sw.js') files.push(r);
  }
})(out);
const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8')
  .replace('__BUILD__', Date.now().toString(36))
  .replace('__SHELL__', JSON.stringify(['./', ...files]));
fs.writeFileSync(path.join(out, 'sw.js'), sw);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`PWA prête dans pwa/ (${files.length} fichiers)`);

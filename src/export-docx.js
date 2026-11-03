// Export d'une sélection ou d'une liste Wishy en document Word (.docx), sur PC comme sur iPhone.
import {
  Document, Packer, Paragraph, TextRun, ImageRun, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, VerticalAlign, TableLayoutType, Footer, PageNumber,
} from './vendor/docx.js';

const INK = '17171C', MUTED = '73768A', MINT = '067A55', SUN = 'FFD21F', SUN_SOFT = 'FFF4B8', LINE = 'E2E5EB';
const FONT = 'Arial';
const eur = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n));
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };

// Photo produit → JPEG compact (Word ne lit pas le WebP ou l'AVIF)
async function photo(api, url, max = 260) {
  if (!url) return null;
  try {
    const src = url.startsWith('data:') ? url : await api.imageData(url);
    if (!src) return null;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const b64 = cv.toDataURL('image/jpeg', 0.85).split(',')[1];
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, w: cv.width, h: cv.height };
  } catch { return null; }
}

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color || INK, strike: o.strike });
const link = (text, url, o = {}) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size: o.size || 20, bold: o.bold, color: o.color || '2B59C3', underline: o.underline === false ? undefined : {} })] });
const para = (children, o = {}) => new Paragraph({ children, spacing: { after: o.after ?? 60, before: o.before ?? 0 }, alignment: o.align });

function itemRow(it, pic, ctx) {
  const best = ctx.bestPrice(it), d = ctx.dropOf(it);
  const cat = ctx.CATS[it.category] || ctx.CATS.autre;
  const details = [
    para([link(it.title || 'Article', best?.url || it.url, { bold: true, size: 24, color: INK, underline: false })], { after: 40 }),
    para([run(`${it.store || ''}${it.brand ? ` · ${it.brand}` : ''}${it.priority ? ` · ${'★'.repeat(it.priority)}` : ''}`, { color: MUTED, size: 18 })], { after: 80 }),
    para([
      run(eur(best?.price), { bold: true, size: 28 }),
      ...(d ? [run('   '), run(eur(d.from), { strike: true, color: MUTED, size: 20 }), run(`   −${d.pct} %${d.onSite ? ' sur le site' : ''}`, { bold: true, color: MINT, size: 20 })] : []),
      ...(best && best.store !== it.store ? [run(`   chez ${best.store}`, { color: MUTED, size: 18 })] : []),
    ], { after: 80 }),
  ];
  const facts = [];
  if (it.size) facts.push(['Taille', it.size]);
  const j = it.jersey;
  if (j) {
    const flock = [j.name, j.number].filter(Boolean).join(' ');
    if (flock) facts.push(['Flocage', flock]);
    if (j.patches?.length) facts.push(['Patchs', j.patches.join(', ')]);
    for (const [k, v] of Object.entries(j.shop || {})) if (v) facts.push([k, v]);
    if (flock && j.version) facts.push(['Version', j.version]);
    if (j.sleeves === 'longues') facts.push(['Manches', 'longues']);
  }
  if (it.scent) {
    for (const [k, l] of [['top', 'Notes de tête'], ['heart', 'Notes de cœur'], ['base', 'Notes de fond']]) if (it.scent[k]?.length) facts.push([l, it.scent[k].join(', ')]);
  }
  const piece = ctx.pieceOf?.(it);
  if (piece) facts.push(['Type', ctx.PIECES[piece].label]);
  if (it.targetPrice) facts.push(['Prix visé', eur(it.targetPrice)]);
  if (it.status === 'bought') facts.push(['Statut', `Acheté${it.boughtPrice ? ` ${eur(it.boughtPrice)}` : ''}`]);
  if (facts.length) details.push(para(facts.flatMap(([k, v], i) => [run(`${i ? '   ·   ' : ''}${k} : `, { color: MUTED, size: 18 }), run(v, { bold: true, size: 18 })]), { after: 60 }));
  if (it.notes) details.push(para([run(it.notes, { italics: true, size: 19, color: '3C3D47' })], { after: 60 }));
  details.push(para([link('Voir l\'article ↗', best?.url || it.url, { size: 18 })], { after: 0 }));

  const imgCell = new TableCell({
    width: { size: 2300, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 120, right: 200 },
    children: [pic
      ? new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: pic.bytes, transformation: { width: Math.round(110 * (pic.w / Math.max(pic.w, pic.h))), height: Math.round(110 * (pic.h / Math.max(pic.w, pic.h))) } })] })
      : para([run(cat.emoji, { size: 48 })], { align: AlignmentType.CENTER })],
  });
  const textCell = new TableCell({ width: { size: 7300, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, margins: { top: 120, bottom: 120, left: 80, right: 120 }, children: details });
  return new TableRow({ cantSplit: true, children: [imgCell, textCell] });
}

export async function buildDocx(items, title, ctx) {
  const pics = await Promise.all(items.map((it) => photo(ctx.api, it.tryonImage || it.image)));
  const byCat = new Map();
  items.forEach((it, i) => { const k = it.category || 'autre'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k).push([it, pics[i]]); });
  const total = items.filter((i) => i.status !== 'bought').reduce((s, i) => s + (ctx.bestPrice(i)?.price || 0), 0);
  const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const children = [
    new Paragraph({ children: [run(title, { bold: true, size: 52 })], spacing: { after: 80 } }),
    para([run(`${items.length} article${items.length > 1 ? 's' : ''}  ·  ${eur(total)}  ·  ${date}`, { color: MUTED, size: 20 })], { after: 280 }),
  ];
  for (const [k, list] of byCat) {
    const c = ctx.CATS[k] || ctx.CATS.autre;
    children.push(new Paragraph({
      children: [run(`${c.emoji}  ${c.label}`, { bold: true, size: 26 }), run(`   ${list.length}`, { color: MUTED, size: 20 })],
      shading: { type: ShadingType.CLEAR, fill: SUN_SOFT, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: SUN, space: 6 } },
      spacing: { before: 200, after: 120 },
    }));
    children.push(new Table({
      layout: TableLayoutType.FIXED, width: { size: 9600, type: WidthType.DXA }, columnWidths: [2300, 7300],
      borders: { ...noBorders, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
      rows: list.map(([it, pic]) => itemRow(it, pic, ctx)),
    }));
  }
  return new Document({
    creator: 'Wishy', title, description: 'Wishlist exportée depuis Wishy',
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Créé avec Wishy  ·  page ', { color: MUTED, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })] }) },
      children,
    }],
  });
}

export async function exportWord(items, title, ctx) {
  const doc = await buildDocx(items, title, ctx);
  const blob = await Packer.toBlob(doc);
  const name = `Wishy - ${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'wishlist'}.docx`;
  const file = new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  // iPhone : feuille de partage (Enregistrer dans Fichiers, Mail, WhatsApp…)
  if (ctx.api.platform === 'web' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

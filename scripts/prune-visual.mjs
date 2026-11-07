#!/usr/bin/env node
// Pruning must not change anything that is used: renders every kitchen-sink page (light/dark, several states,
// wide and phone) with dist/all.css and with all.css pruned for the kitchen sink; the screenshots must be identical.
// Usage: npm run build && node scripts/prune-visual.mjs   (needs Chrome or Chromium, like npm run visual)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const { launch, findBrowser } = await import(root + 'packages/inspect/lib/cdp.js');
const { serve } = await import(root + 'scripts/visual.mjs');
const { projectUsage, pruneCss } = await import(root + 'lib/prune.js');
const dir = root + 'shots/prune/';
mkdirSync(dir, { recursive: true });
const full = readFileSync(root + 'dist/all.css', 'utf8');
writeFileSync(dir + 'full.css', full);
writeFileSync(dir + 'pruned.css', pruneCss(full, projectUsage([root + 'kitchen-sink'])));
const pages = readdirSync(root + 'kitchen-sink').filter(f => f.endsWith('.html'));
for (const p of pages) for (const v of ['full', 'pruned']) {
  let html = readFileSync(root + 'kitchen-sink/' + p, 'utf8')
    .replace(/<link rel="stylesheet" href="\.\.\/src\/core\.css"[^>]*>/, `<link rel="stylesheet" href="${v}.css">`)
    .replace(/<link rel="stylesheet" href="\.\.\/src\/[\w-]+\.css"[^>]*>\n?/g, '')
    .replace(/href="(demo|theme-examples)\.css"/g, 'href="../../kitchen-sink/$1.css"');
  writeFileSync(dir + `${v}-${p}`, html);
}
const server = await serve(), base = `http://127.0.0.1:${server.address().port}/shots/prune/`;
const b = await launch(findBrowser());
const page = await b.newPage();
let bad = 0, n = 0;
const states = { 'index.html': ['', '&example=ink', '&density=compact'], 'app.html': ['', '&collapsed', '&menu', '&dialog'], 'components.html': ['&tip'] };
for (const p of pages) for (const t of ['light', 'dark']) for (const extra of states[p] ?? ['']) for (const width of [1280, 390]) {
  const shots = [];
  for (const v of ['full', 'pruned']) {
    await page.goto(`${base}${v}-${p}?t=${t}${extra}`, { width, height: 800, scheme: t, settle: 300 });
    await page.evaluate(`(async () => { document.head.appendChild(document.createElement('style')).textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; await document.fonts.ready; await new Promise(r => setTimeout(r, 150)); })()`);
    const height = await page.evaluate('document.documentElement.scrollHeight');
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.evaluate('new Promise(r => setTimeout(r, 150))');
    shots.push((await page.send('Page.captureScreenshot', { format: 'png' })).data);
  }
  n++;
  if (shots[0] !== shots[1]) { bad++; console.log(`DIFF ${p} ${t}${extra} ${width}`); writeFileSync(dir + `diff-${p}-${t}${extra}-${width}-full.png`, Buffer.from(shots[0], 'base64')); writeFileSync(dir + `diff-${p}-${t}${extra}-${width}-pruned.png`, Buffer.from(shots[1], 'base64')); }
}
await b.close(); server.close();
if (bad) process.exitCode = 1;
console.log(`${n - bad}/${n} identical; pruned ${full.length} -> ${readFileSync(dir + 'pruned.css', 'utf8').length} bytes`);

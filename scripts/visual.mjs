#!/usr/bin/env node
// Visual regression tests: screenshots of the kitchen sink pages in a fixed set of states, compared
// pixel by pixel with the baselines in test/visual/. Headless Chrome takes the screenshots and also does
// the comparison (canvas), so there are no dependencies.
//
// Usage: node scripts/visual.mjs [--update] [--only <substring>] [--tolerance 0.0001] [--browser <cmd>]
//   --update     write the current screenshots as the new baselines (after checking the diffs!)
//   --only       run only the cases whose name contains the substring
//   --tolerance  share of pixels that may differ (default 0.0001 = 0.01%)
// On a mismatch, shots/visual/<name>.actual.png and <name>.diff.png (changes in red) are written and the
// exit code is 1. Baselines depend on the machine's fonts and Chrome version: update them after changing
// either, and compare only on the machine that made them.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const baseDir = join(root, 'test/visual'), outDir = join(root, 'shots/visual');

// [name, page + query, width, full page?]. Height is 800 unless the full page is captured.
const CASES = [
  ...['light', 'dark'].flatMap(t => [
    [`sink-${t}`, `index.html?t=${t}`, 1280, true],
    [`sink-${t}-compact`, `index.html?t=${t}&density=compact`, 1280, true],
    [`sink-${t}-phone`, `index.html?t=${t}`, 390, true],
    [`sink-ink-${t}`, `index.html?t=${t}&example=ink`, 1280, true],
    [`sink-fjord-${t}`, `index.html?t=${t}&example=fjord`, 1280, true],
    [`app-${t}`, `app.html?t=${t}`, 1280],
  ]),
  ['app-light-phone', 'app.html?t=light', 390],
  ['app-collapsed', 'app.html?t=light&collapsed', 1280],
  ['app-menu', 'app.html?t=light&menu', 1280],
  ['app-dialog', 'app.html?t=light&dialog', 1280],
  ['app-drawer-phone', 'app.html?t=light&open', 390],
];

const FREEZE = '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';

/** Runs in the page: compares two PNGs (data URLs) and draws a diff image. */
async function compare(a, b, threshold) {
  const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { size: [`${ia.width}×${ia.height}`, `${ib.width}×${ib.height}`] };
  const w = ia.width, h = ia.height;
  const pixels = img => { const c = new OffscreenCanvas(w, h).getContext('2d'); c.drawImage(img, 0, 0); return c.getImageData(0, 0, w, h).data; };
  const pa = pixels(ia), pb = pixels(ib);
  const out = new ImageData(w, h), o = out.data;
  let changed = 0, box = null;
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (d > threshold) {
      changed++; o[i] = 230; o[i + 1] = 0; o[i + 2] = 0; o[i + 3] = 255;
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      box = box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y];
    } else {
      const g = 255 - (255 - (pb[i] * 0.3 + pb[i + 1] * 0.59 + pb[i + 2] * 0.11)) * 0.25; // faded grey of the new image
      o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255;
    }
  }
  if (!changed) return { changed, total: w * h };
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0);
  return { changed, total: w * h, box, diff: c.toDataURL('image/png') };
}

export function serve() {
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = readFileSync(join(root, path)); res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

export async function run({ update = false, only, tolerance = 0.0001, threshold = 24, browser } = {}) {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/kitchen-sink/`;
  const b = await launch(browser ? browser.split(' ') : findBrowser());
  const results = [];
  mkdirSync(baseDir, { recursive: true });
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  try {
    const page = await b.newPage(); // one tab only: a background tab gets throttled timers and painting
    for (const [name, url, width, full] of CASES.filter(c => !only || c[0].includes(only))) {
      const scheme = url.includes('t=dark') ? 'dark' : 'light';
      await page.goto(base + url, { width, height: 800, scheme, settle: 300 });
      await page.evaluate(`(async () => {
        document.head.appendChild(document.createElement('style')).textContent = ${JSON.stringify(FREEZE)};
        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 150));
      })()`);
      if (full) {
        const height = await page.evaluate('document.documentElement.scrollHeight');
        await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await page.evaluate('new Promise(r => setTimeout(r, 150))');
      }
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      const file = join(baseDir, `${name}.png`);
      if (update || !existsSync(file)) {
        results.push({ name, status: existsSync(file) ? 'updated' : 'new' });
        writeFileSync(file, Buffer.from(data, 'base64'));
        continue;
      }
      const r = await page.evaluate(`(${compare.toString()})(${JSON.stringify('data:image/png;base64,' + readFileSync(file).toString('base64'))}, ${JSON.stringify('data:image/png;base64,' + data)}, ${threshold})`);
      const ok = !r.size && r.changed / r.total <= tolerance;
      results.push({ name, status: ok ? 'ok' : 'changed', ...r, diff: undefined });
      if (!ok) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${name}.actual.png`), Buffer.from(data, 'base64'));
        if (r.diff) writeFileSync(join(outDir, `${name}.diff.png`), Buffer.from(r.diff.split(',')[1], 'base64'));
      }
    }
  } finally { await b.close(); server.close(); }
  const known = new Set(CASES.map(c => `${c[0]}.png`));
  const stale = readdirSync(baseDir).filter(f => f.endsWith('.png') && !known.has(f));
  return { results, stale };
}

export function report({ results, stale }) {
  const lines = results.map(r => {
    if (r.status !== 'changed') return `${r.status === 'ok' ? '✓' : '+'} ${r.name}${r.status === 'ok' ? '' : ` (${r.status} baseline)`}`;
    if (r.size) return `✗ ${r.name}: size changed from ${r.size[0]} to ${r.size[1]}`;
    const [x0, y0, x1, y1] = r.box;
    return `✗ ${r.name}: ${r.changed} pixels changed (${(r.changed / r.total * 100).toFixed(3)}%) in x ${x0}–${x1}, y ${y0}–${y1}`;
  });
  for (const f of stale) lines.push(`? test/visual/${f} has no case; delete it`);
  const failed = results.filter(r => r.status === 'changed');
  if (failed.length) lines.push('', `${failed.length} of ${results.length} changed. See shots/visual/*.diff.png (changes in red) and *.actual.png.`,
    'If the change is intended: node scripts/visual.mjs --update');
  return { text: lines.join('\n'), failed: failed.length > 0 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i], v = () => args[++i];
    if (a === '--update') opts.update = true;
    else if (a === '--only') opts.only = v();
    else if (a === '--tolerance') opts.tolerance = +v();
    else if (a === '--browser') opts.browser = v();
    else { console.error(`Unknown option ${a}`); process.exit(2); }
  }
  const { text, failed } = report(await run(opts));
  console.log(text);
  process.exitCode = failed ? 1 : 0;
}

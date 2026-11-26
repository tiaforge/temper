// Runtime health and dangling references: every check fires on health-broken.html, none on health-clean.html (patterns
// that look alike), over HTTP and from file://. Skipped (apart from the helpers) when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect, format } from '../lib/inspect.js';
import { findBrowser, launch } from '../lib/cdp.js';
import { install } from '../lib/audit.js';
import { shortUrl, firstLine } from '../lib/runtime.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const skip = !browser && 'no Chrome/Chromium found';
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function serve() {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/api/slow') return; // never answers; the page aborts it
    try { res.setHeader('content-type', 'text/html'); res.end(await readFile(join(fixtures, path))); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/` };
}

// A TMPDIR of its own, so parallel test files do not see each other's browser profiles.
async function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prev = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prev;
    rmSync(tmp, { recursive: true, force: true });
  }
}

const line = f => `${f.severity} ${f.code}: ${f.selector ? f.selector + ' ' : ''}${f.message}`;

test('URLs and messages are shortened for the report', () => {
  assert.equal(shortUrl('http://localhost:5173/src/app.js?v=1', 'http://localhost:5173/contacts/'), '/src/app.js?v=1');
  assert.equal(shortUrl('file:///srv/site/css/a.css', 'file:///srv/site/index.html'), 'css/a.css');
  assert.equal(shortUrl('file:///other/a.css', 'file:///srv/site/index.html'), '/other/a.css');
  assert.equal(shortUrl('https://cdn.example/x.js', 'http://localhost:5173/'), 'https://cdn.example/x.js');
  assert.equal(shortUrl('http://localhost/' + 'a'.repeat(200), 'http://localhost/').length, 100);
  assert.equal(firstLine('TypeError: x is undefined\n    at f (app.js:3:1)'), 'TypeError: x is undefined');
  assert.equal(firstLine('x'.repeat(300)).length, 200);
});

test('every runtime and document check on health-broken.html, attributed to its state; none on health-clean.html', { skip }, async () => {
  const { srv, base } = await serve();
  try {
    await withTmp(async () => {
      const { findings } = await inspect([`${base}health-broken.html`, `${base}health-clean.html`], { settle: 200, widths: [1280, 390], schemes: ['light'] });
      const of = (file, state = 'page') => findings.filter(f => f.url.endsWith(file) && f.state === state);
      const page = of('health-broken.html');
      const codes = [...new Set(page.map(f => `${f.severity} ${f.code}`))].sort();
      for (const c of ['error doctype', 'error viewport', 'warning zoom', 'warning lang', 'warning title', 'error image', 'warning font',
        'error id', 'warning id', 'error ref', 'warning ref', 'error submit', 'info submit', 'warning shift', 'info settle',
        'error exception', 'warning console', 'error request', 'warning request'])
        assert.ok(codes.includes(c), `${c} in ${codes.join(', ')}`);
      const has = (re, list = page) => assert.ok(list.some(f => re.test(line(f))), `${re} in\n${list.map(line).join('\n')}`);

      // runtime: exceptions and rejections with where they happened, two console errors kept apart, the CSP violation
      assert.equal(page.filter(f => f.code === 'request' && f.selector.includes('health-missing.css')).length, 1, 'the audit\'s own fetch of a stylesheet is not reported');
      has(/^error exception: uncaught exception: TypeError: late is undefined \(at line \d+ of the page\)$/);
      has(/^error exception: unhandled promise rejection: Error: nobody handles this/);
      has(/^warning console: console\.error: Something failed: \{code: 42\}/);
      has(/^warning console: console\.error: Another thing failed/);
      has(/^warning console: the browser logged: Loading the image 'https:\/\/example\.invalid\/bg\.png' violates/);
      // requests: what the page needs is an error, a fetch a warning; the broken <img> is reported once, by its element
      has(/^error request: \/health-missing\.css answered 404 Not Found \(stylesheet\), so its styles are missing$/);
      has(/^error request: \/health-missing\.js answered 404/);
      has(/^error request: \/health-missing\.woff2 answered 404 Not Found \(font\)/);
      has(/^warning request: \/api\/missing answered 404 Not Found \(fetch\)$/);
      assert.ok(!page.some(f => f.code === 'request' && /png|favicon|example\.invalid|hmr/.test(f.selector)), page.filter(f => f.code === 'request').map(line).join('\n'));
      has(/^error image: img#photo its image did not load \(\/health-missing\.png\), so it shows as a broken image$/);
      // the document
      has(/^error viewport: meta\[name="viewport"\] the viewport meta tag has no width=device-width: a phone lays the page out about 980px wide/);
      has(/^warning zoom: .*user-scalable=no, maximum-scale=1/);
      has(/^warning font: @font-face "Missing" this web font failed to load/);
      // ids and references
      has(/^error id: input#email id "email" is on 2 elements \(input, input\), and label\[for\] refers to it/);
      has(/^warning id: p#note id "note" is on 2 elements/);
      has(/^error ref: label "Orphan label" for="nothing" points at no element/);
      has(/^error ref: button "Open missing dialog" commandfor="no-dialog" points at no element/);
      has(/^error ref: button "Open missing popover" popovertarget="no-popover"/);
      has(/^error ref: button "Open a plain div" popovertarget="plain" points at div#plain, which has no popover attribute/);
      has(/^error ref: button\[data-testid="dangling-name"\] aria-labelledby="no-label" points at no element \(no id "no-label"\), so it has no accessible name$/);
      has(/^error ref: input\[aria-label="Search"\] list="no-list"/);
      has(/^warning ref: input\[aria-label="Search"\] aria-describedby="no-hint"/);
      has(/^warning ref: a\[href="#nowhere"\] "Jump to nowhere" links to #nowhere/);
      // an aria-labelledby that points at nothing, or at an empty element, is no name
      has(/^error label: button\[data-testid="dangling-name"\] has no accessible name/);
      has(/^error label: button\[data-testid="empty-name"\] has no accessible name/);
      // buttons in forms
      has(/^error submit: #filters button "Filters" has no type, so inside form#filters it submits the form instead of opening #filter-menu/);
      has(/^error submit: #filters button "Help" has commandfor but no type/);
      has(/^info submit: form#rows has 3 buttons without a type, and each one submits it \("Add row", "Remove row", "Save"\)/);
      // loading and settling
      has(/^warning shift: .* the layout shifted while the page loaded \(cumulative layout shift 0\.\d\d, above 0\.1\): .*moved \d+px/);
      has(/^info settle: p\.pulse "Pulsing forever\." is still animating when checked \(pulse\)/);
      // what the opener's handler threw and what the dialog requested belong to the dialog
      const detail = of('health-broken.html', 'dialog dialog#detail').map(line);
      assert.ok(detail.includes('warning request: /api/detail-missing answered 404 Not Found (fetch)'), detail.join('\n'));
      assert.ok(detail.some(l => /^error exception: uncaught exception: Error: opener failed/.test(l)), detail.join('\n'));
      assert.ok(!page.some(f => /opener failed|detail-missing/.test(f.message + f.selector)));
      // the document checks run once per page, not again in each overlay
      assert.ok(!findings.some(f => f.state !== 'page' && ['doctype', 'viewport', 'id', 'ref'].includes(f.code)));

      // the clean page: no errors or warnings, and none of the new infos
      const clean = findings.filter(f => f.url.endsWith('health-clean.html'));
      assert.deepEqual(clean.filter(f => f.severity !== 'info').map(line), []);
      assert.deepEqual(clean.filter(f => ['settle', 'submit', 'shift'].includes(f.code)).map(line), []);

      // the text report: a finding about no element has no empty selector in front of its message
      assert.match(format(findings), /\n {4}error doctype: the page renders in quirks mode/);
    });
  } finally { srv.close(); }
});

test('from file://: missing files are failed requests, fetch is blocked by the scheme', { skip }, async () => {
  await withTmp(async () => {
    const url = pathToFileURL(join(fixtures, 'health-broken.html')).href;
    const { findings } = await inspect([url], { settle: 200, widths: [390], schemes: ['light'], overlays: false });
    const lines = findings.filter(f => f.code === 'request').map(line);
    assert.ok(lines.includes('error request: health-missing.css failed (net::ERR_FILE_NOT_FOUND) (stylesheet), so its styles are missing'), lines.join('\n'));
    // the audit fetches stylesheet sources itself (the stylesheet checks): that request is not the page's, so the missing
    // stylesheet is reported once
    assert.equal(lines.filter(l => l.includes('health-missing.css')).length, 1, lines.join('\n'));
    assert.ok(lines.includes('error request: health-missing.woff2 failed (net::ERR_FILE_NOT_FOUND) (font), so text set in it falls back to another font'), lines.join('\n'));
    assert.ok(lines.some(l => /^warning request: api\/missing was blocked by CORS \(CorsDisabledScheme\): fetch does not work in file:\/\/ pages/.test(l)), lines.join('\n'));
    assert.ok(!lines.some(l => /png/.test(l)), 'the broken image is reported by its element');
    assert.ok(findings.some(f => f.code === 'image'));
  });
});

// The dev client (temper's Vite plugin) runs the audit without the DevTools side and may not call prepare().
test('the document checks work in the page alone, also without prepare()', { skip }, async () => {
  const { srv, base } = await serve();
  try {
    await withTmp(async () => {
      const b = await launch(browser, { share: [], timeout: 30000 });
      try {
        const page = await b.newPage();
        await page.goto(`${base}health-broken.html`, { width: 1280, height: 900, scheme: 'light', settle: 200 });
        await page.evaluate(`(${install.toString()})(${JSON.stringify({ overlays: false, overlayWait: 0 })})`);
        const codes = new Set((await page.evaluate(`window.__tsi.check('page')`)).map(f => f.code));
        for (const c of ['doctype', 'viewport', 'image', 'id', 'ref', 'submit', 'shift', 'font']) assert.ok(codes.has(c), c);
        assert.ok(!codes.has('request') && !codes.has('console'), 'runtime findings come only from the DevTools side');
      } finally { await b.close(); }
    });
  } finally { srv.close(); }
});

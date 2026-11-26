// The stylesheet checks: declarations the browser drops (css) and custom properties without a value (var).
// The scanner is tested on its own, without a browser; the checks against their fixtures, served over HTTP (so the
// page can fetch its stylesheets) and as file:// (where the CLI reads them over the DevTools protocol).
// The browser tests are skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspect, format } from '../lib/inspect.js';
import { findBrowser, launch } from '../lib/cdp.js';
import { install } from '../lib/audit.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function serve() {
  const srv = createServer(async (req, res) => {
    try {
      const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
      res.setHeader('content-type', extname(req.url) === '.css' ? 'text/css' : 'text/html');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/packages/inspect/test/fixtures/` };
}

// parseCSS lives inside install() (which runs in the page); it uses nothing around it, so it can be taken out and run here
const source = install.toString();
const start = source.indexOf('  function parseCSS(text) {');
const parseCSS = new Function(`${source.slice(start, source.indexOf('\n  }\n', start) + 4)}; return parseCSS;`)();
const decls = items => items.flatMap(i => i.t === 'decl' ? [`${i.line} ${i.prop}: ${i.value}`] : i.body ? decls(i.body) : []);

test('the CSS scanner: comments, strings, url(), nesting, at-rules, !important, lines', () => {
  const tree = parseCSS(`/* a comment with } and { and ; */
.a { content: "} {;"; background: url(data:image/svg+xml;utf8,x) no-repeat; color: red !important }
.b { --json: { "a": [1, 2]; }; --empty: ; margin: 0 /* inline } comment */ 1px }
.c {
  color: blue;
  &:hover { color: green }
  @media (width > 1px) { color: pink; .d { x: 1 } }
  > .e { y: 2 }
}
@import url("x.css") layer(base);
@media screen { .f { z: 3 } }
@font-face { font-family: X; src: url('a(b).woff2') }
.g { quote: 'it\\'s }'; paren: calc((1px + 2px) * 3) }
@layer a, b;
.h{a:1;b:2}.i{c:3}`);
  assert.deepEqual(decls(tree), [
    '2 content: "} {;"', '2 background: url(data:image/svg+xml;utf8,x) no-repeat', '2 color: red !important',
    '3 --json: { "a": [1, 2]; }', '3 --empty: ', '3 margin: 0   1px',
    '5 color: blue', '6 color: green', '7 color: pink', '7 x: 1', '8 y: 2',
    '11 z: 3', '12 font-family: X', "12 src: url('a(b).woff2')",
    "13 quote: 'it\\'s }'", '13 paren: calc((1px + 2px) * 3)',
    '15 a: 1', '15 b: 2', '15 c: 3',
  ]);
  const c = tree.find(i => i.sel === '.c');
  assert.deepEqual(c.body.map(i => i.t === 'rule' ? `rule ${i.sel}` : i.t === 'at' ? `@${i.name} ${i.pre}` : `decl ${i.prop}`),
    ['decl color', 'rule &:hover', '@media (width > 1px)', 'rule > .e']);
  assert.deepEqual(tree.filter(i => i.t === 'at').map(i => `@${i.name} ${i.pre} ${i.body ? 'block' : 'statement'}`),
    ['@import url("x.css") layer(base) statement', '@media screen block', '@font-face  block', '@layer a, b statement']);
  // a missing ';' runs into the next declaration, as it does in the browser; an unclosed block ends at the end
  assert.deepEqual(decls(parseCSS('.x { color: red\n  background: blue; }\n.y { a: 1')), ['1 color: red\n  background: blue', '3 a: 1']);
});

test('dropped declarations and undefined custom properties: each kind reported once, with its file and line', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  const { srv, base } = await serve();
  const tmp = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prevTmp = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    const opts = { widths: [1280], schemes: ['light'], settle: 100, overlays: false };
    const urls = [`${base}styles-broken.html`, pathToFileURL(join(fixtures, 'styles-broken.html')).href, `${base}styles-clean.html`, pathToFileURL(join(fixtures, 'styles-clean.html')).href];
    const { findings } = await inspect(urls, opts);
    const of = url => findings.filter(f => f.url === url && (f.code === 'css' || f.code === 'var'));
    const lines = url => of(url).map(f => `${f.severity} ${f.code} ${f.selector} | ${f.message}`);
    const expected = [
      'error css .card { align-item: center } | is not valid CSS, so the browser ignores it: unknown property, did you mean `align-items`? (styles-broken.css:5)',
      'error css .box { display: flexbox } | is not valid CSS, so the browser ignores it: `flexbox` is not a value of display, did you mean `flex`? (styles-broken.css:6)',
      'error css .m { margin: 10 } | is not valid CSS, so the browser ignores it: a number needs a unit here: `margin: 10px` would be valid (styles-broken.css:7)',
      'error css .fade { transition: opacity 200 } | is not valid CSS, so the browser ignores it: a number needs a unit here: `transition: opacity 200ms` would be valid (styles-broken.css:8)',
      'warning css .smooth { font-smoothing: antialiased } | is not valid CSS, so the browser ignores it: Chrome knows no such property (a typo, or a property other browsers have and Chrome does not) (styles-broken.css:9)',
      'error css .bang { color: red !importnat } | is not valid CSS, so the browser ignores it: `!importnat` is not `!important` (styles-broken.css:10)',
      'error css .semi { color: red background: blue } | is not valid CSS, so the browser ignores it: a `;` is missing after `red`, so `background: blue` is swallowed into this value (styles-broken.css:11)',
      'error css .quoted { width: "100px" } | is not valid CSS, so the browser ignores it: the value is quoted: `width: 100px` would be valid (styles-broken.css:13)',
      'error css .comma { padding: 4px, 8px } | is not valid CSS, so the browser ignores it: values are separated by spaces here, not commas: `padding: 4px 8px` would be valid (styles-broken.css:14)',
      'error css .just { justify-content: centre } | is not valid CSS, so the browser ignores it: `centre` is not a value of justify-content, did you mean `center`? (styles-broken.css:15)',
      'error css .camel { alignItems: center } | is not valid CSS, so the browser ignores it: unknown property, did you mean `align-items`? (styles-broken.css:16)',
      'error css .ink { text-color: red } | is not valid CSS, so the browser ignores it: unknown property, did you mean `color`? (styles-broken.css:17)',
      'error css .nav:hover { colr: red } | is not valid CSS, so the browser ignores it: unknown property, did you mean `color`? (styles-broken.css:20)',
      'error css .icon { background: url(data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2… } | is not valid CSS, so the browser ignores it: a url() without quotes cannot hold quotes, spaces or parentheses: put the URL in double quotes, url("…") (styles-broken.css:27)',
      'error css .imported { paddin: 1rem } | is not valid CSS, so the browser ignores it: unknown property, did you mean `padding`? (styles-broken-imported.css:2)',
      'error css .page { gap: 1rm } | is not valid CSS, so the browser ignores it: `rm` is not a unit, did you mean `1rem`? (styles-broken.html:5)',
      'error css .dev { colour: red } | is not valid CSS, so the browser ignores it: unknown property, did you mean `color`? (/app/src/Card.css:2)',
      'error css p "Inline" | has inline style the browser ignores, it is not valid CSS: `align-item: center` (unknown property, did you mean `align-items`?); `margin: 10` (a number needs a unit here: `margin: 10px` would be valid)',
      'warning var :root { --a: var(--tm-nope) } | --tm-nope is not defined anywhere, so --a has no value either (styles-broken.css:4)',
      'warning var .token { color: var(--tm-color-primary) } | --tm-color-primary is not defined anywhere, so color falls back to its inherited or initial value (not to an earlier color declaration); did you mean --tm-primary? (styles-broken.css:22)',
      'warning var .chain { color: var(--undefined-a, var(--undefined-b)) } | --undefined-a and --undefined-b are not defined anywhere, so color falls back to its inherited or initial value (not to an earlier color declaration) (styles-broken.css:23)',
      'info var .ghost { color: var(--ghost-undefined) } | --ghost-undefined is not defined anywhere, so color falls back to its inherited or initial value (not to an earlier color declaration) (no element on this page matches the rule) (styles-broken.css:24)',
      'info var .main { width: var(--side-w) } | --side-w has no value on the element this rule matches (it is set on other elements), so width falls back to its inherited or initial value (not to an earlier width declaration) (styles-broken.css:26)',
      'warning var p "Inline token" | has inline style `color: var(--tm-acent)`: --tm-acent is not defined anywhere, so color falls back to its inherited or initial value (not to an earlier color declaration); did you mean --tm-accent?',
    ];
    const sorted = list => [...list].sort();
    assert.deepEqual(sorted(lines(urls[0])), sorted(expected));
    // file:// pages cannot fetch their sheets; the CLI reads them over the protocol, so the findings are the same
    assert.deepEqual(sorted(lines(urls[1])), sorted(expected));
    // the look-alikes: vendor prefixes, hacks, fallback pairs, @supports, descriptors, var() at parse time, space
    // toggles, names set from script or registered, states, conditions that do not apply, third-party and constructed sheets
    assert.deepEqual(lines(urls[2]), []);
    assert.deepEqual(lines(urls[3]), []);
    // the rule's identity is in the selector, so two findings in one rule stay two after merging; the report prints both
    const text = format(findings.filter(f => f.url === urls[0]), { allWhere: ['1280 light'], limit: 50 });
    assert.match(text, /\n    error css: \.card \{ align-item: center \} is not valid CSS, so the browser ignores it: unknown property, did you mean `align-items`\? \(styles-broken\.css:5\)\n/);
  } finally {
    if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp;
    rmSync(tmp, { recursive: true, force: true });
    srv.close();
  }
});

test('without prepare() (an older dev client) the stylesheet checks are skipped, not wrong', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  const { srv, base } = await serve();
  const tmp = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prevTmp = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  const b = await launch(browser, { share: [], timeout: 30000 });
  try {
    const page = await b.newPage();
    await page.goto(`${base}styles-broken.html`, { width: 1280, height: 900, scheme: 'light', settle: 100 });
    await page.evaluate(`(${install.toString()})(${JSON.stringify({ overlays: false, overlayWait: 0 })})`);
    const codes = async () => (await page.evaluate(`window.__tsi.check('page')`)).map(f => f.code).filter(c => c === 'css' || c === 'var');
    assert.deepEqual(await codes(), []);
    await page.evaluate('window.__tsi.prepare()');
    assert.equal((await codes()).length, 24);
    // a second install on the same page (the dev client reinstalls after each update) finds the same
    await page.evaluate(`(${install.toString()})(${JSON.stringify({ overlays: false, overlayWait: 0 })}); window.__tsi.prepare()`);
    assert.equal((await codes()).length, 24);
  } finally {
    await b.close();
    if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp;
    rmSync(tmp, { recursive: true, force: true });
    srv.close();
  }
});

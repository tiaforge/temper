// The default look's details (fixtures/look.html in a real browser, skipped without Chrome/Chromium) and the build
// output: pseudo-element rules that match, the md size, straight tone bars, scrollbars, sticky table headers, font
// weights, avatar initials in the middle, and properties the build targets must keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from 'lightningcss';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const root = fileURLToPath(new URL('..', import.meta.url));
const skip = !browser && 'no Chrome/Chromium found';

// the build's own targets (scripts/build.mjs runs the build when imported, so they are read from its source)
const buildSrc = readFileSync(join(root, 'scripts/build.mjs'), 'utf8');
const targets = new Function(`${buildSrc.match(/^const v = .*$/m)[0]}\n${buildSrc.match(/^const targets = .*$/m)[0]}\nreturn targets;`)();
const built = file => bundle({ filename: join(root, 'src', file), minify: true, targets }).code.toString();
const sources = readdirSync(join(root, 'src')).filter(f => f.endsWith('.css'));

test('the build emits no empty :where() (a pseudo-element inside :where() is dropped and the rule matches nothing)', () => {
  for (const file of sources) assert.ok(!built(file).includes(':where()'), `${file} has an empty :where()`);
});

test('iOS Safari gets -webkit-text-size-adjust (the build targets must include it)', () => {
  assert.match(built('core.css'), /-webkit-text-size-adjust:none/);
});

test('font weights are only 400, 600 and 700 (static system fonts have no in-between weights)', () => {
  for (const file of sources) {
    for (const [, w] of readFileSync(join(root, 'src', file), 'utf8').matchAll(/font-weight:\s*([^;}]+)/g)) {
      assert.ok(/^(400|600|700|var\(--tm-(heading|display)-weight\))$/.test(w.trim()), `${file}: font-weight ${w}`); // --tm-display-weight: 600 or 700 by pairing
    }
  }
});

test('placeholder, selection, md size, tone bars, scrollbars and sticky headers', { skip }, async () => {
  const srv = createServer(async (req, res) => {
    try {
      const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
      res.setHeader('content-type', extname(req.url) === '.css' ? 'text/css' : 'text/html');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await launch(browser);
  try {
    const page = await b.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/look.html`, { width: 800, height: 700, scheme: 'light', settle: 100 });
    const r = await page.evaluate(`(() => {
      const $ = id => document.getElementById(id), cs = (id, p) => getComputedStyle($(id), p);
      // a token resolved in the context of an element
      const token = (id, name) => { const s = $(id).appendChild(document.createElement('span')); s.style.color = 'var(' + name + ')'; const c = getComputedStyle(s).color; s.remove(); return c; };
      return {
        placeholder: cs('field', '::placeholder').color, muted: token('main', '--tm-text-muted'),
        selection: cs('text', '::selection').backgroundColor,
        sm: cs('sm').fontSize, md: cs('md').fontSize, control: cs('main').getPropertyValue('--tm-control-font').trim(),
        bar: ['bar', 'toast'].map(id => [cs(id).borderStartStartRadius, cs(id).borderEndStartRadius, cs(id).borderInlineStartWidth]),
        scrollbar: ['area'].map(id => cs(id).scrollbarWidth + ' ' + cs(id).scrollbarColor),
        thPage: cs('th-page').backgroundColor, page: token('main', '--tm-bg'),
        thCard: cs('th-card').backgroundColor, card: token('main', '--tm-surface'),
      };
    })()`);
    // ::placeholder and ::selection used to be in :where(), where they matched nothing
    assert.equal(r.placeholder, r.muted);
    assert.notEqual(r.selection, 'rgba(0, 0, 0, 0)');
    // data-tm-size="md" inside a sm container: md height and the control font, not the small one
    assert.equal(r.sm, '13px');
    assert.equal(r.md, '15px', `md button font ${r.md}, control font ${r.control}`);
    // tone bars are straight: square start corners on an item button and a toast
    assert.deepEqual(r.bar, [['0px', '0px', '3px'], ['0px', '0px', '3px']]);
    assert.match(r.scrollbar[0], /^thin /);
    // the sticky header has the color of what it sits on: the page, or the card
    assert.equal(r.thPage, r.page);
    assert.equal(r.thCard, r.card);
    assert.notEqual(r.page, r.card, 'light mode: the page is off-white, the card white');
  } finally {
    await b.close();
    srv.close();
  }
});

test('avatar initials: the capitals sit in the middle of the circle, in any font; inline, the initials keep the text baseline', { skip }, async () => {
  const srv = createServer(async (req, res) => {
    try {
      const body = await readFile(join(root, decodeURIComponent(req.url.split('?')[0])));
      res.setHeader('content-type', extname(req.url) === '.css' ? 'text/css' : 'text/html');
      res.end(body);
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await launch(browser);
  try {
    const page = await b.newPage();
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/look.html`, { width: 800, height: 700, scheme: 'light', settle: 100 });
    const r = await page.evaluate(`(() => {
      if (!CSS.supports('text-box: trim-both cap alphabetic')) return null;
      const ctx = document.createElement('canvas').getContext('2d');
      return ['av-1', 'av-2', 'av-3'].map(id => {
        const av = document.getElementById(id), s = getComputedStyle(av);
        // a zero-size inline-block sits on the baseline; the cap height is the font's, measured on an H
        const mark = av.appendChild(document.createElement('span'));
        mark.style.cssText = 'display: inline-block; inline-size: 0; block-size: 0';
        const baseline = mark.getBoundingClientRect().bottom;
        mark.remove();
        ctx.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
        const cap = ctx.measureText('H').actualBoundingBoxAscent, box = av.getBoundingClientRect();
        // the paragraph's text baseline next to the avatar
        const p = av.parentElement.appendChild(document.createElement('span'));
        p.style.cssText = 'display: inline-block; inline-size: 0; block-size: 0';
        const text = p.getBoundingClientRect().bottom;
        p.remove();
        return { id, off: baseline - cap / 2 - (box.top + box.height / 2), baseline, text };
      });
    })()`);
    if (!r) return; // no text-box: the line box is centred, as before
    for (const a of r) {
      assert.ok(Math.abs(a.off) <= 0.5, `${a.id}: the capitals' middle is ${a.off.toFixed(2)}px from the circle's`);
      assert.ok(Math.abs(a.baseline - a.text) <= 0.5, `${a.id}: initials on ${a.baseline}, the text's baseline ${a.text}`);
    }
  } finally {
    await b.close();
    srv.close();
  }
});

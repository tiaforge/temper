// prose.css (data-prose) in a real browser (fixtures/prose.html, served over HTTP from the repository root), and
// what the checker says about the attribute. The browser tests are skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';
import { checkMarkup } from '../lib/check.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const root = fileURLToPath(new URL('..', import.meta.url));

async function measure(width, scheme = 'light') {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/prose.html`, { width, height: 700, scheme, settle: 100 });
    return await page.evaluate(`(() => {
      const el = id => document.getElementById(id), box = id => el(id).getBoundingClientRect();
      const gap = (a, b) => Math.round(box(b).top - box(a).bottom);
      const mt = id => getComputedStyle(el(id)).marginBlockStart;
      return {
        firstTop: Math.round(box('h-first').top - box('flat').top),
        lastBottom: Math.round(box('flat').bottom - box('last').bottom),
        pp: gap('p1', 'p2'), pToH: gap('p2', 'h2'), hToP: gap('h2', 'p3'), liLi: gap('li1', 'li2'),
        hrAfter: gap('hr', 'after-hr'),
        inside: ['callout-title', 'callout-p1', 'callout-p2', 'b1', 'b2', 'card-h', 'card-p', 'form-l', 'form-p'].map(mt),
        rowGap: Math.round(box('b2').left - box('b1').right), cardGap: gap('card-h', 'card-p'),
        callout: mt('callout'), row: mt('row'), card: mt('card'),
        deepTop: Math.round(box('deep-first').top - box('nested-prose').top),
        sections: gap('deep-p', 'deep-second'), cellFirst: mt('cell-first'), cellSecond: mt('cell-second'),
        proseGap: gap('flat', 'nested-prose'),
        measure: box('flat').width, display: getComputedStyle(el('flat')).display,
      };
    })()`);
  } finally {
    await b.close();
    srv.close();
  }
}

test('data-prose: rhythm between blocks, none at the edges, components untouched', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  for (const [width, scheme] of [[1280, 'light'], [390, 'dark']]) {
    const r = await measure(width, scheme);
    // nothing before the first block or after the last: the parent's data-gap is all the space around the prose
    assert.equal(r.firstTop, 0);
    assert.equal(r.lastBottom, 0);
    assert.equal(r.proseGap, 16, 'margins leak out of the prose into the stack gap');
    // 1em between paragraphs; more above a heading than below it; tight list items; 2em around a rule
    assert.equal(r.pp, 16);
    assert.ok(r.pToH > r.hToP && r.hToP === 8, `heading: ${r.pToH}px above, ${r.hToP}px below`);
    assert.equal(r.liLi, 4);
    assert.equal(r.hrAfter, 32);
    // temper components keep their own spacing: no margins inside, their gaps unchanged; they still get space above
    assert.deepEqual(r.inside, Array(9).fill('0px'));
    assert.equal(r.rowGap, 8);
    assert.equal(r.cardGap, 4);
    assert.ok(parseFloat(r.callout) > 0 && parseFloat(r.row) > 0 && parseFloat(r.card) > 0);
    // nested wrappers (CMS and mail HTML): the first block at any depth has no space above; sections are apart
    assert.equal(r.deepTop, 0);
    assert.ok(r.sections > 16, `sections ${r.sections}px apart`);
    assert.equal(r.cellFirst, '0px');
    assert.notEqual(r.cellSecond, '0px');
    // reading measure, and its own flow even inside a flex stack
    assert.ok(r.measure < 700 && r.measure > 300 || width < 700, `measure ${r.measure}px`);
    assert.equal(r.display, 'flow-root');
  }
});

test('checker: data-prose is valid, needs prose.css, not on table cells', () => {
  const codes = r => r.map(d => d.code);
  assert.deepEqual(codes(checkMarkup('<div data-prose><p>x</p></div>', 'a.html', { modules: new Set(['core', 'prose']) })), []);
  const [d] = checkMarkup('<div data-prose><p>x</p></div>', 'a.html', { modules: new Set(['core']) });
  assert.equal(d.code, 'TM110');
  assert.match(d.message, /data-prose needs prose\.css/);
  assert.deepEqual(codes(checkMarkup('<div data-prose="yes"></div>', 'a.html', { modules: null })), ['TM102']);
  assert.deepEqual(codes(checkMarkup('<table><tr><th>a</th><td data-prose>x</td></tr></table>', 'a.html', { modules: null })), ['TM108']);
});

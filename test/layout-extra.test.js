// Layout pieces for applications, in a real browser (fixtures/layout-extra.html, served over HTTP from the repository
// root): data-container (data-show follows the nearest pane), data-sticky, data-join and card media; their restyle cost;
// and the checker's vocabulary for them. The browser tests are skipped without Chrome/Chromium.
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
const skip = !browser && 'no Chrome/Chromium found';
const root = fileURLToPath(new URL('..', import.meta.url));

/** Opens fixtures/layout-extra.html at `width`; `dir`: the page direction, `media`: emulated media features. */
async function withPage({ width = 1280, dir, scheme = 'light', media = {} } = {}, fn) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/layout-extra.html`, { width, height: 800, scheme, settle: 100 });
    await page.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' },
      ...Object.entries(media).map(([name, value]) => ({ name, value })),
    ] });
    await page.evaluate(`(() => {
      ${dir ? `document.documentElement.dir = '${dir}';` : ''}
      window.$ = id => document.getElementById(id);
      window.cs = id => getComputedStyle($(id));
      window.box = id => { const r = $(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      window.shown = id => cs(id).display !== 'none';
    })()`);
    await new Promise(r => setTimeout(r, 50));
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}

/** Runs `expression` (which must force a style update) under a trace; returns the number of elements restyled. */
async function restyled(page, expression) {
  const events = [];
  const offData = page.on('Tracing.dataCollected', p => events.push(...p.value));
  let offDone;
  const complete = new Promise(r => { offDone = page.on('Tracing.tracingComplete', r); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline'] }, transferMode: 'ReportEvents' });
  try { await page.evaluate(expression); } finally { await page.send('Tracing.end'); await complete; offData(); offDone(); }
  return events.filter(e => e.name === 'UpdateLayoutTree' && e.args?.elementCount != null).reduce((n, e) => n + e.args.elementCount, 0);
}

const SHOW = ['vp-narrow', 'vp-wide', 'cn-narrow', 'cn-wide', 'cw-narrow', 'cw-wide', 'nest-narrow', 'nest-wide', 'self', 'own-narrow', 'own-wide'];

test('data-show follows the nearest data-container, and the screen outside one (also inside an app\'s own container)', { skip }, async () => {
  const state = page => page.evaluate(`Object.fromEntries(${JSON.stringify(SHOW)}.map(id => [id, shown(id)]))`);
  // wide screen: the 20rem panes are narrow, the 60rem pane wide; the container's own data-show follows the screen
  assert.deepEqual(await withPage({ width: 1280 }, state), {
    'vp-narrow': false, 'vp-wide': true, 'cn-narrow': true, 'cn-wide': false, 'cw-narrow': false, 'cw-wide': true,
    'nest-narrow': true, 'nest-wide': false, self: false, 'own-narrow': false, 'own-wide': true,
  });
  // narrow screen: the 60rem pane is still wide
  assert.deepEqual(await withPage({ width: 390 }, state), {
    'vp-narrow': true, 'vp-wide': false, 'cn-narrow': true, 'cn-wide': false, 'cw-narrow': false, 'cw-wide': true,
    'nest-narrow': true, 'nest-wide': false, self: true, 'own-narrow': true, 'own-wide': false,
  });
});

test('data-container keeps fixed and absolute children placed against the viewport and their usual ancestor', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      const f = Object.assign(document.createElement('div'), { style: 'position: fixed; inset: 0 auto auto 0; inline-size: 1px; block-size: 1px' });
      $('c-narrow').append(f);
      const x = f.getBoundingClientRect(); f.remove();
      return [x.x, x.y, cs('c-narrow').containerName, cs('c-narrow').containerType];
    })()`);
    assert.deepEqual(r, [0, 0, 'tm', 'inline-size']);
  });
});

test('data-sticky: bars stay at the pane edges, opaque, above the sticky table header; static in print', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      $('pane').scrollTop = 200;
      const pane = box('pane'), top = box('bar-top'), bottom = box('bar-bottom'), th = box('th');
      const hit = document.elementFromPoint(th.x + 4, th.y + th.h / 2);
      return { top: top.y - pane.y, bottom: pane.b - bottom.b, thUnder: th.y < top.b, hit: hit.closest('[data-sticky]')?.id,
        bg: cs('bar-top').backgroundColor, page: getComputedStyle(document.documentElement).backgroundColor,
        z: cs('bar-top').zIndex, lineTop: cs('bar-top').borderBottomWidth, lineBottom: cs('bar-bottom').borderTopWidth,
        safe: cs('bar-bottom').borderBottomWidth };
    })()`);
    assert.equal(r.top, 0, 'the top bar sits at the top edge of the scrolled pane');
    assert.ok(Math.abs(r.bottom) < 1, `the bottom bar sits at the bottom edge (${r.bottom})`);
    assert.ok(r.thUnder, 'the table header sticks at the same edge');
    assert.equal(r.hit, 'bar-top', 'the bar covers the table header, not the other way round');
    assert.equal(r.bg, r.page, 'opaque, in the page background');
    assert.deepEqual([r.z, r.lineTop, r.lineBottom, r.safe], ['2', '1px', '1px', '0px']);
  });
  await withPage({ media: { 'forced-colors': 'active' } }, async page => {
    const r = await page.evaluate(`[cs('bar-top').backgroundColor, cs('bar-top').borderBottomStyle]`);
    assert.doesNotMatch(r[0], /rgba\(0, 0, 0, 0\)|transparent/, 'still opaque in forced colors');
    assert.equal(r[1], 'solid');
  });
  await withPage({}, async page => {
    await page.send('Emulation.setEmulatedMedia', { media: 'print' });
    assert.equal(await page.evaluate(`cs('bar-top').position`), 'static');
  });
});

const radii = id => `(() => { const s = cs('${id}'); return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].join(' '); })()`;

for (const dir of ['ltr', 'rtl']) {
  test(`data-join (${dir}): one unit with shared borders, rounded only at the outer ends`, { skip }, async () => {
    await withPage({ dir }, async page => {
      const r = await page.evaluate(`({ o1: ${radii('o1')}, o2: ${radii('o2')}, o3: ${radii('o3')}, field: ${radii('c-field')}, button: ${radii('c-button')},
        boxes: ['o1', 'o2', 'o3'].map(box), r: cs('o1').borderTopLeftRadius === '0px' ? 0 : 1 })`);
      const R = '8px';
      const [start, end] = dir === 'ltr' ? [`${R} 0px 0px ${R}`, `0px ${R} ${R} 0px`] : [`0px ${R} ${R} 0px`, `${R} 0px 0px ${R}`];
      assert.deepEqual([r.o1, r.o2, r.o3], [start, '0px 0px 0px 0px', end]);
      assert.deepEqual([r.field, r.button], [start, end], 'a data-field (forms.css) joins too');
      const [a, b, c] = r.boxes;
      if (dir === 'ltr') assert.deepEqual([b.x - a.r, c.x - b.r], [-1, -1], 'neighbors share their 1px border');
      else assert.deepEqual([a.x - b.r, b.x - c.r], [-1, -1], 'neighbors share their 1px border, mirrored');
    });
  });
}

test('data-join: same height for every child at each data-size and in compact density; data-grow; separators', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`({
      sm: [box('sm-input').h, box('sm-button').h], lg: [box('lg-select').h, box('lg-button').h], compact: [box('c-field').h, box('c-button').h],
      plain: box('o1').h, grow: [box('j-grow').w > 900, box('g-input').w > box('g-button').w * 4],
      solidLine: cs('s2').borderLeftColor, solidEdge: cs('s1').borderLeftColor,
      secondaryLine: cs('v2').borderLeftColor, outline: [cs('o2').borderLeftColor, cs('o2').borderRightColor],
    })`);
    assert.deepEqual(r.sm, [32, 32]);
    assert.deepEqual(r.lg, [48, 48]);
    assert.deepEqual(r.compact, [32, 32]);
    assert.equal(r.plain, 40);
    assert.deepEqual(r.grow, [true, true], 'data-grow on the group and on its field');
    assert.notEqual(r.solidLine, r.solidEdge, 'a visible line between two solid buttons');
    assert.doesNotMatch(r.secondaryLine, /rgba\(0, 0, 0, 0\)/, 'and between two secondary ones');
    assert.equal(r.outline[0], r.outline[1], 'outline buttons keep one border color on the shared edge');
  });
});

test('data-join: a focused child comes to the front, so its ring is not covered by the next one', { skip }, async () => {
  await withPage({}, async page => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); // keyboard modality
    const r = await page.evaluate(`(() => {
      $('o2').focus();
      const b = box('o2'), hit = document.elementFromPoint(b.r - 0.5, b.y + b.h / 2);
      return { z: cs('o2').zIndex, zNext: cs('o3').zIndex, hit: hit.id, ring: cs('o2').outlineStyle };
    })()`);
    assert.deepEqual(r, { z: '1', zNext: 'auto', hit: 'o2', ring: 'solid' });
  });
});

test('card media: a first-child img, picture or video runs edge to edge under the rounded top corners', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      const edge = (card, media) => { const c = box(card), m = box(media); return [m.x - c.x, m.y - c.y, c.r - m.r]; };
      return {
        img: edge('card', 'card-img'), pad: edge('card-pad', 'pad-img'), pic: edge('card-picture', 'pic'), picImg: edge('card-picture', 'pic-img'),
        radius: ${radii('card-img')}, picRadius: ${radii('pic-img')}, cardRadius: cs('card').borderTopLeftRadius,
        text: box('card-text').x - box('card').x, ratio: box('card-img').w / box('card-img').h,
        second: box('second-img').x - box('card-second').x,
        stretch: (() => { $('stretch-img').scrollIntoView({ block: 'center' }); const m = box('stretch-img'); return document.elementFromPoint(m.x + m.w / 2, m.y + m.h / 2).id; })(),
      };
    })()`);
    assert.deepEqual(r.img, [1, 1, 1], 'inside the 1px border, from edge to edge');
    assert.deepEqual(r.pad, [1, 1, 1], 'also with data-pad on the card');
    assert.deepEqual([r.pic, r.picImg], [[1, 1, 1], [1, 1, 1]]);
    assert.equal(r.cardRadius, '12px');
    assert.deepEqual([r.radius, r.picRadius], ['11px 11px 0px 0px', '11px 11px 0px 0px']);
    assert.equal(r.text, 25, 'the content after it keeps the card padding');
    assert.ok(Math.abs(r.ratio - 16 / 9) < 0.02, `keeps its aspect ratio (${r.ratio})`);
    assert.equal(r.second, 25, 'an image that is not the first child stays inside the padding');
    assert.equal(r.stretch, 'stretch', 'a clickable card is clickable on its image too');
  });
});

test('adding or removing one child of a joined group, a container or a card restyles only a few elements', { skip }, async () => {
  await withPage({}, async page => {
    const ops = {
      append: id => `(() => { const c = $('${id}'); c.append(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`,
      prepend: id => `(() => { const c = $('${id}'); c.prepend(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`,
      remove: id => `(() => { $('${id}').firstElementChild.remove(); return document.body.offsetHeight; })()`,
    };
    const counts = {};
    for (const id of ['perf-join', 'perf-container', 'perf-card']) for (const op of Object.keys(ops)) counts[`${op} ${id}`] = await restyled(page, ops[op](id));
    assert.ok(counts['append perf-join'] >= 1, `no UpdateLayoutTree events traced: ${JSON.stringify(counts)}`);
    assert.deepEqual(Object.entries(counts).filter(([, n]) => n > 20), [], `restyled elements per change: ${JSON.stringify(counts)}`);
  });
});

test('checker: accepts the new vocabulary, rejects misuse', () => {
  const codes = (m, o) => checkMarkup(m, 'a.html', o).map(d => d.code);
  const all = { modules: new Set(['core', 'app', 'forms']) };
  assert.deepEqual(codes('<header data-sticky="top"></header><footer data-sticky="bottom"></footer>', all), []);
  assert.deepEqual(codes('<div data-join role="group" aria-label="View"><button>Day</button><button data-variant="secondary">Week</button></div>', all), []);
  assert.deepEqual(codes('<div data-layout="row"><form data-join data-grow><input data-grow aria-label="q"><button>Go</button></form></div>', all), []);
  assert.deepEqual(codes('<section data-container><button data-show="narrow" data-icon="x" aria-label="Close"></button></section>', all), []);
  assert.deepEqual(codes('<div data-sticky="up"></div>', all), ['TM101']);
  assert.match(checkMarkup('<div data-sticky="up"></div>', 'a.html', all)[0].message, /top, bottom/);
  assert.deepEqual(codes('<div data-sticky></div>', all), ['TM101']);
  assert.deepEqual(codes('<div data-join="true"><button>A</button></div>', all), ['TM102']);
  assert.deepEqual(codes('<section data-container="pane"></section>', all), ['TM102']);
  assert.deepEqual(codes('<section data-container></section>', { modules: new Set(['core']) }), ['TM110']);
  assert.deepEqual(codes('<div data-join><button>A</button></div>', { modules: new Set(['core']) }), [], 'data-join and data-sticky are core');
});

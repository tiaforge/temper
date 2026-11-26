// expressive.css: the contrast it promises at every brand, what the preferences turn off, its layouts, and the
// checker's rules for its attributes. The colours are resolved and painted by headless Chrome (a canvas pixel per
// colour, so out-of-gamut colours count as drawn); skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';
import { checkMarkup } from '../lib/check.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const skip = !browser && 'no Chrome/Chromium found';
const root = fileURLToPath(new URL('..', import.meta.url));

async function withPage(fn, { width = 1000 } = {}) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/expressive.html`, { width, height: 800, scheme: 'light', settle: 50 });
    const media = features => page.send('Emulation.setEmulatedMedia', { features });
    return await fn(page, media);
  } finally {
    await b.close();
    srv.close();
  }
}

// What text sits on: the page and temper's surface, the module's tints (gradient and mesh are made of them and the
// page background) and glass over each. The text: temper's text, muted text and accent, the gradient ink's two ends.
const SURFACES = [['--tm-bg'], ['--tm-surface'], ['--tm-tint-1'], ['--tm-tint-2'], ['--tm-tint-3'],
  ['--tm-bg', '--tm-glass'], ['--tm-tint-1', '--tm-glass'], ['--tm-tint-2', '--tm-glass'], ['--tm-tint-3', '--tm-glass']];
const PAIRS = ['--tm-text', '--tm-text-muted', '--tm-accent', '--tm-ink-1', '--tm-ink-2'].flatMap(t => SURFACES.map(s => [t, s]));
const HUES = Array.from({ length: 24 }, (_, i) => i * 15);
const CHROMAS = [0.04, 0.12, 0.19, 0.22];

/** In the page: contrast of each pair, and of each seed's ink on both ends of its gradient. */
const MEASURE = `(pairs => {
  const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const probe = document.body.appendChild(document.createElement('i'));
  const resolve = (token, el = probe) => { el.style.color = 'var(' + token + ')'; return getComputedStyle(el).color; };
  const paint = colors => {
    g.globalCompositeOperation = 'copy'; g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1);
    g.globalCompositeOperation = 'source-over';
    for (const c of colors) { g.fillStyle = c; g.fillRect(0, 0, 1, 1); }
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const lum = c => c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const out = [];
  for (const [text, backs] of pairs) {
    const under = backs.map(t => resolve(t));
    out.push([text + ' on ' + backs.join(' + '), ratio(paint([...under, resolve(text)]), paint(under))]);
  }
  for (let s = 0; s < 12; s++) {
    const el = document.body.appendChild(document.createElement('span'));
    el.setAttribute('data-tm-seed', String(s));
    const ink = paint([resolve('--_ex-seed-ink', el)]);
    for (const stop of ['--_ex-seed-a', '--_ex-seed-b']) out.push(['seed ' + s + ' ink on ' + stop, ratio(ink, paint([resolve(stop, el)]))]);
    el.remove();
  }
  probe.remove();
  return out;
})`;

for (const scheme of ['light', 'dark']) {
  test(`expressive: text keeps WCAG AA on every surface at every hue and chroma 0.04–0.22, ${scheme}`, { skip }, async () => {
    await withPage(async (page, media) => {
      await media([{ name: 'prefers-color-scheme', value: scheme }]);
      const failures = [];
      let measured = 0;
      for (const hue of HUES) for (const chroma of CHROMAS) {
        const results = await page.evaluate(`(() => {
          document.documentElement.style.setProperty('--tm-hue', '${hue}');
          document.documentElement.style.setProperty('--tm-chroma', '${chroma}');
          return ${MEASURE}(${JSON.stringify(PAIRS)});
        })()`);
        measured += results.length;
        for (const [pair, r] of results) if (r < 4.5) failures.push(`hue ${hue} chroma ${chroma}: ${pair} ${r.toFixed(2)}`);
      }
      assert.deepEqual(failures, []);
      assert.equal(measured, HUES.length * CHROMAS.length * (PAIRS.length + 24));
    });
  });
}

test('expressive: more contrast and forced colours give plain surfaces and solid text; less transparency, opaque glass', { skip }, async () => {
  await withPage(async (page, media) => {
    const read = () => page.evaluate(`(() => {
      const cs = id => getComputedStyle(document.getElementById(id));
      return { mesh: cs('mesh').backgroundImage, glass: cs('glass').backdropFilter, glassBg: cs('glass').backgroundColor,
        fill: cs('ink').webkitTextFillColor, inkBg: cs('ink').backgroundImage };
    })()`);
    const normal = await read();
    assert.match(normal.mesh, /radial-gradient/);
    assert.match(normal.mesh, /url\(/, 'grain over the mesh');
    assert.match(normal.glass, /blur/);
    assert.match(normal.inkBg, /linear-gradient/);
    for (const features of [[{ name: 'prefers-contrast', value: 'more' }], [{ name: 'forced-colors', value: 'active' }]]) {
      await media(features);
      const r = await read();
      assert.equal(r.mesh, 'none', features[0].name);
      assert.equal(r.glass, 'none', features[0].name);
      assert.equal(r.inkBg, 'none', features[0].name);
      assert.doesNotMatch(r.fill, /rgba\(0, 0, 0, 0\)/, features[0].name);
    }
    await media([{ name: 'prefers-reduced-transparency', value: 'reduce' }]);
    const opaque = await read();
    assert.equal(opaque.glass, 'none');
    assert.doesNotMatch(opaque.glassBg, /rgba|\/ 0\./);
    assert.match(opaque.mesh, /radial-gradient/, 'only glass changes');
  });
});

test('expressive: bento spans from a 32rem grid, one cell below; the hero pads unless data-tm-pad says; pairings set the display face', { skip }, async () => {
  await withPage(async page => {
    const r = await page.evaluate(`(() => {
      const box = id => document.getElementById(id).getBoundingClientRect();
      const cs = id => getComputedStyle(document.getElementById(id));
      return { wide: box('wide').width, one: box('one').width, nwide: box('nwide').width, narrow: box('narrow').width,
        hero: parseFloat(cs('hero').paddingTop), band: cs('band').paddingTop, font: cs('pairedh').fontFamily, rows: cs('bento').gridAutoRows };
    })()`);
    assert.ok(r.wide > r.one * 1.9, `wide tile spans two columns: ${r.wide} vs ${r.one}`);
    assert.ok(r.nwide <= r.narrow + 0.5, 'below 32rem a wide tile stays in the grid');
    assert.ok(r.hero >= 40, `hero padding grows with the screen: ${r.hero}`);
    assert.equal(r.band, '8px', 'data-tm-pad replaces the hero padding');
    assert.match(r.font, /Fraunces/);
    assert.match(r.rows, /112px/, 'rows of --tm-bento-row (7rem)');
  });
});

test('expressive: every surface paints (a value the browser refuses drops the whole background silently)', { skip }, async () => {
  await withPage(async page => {
    const bg = await page.evaluate(`['mesh', 'wash', 'gradient'].map(id => getComputedStyle(document.getElementById(id)).backgroundImage)`);
    for (const [i, v] of bg.entries()) assert.match(v, /gradient/, ['mesh', 'wash', 'gradient'][i]);
  });
});

test('expressive: every colour comes from --tm-hue (or is white or black with alpha)', () => {
  const css = readFileSync(join(root, 'src/expressive.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla)\(/);
  for (const m of css.matchAll(/oklch\(([^()]*(?:\([^()]*(?:\([^()]*\))*[^()]*\))*[^()]*)\)/g)) {
    if (/^\s*[\d.]+\s+0\s+0\b/.test(m[1])) continue;
    assert.match(m[1], /var\(--_ex-(h|sh)\)/, `oklch(${m[1]})`);
  }
});

test('checker: expressive attributes', () => {
  const codes = (html, modules = new Set(['core', 'expressive'])) => checkMarkup(html, 'x.html', { modules }).map(d => d.code);
  assert.deepEqual(codes(`<main data-tm-surface="mesh" data-tm-grain data-tm-pairing="editorial">
    <h1 data-tm-display="hero" data-tm-ink="gradient">A</h1>
    <div data-tm-layout="grid" data-tm-bento><article data-tm-span="wide" data-tm-elevation="raised" data-tm-halo>x</article></div>
    <span data-tm-avatar data-tm-seed="11">AB</span><data data-tm-figure value="3">3</data><header data-tm-hero></header></main>`), []);
  assert.deepEqual(codes('<div data-tm-surface="frosted"></div>'), ['TM101']);
  assert.deepEqual(codes('<div data-tm-grain="yes"></div>'), ['TM102']);
  assert.deepEqual(codes('<div data-tm-bento></div>'), ['TM107']);
  assert.deepEqual(codes('<div data-tm-layout="row"><p data-tm-span="wide"></p></div>'), ['TM109']);
  assert.deepEqual(codes('<ul data-tm-display="xl"></ul>'), ['TM108']);
  assert.deepEqual(codes('<span data-tm-avatar data-tm-seed="12">A</span>'), ['TM101']);
  assert.deepEqual(codes('<div data-tm-surface="glass"></div>', new Set(['core'])), ['TM110']);
});

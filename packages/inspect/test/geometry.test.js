// The geometry checks against their fixtures, served over HTTP: each one fires on geometry-broken.html at both widths,
// and geometry-clean.html, packed with correct UI that looks like what they look for, gives none of their codes.
// Skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from '../lib/inspect.js';
import { findBrowser } from '../lib/cdp.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const root = fileURLToPath(new URL('../../..', import.meta.url));

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

const CODES = ['overlap', 'spill', 'squeezed', 'distorted', 'upscaled'];

test('geometry: overlapping text, spills, squeezed text and distorted images fire; their look-alikes do not', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  const { srv, base } = await serve();
  // A temp dir of its own: other test files launch browsers in parallel, and their profiles would show up in a shared one.
  const tmp = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prevTmp = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    const { findings } = await inspect(['geometry-broken', 'geometry-clean'].map(f => `${base}${f}.html`), { schemes: ['light'], settle: 100 });
    const ours = findings.filter(f => CODES.includes(f.code));
    const of = file => ours.filter(f => f.url.endsWith(file));

    // the clean page: correct UI (covered text, positioned badges, pulled-out avatars, narrow labels, cover images, …), and its dialog
    assert.deepEqual(of('geometry-clean.html').map(f => `${f.state} ${f.code} ${f.selector} ${f.message}`), []);

    // the broken page: every finding at both widths, none of them an error
    const broken = of('geometry-broken.html');
    assert.deepEqual(broken.filter(f => f.where.length !== 2).map(f => `${f.code} ${f.selector} ${f.where}`), []);
    assert.ok(broken.every(f => f.severity === (f.code === 'upscaled' ? 'info' : 'warning') && f.state === 'page'));
    const find = (code, selector) => {
      const f = broken.find(f => f.code === code && f.selector.startsWith(selector));
      assert.ok(f, `${code} on ${selector}; got ${broken.map(f => `${f.code} ${f.selector}`).join(', ')}`);
      return f.message;
    };
    assert.deepEqual(broken.map(f => `${f.code} ${f.selector.split(' "')[0]}`).sort(), [
      'distorted img#stretched', 'distorted img#svgstretch',
      'overlap p#below', 'overlap p#tight', 'overlap p#under',
      'spill #btn button', 'spill #url div.card', 'spill #wide div.card',
      'squeezed p#desc', 'squeezed p#word', 'squeezed span#gone',
      'upscaled img#blurry', 'upscaled img#stretched',
    ]);

    // overlap: on the later element, naming the earlier one and the size; and a line-height far below the font size
    assert.match(find('overlap', 'p#under'), /painted over the text of #abs span\.tag "Overlapping label" \(\d+×\d+px\)/);
    assert.match(find('overlap', 'p#below'), /div\.title "A title that grew/);
    assert.match(find('overlap', 'p#tight'), /line-height 8px is far below the font size 16px/);
    // spill: the box spilled out of, the child that pokes out, the side and the px
    assert.match(find('spill', '#wide div.card'), /^#wide div pokes out of its right edge by 79px.*max-width: 100%/);
    assert.match(find('spill', '#url div.card'), /^the text of #url p "See https:.* pokes out of its right edge by \d+px.*overflow-wrap: anywhere/);
    assert.match(find('spill', '#btn button'), /^its own text pokes out of its bottom edge by \d+px.*min-height/);
    // squeezed: width, words and lines, and what squeezes it
    assert.match(find('squeezed', 'p#desc'), /^squeezed to \d+px wide: 8 words on [78] lines\. It is a flex item that shrinks \(flex-shrink: 1\) next to a sibling that does not \(#flex span\.fixed/);
    assert.match(find('squeezed', 'p#word'), /1 word on \d+ lines, broken mid-word/);
    assert.match(find('squeezed', 'span#gone'), /^squeezed to 0px wide: 3 words on 3 lines/);
    // images: both shapes, the fix; an SVG without a viewBox stretches too; upscaling with the factor
    assert.match(find('distorted', 'img#stretched'), /shown at 100×100 \(1\.00:1\), its own shape is 20×10, 2\.00:1 \(add object-fit: cover/);
    assert.match(find('distorted', 'img#svgstretch'), /shown at 120×120 \(1\.00:1\), its own shape is 2\.00:1/);
    assert.match(find('upscaled', 'img#blurry'), /10\.0× its natural size \(20×10 shown at 200×100\)/);
  } finally {
    if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp;
    rmSync(tmp, { recursive: true, force: true });
    srv.close();
  }
});

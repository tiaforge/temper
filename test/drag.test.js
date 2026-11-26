// drag.css in a real browser (fixtures/drag.html, served over HTTP from the repository root): drag handles, lifted
// rows and drop places, and the
// checker's vocabulary for them. The browser tests are skipped without Chrome/Chromium.
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

/**
 * Opens fixtures/drag.html. hover: true applies drag.css's (hover: hover) rules, as on a device with a mouse
 * (headless Chrome reports hover: none, and CDP cannot emulate hover).
 */
async function withPage({ width = 800, hover = false } = {}, fn) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/drag.html`, { width, height: 700, scheme: 'light', settle: 100 });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.evaluate(`(() => {
      if (${hover}) {
        const sheet = [...document.styleSheets].find(s => s.href?.endsWith('/drag.css'));
        const find = rules => [...rules].flatMap(r => r.conditionText === '(hover: hover)' ? [r] : r.cssRules ? find(r.cssRules) : []);
        for (const m of find(sheet.cssRules)) sheet.insertRule('@layer tm.components { ' + [...m.cssRules].map(r => r.cssText).join(' ') + ' }', sheet.cssRules.length);
      }
      window.$ = id => document.getElementById(id);
      window.cs = (id, p) => getComputedStyle($(id), p);
      window.box = id => { const r = $(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    })()`);
    await new Promise(r => setTimeout(r, 50));
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}

const move = (page, x, y) => page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });

test('drag handle: a quiet square grip button with a grab cursor and touch-action none; grabbing while picked up', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => ['h-1', 'h-2', 'h-4'].map(id => ({
      cursor: cs(id).cursor, touch: cs(id).touchAction, w: box(id).w, h: box(id).h, bg: cs(id).backgroundColor,
      grip: cs(id, '::before').maskImage, content: cs(id, '::before').content,
    })))()`);
    const [plain, pressed, icon] = r;
    assert.equal(plain.cursor, 'grab');
    assert.equal(plain.touch, 'none');
    assert.equal(plain.w, plain.h, 'an empty handle is square');
    assert.equal(plain.bg, 'rgba(0, 0, 0, 0)', 'no fill without a variant');
    assert.match(plain.grip, /^url\("data:image\/svg\+xml/, 'the grip is drawn');
    assert.equal(pressed.cursor, 'grabbing', 'aria-pressed="true": picked up');
    assert.notEqual(pressed.bg, 'rgba(0, 0, 0, 0)', 'a picked-up handle has the pressed fill');
    assert.equal(pressed.w, pressed.h);
    assert.ok(pressed.w < plain.w, 'data-tm-size="sm" makes it smaller');
    // with data-tm-icon the icon is core's (not the grip), and a variant keeps its look
    assert.doesNotMatch(icon.grip, /M9 5v0/);
    assert.equal(icon.cursor, 'grab');
  });
});

test('quiet handle: hidden until its row is hovered or has focus, where a pointer can hover; always shown on touch screens', { skip }, async () => {
  await withPage({ hover: true }, async page => {
    const opacity = () => page.evaluate(`cs('h-3').opacity`);
    await move(page, 1, 1);
    assert.equal(await opacity(), '0');
    const row = await page.evaluate(`box('row-3')`);
    await move(page, row.x + row.w - 10, row.y + row.h / 2);
    assert.equal(await opacity(), '1', 'shown while the row is hovered');
    await move(page, 1, 1);
    await page.evaluate(`$('h-3').focus()`);
    assert.equal(await opacity(), '1', 'shown while it has focus');
    await page.evaluate(`$('h-3').blur(); $('h-3').setAttribute('aria-pressed', 'true')`);
    assert.equal(await opacity(), '1', 'shown while picked up');
  });
  await withPage({}, async page => { // headless Chrome is a device that cannot hover
    assert.equal(await page.evaluate(`cs('h-3').opacity`), '1', 'touch screens always show it');
  });
});

test('a lifted row is raised; a drop place is a line centred on an edge (inline edges in a row) or an outline, and moves nothing', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      const line = id => { const s = cs(id, '::after'), b = box(id), p = $(id).getBoundingClientRect();
        // the pseudo-element's box from its insets: top/bottom (or left/right) against the element
        return { top: s.top, bottom: s.bottom, left: s.left, right: s.right, bt: s.borderTopWidth, bl: s.borderLeftWidth, pos: cs(id).position }; };
      const raised = document.createElement('span'); $('c-2').append(raised); raised.style.color = 'var(--tm-surface-raised)';
      const surface = getComputedStyle(raised).color; raised.remove();
      return {
        lifted: { bg: cs('c-2').backgroundColor, surface, shadow: cs('c-2').boxShadow, z: cs('c-2').zIndex },
        before: line('c-1'), after: line('c-3'), inside: [cs('c-4').outlineStyle, cs('c-4').outlineWidth, cs('c-4').outlineOffset],
        colBefore: line('col-1'), colAfter: line('col-2'),
        gaps: [box('c-1').y, box('c-2').y, box('c-3').y, box('c-4').y],
      };
    })()`);
    assert.equal(r.lifted.bg, r.lifted.surface);
    assert.notEqual(r.lifted.shadow, 'none');
    assert.equal(r.lifted.z, '1');
    assert.deepEqual([r.before.top, r.before.bt, r.before.pos], ['-1px', '2px', 'relative'], 'a 2px line centred on the top edge');
    assert.deepEqual([r.after.bottom, r.after.bt], ['-1px', '2px'], 'and on the bottom edge');
    assert.deepEqual(r.inside, ['solid', '2px', '-2px']);
    assert.deepEqual([r.colBefore.left, r.colBefore.bl, r.colBefore.bt], ['-1px', '2px', '0px'], 'in a row: on the inline start edge');
    assert.deepEqual([r.colAfter.right, r.colAfter.bl], ['-1px', '2px']);
    // no margins: the rows keep their places (stack gap sm = 8px between rows of equal height)
    const steps = r.gaps.slice(1).map((y, i) => y - r.gaps[i]);
    assert.ok(steps.every(s => s === steps[0]), `rows moved: ${steps}`);
  });
});

test('checker: data-tm-handle is a button with a label, quiet or empty, and needs drag.css', () => {
  const codes = (html, ctx = { modules: new Set(['core', 'drag']) }) => checkMarkup(html, 'x.html', ctx).map(d => d.code);
  assert.deepEqual(codes('<button data-tm-handle aria-label="Move Inbox"></button><button data-tm-handle="quiet" aria-label="Move Sent"></button>'), []);
  assert.deepEqual(codes('<button data-tm-handle></button>'), ['TM103']);
  assert.deepEqual(codes('<button data-tm-handle="loud" aria-label="Move"></button>'), ['TM101']);
  assert.deepEqual(codes('<div data-tm-handle aria-label="Move"></div>'), ['TM108']);
  assert.deepEqual(codes('<button data-tm-handle aria-label="Move"></button>', { modules: new Set(['core']) }), ['TM110']);
});

test('checker: data-tm-lifted is boolean, data-tm-drop takes before, after or inside', () => {
  const codes = (html, ctx = { modules: new Set(['core', 'drag']) }) => checkMarkup(html, 'x.html', ctx).map(d => d.code);
  assert.deepEqual(codes('<li data-tm-lifted>A</li><li data-tm-drop="before">B</li><li data-tm-drop="inside">C</li>'), []);
  assert.deepEqual(codes('<li data-tm-lifted="true">A</li>'), ['TM102']);
  assert.deepEqual(codes('<li data-tm-drop="above">A</li>'), ['TM101']);
});

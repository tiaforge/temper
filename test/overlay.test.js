// Dialogs, sheets (sheet.css), popovers and menus in a real browser (fixtures/overlay.html, served over HTTP from the
// repository root): the page behind a modal dialog does not scroll and does not shift, a tall dialog keeps its header
// and footer in view, sheets sit at and slide from their edge (RTL, phones, print, forced colors, reduced motion),
// popovers and menus fade in and out (not the rail drawer or the toast region), menu group labels and shortcut hints,
// and what opening one restyles. Animations are read by pausing them and setting their time, never by waiting.
// Skipped when no Chrome/Chromium is installed.
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
 * Opens fixtures/overlay.html. width, height; dir: 'rtl'; motion: 'reduce' (default) or 'no-preference';
 * media: extra emulated features ({ 'forced-colors': 'active' }) or a media type ({ type: 'print' });
 * scrollbars: true shows classic scrollbars (they take space), as on Linux and Windows.
 */
async function withPage({ width = 1280, height = 700, dir, motion = 'reduce', media = {}, scrollbars = false } = {}, fn) {
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
    if (scrollbars) await page.send('Emulation.setScrollbarsHidden', { hidden: false });
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/overlay.html`, { width, height, scheme: 'light', settle: 100 });
    const { type, ...features } = media;
    await page.send('Emulation.setEmulatedMedia', {
      media: type ?? '',
      features: [{ name: 'prefers-reduced-motion', value: motion }, ...Object.entries(features).map(([name, value]) => ({ name, value }))],
    });
    await page.evaluate(`(() => {
      ${dir ? `document.documentElement.dir = '${dir}';` : ''}
      window.$ = id => document.getElementById(id);
      window.cs = id => getComputedStyle($(id));
      window.box = id => { const r = $(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
      // the running transition of one property; paused, at the given time (0: where it starts)
      window.at = (id, prop, t) => {
        const a = $(id).getAnimations().find(a => a.transitionProperty === prop);
        if (!a) return null;
        a.pause(); a.currentTime = t;
        return true;
      };
      window.transitions = id => $(id).getAnimations().map(a => a.transitionProperty).sort();
    })()`);
    await new Promise(r => setTimeout(r, 50));
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wheel = (page, x, y, deltaY) => page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });

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

// The harness hides scrollbars (and Chrome cannot show them again from here), so the no-shift part is checked through
// the reserved gutter: stable while a page that overflows is locked, none on a page that does not.
test('the page behind a modal dialog does not scroll; its scrollbar space stays reserved only if it had one', { skip }, async () => {
  for (const motion of ['reduce', 'no-preference']) await withPage({ motion }, async page => {
    const root = `(() => { const s = getComputedStyle(document.documentElement); return { y: scrollY, overflow: s.overflowY, gutter: s.scrollbarGutter }; })()`;
    assert.deepEqual(await page.evaluate(`(scrollTo(0, 200), ${root})`), { y: 200, overflow: 'visible', gutter: 'auto' });
    await page.evaluate(`$('short').showModal()`);
    await sleep(50);
    assert.deepEqual(await page.evaluate(root), { y: 200, overflow: 'hidden', gutter: 'stable' }, motion);
    await wheel(page, 30, 650, 500); // over the backdrop
    await sleep(200);
    assert.equal(await page.evaluate('scrollY'), 200, 'the page scrolled behind the dialog');
    await page.evaluate(`$('short').close()`);
    await sleep(50);
    assert.deepEqual(await page.evaluate(root), { y: 200, overflow: 'visible', gutter: 'auto' });
    // a non-modal dialog leaves the page alone
    await page.evaluate(`$('short').show()`);
    assert.equal(await page.evaluate(`getComputedStyle(document.documentElement).overflowY`), 'visible');
  });
  // a page that does not overflow has no scrollbar: no space is reserved for one
  await withPage({}, async page => {
    await page.evaluate(`($('rows').remove(), $('short').showModal())`);
    await sleep(50);
    assert.deepEqual(await page.evaluate(`[getComputedStyle(document.documentElement).overflowY, getComputedStyle(document.documentElement).scrollbarGutter]`), ['hidden', 'auto']);
  });
});

test('a tall dialog keeps its header and footer in place and scrolls what is between them, in every markup shape', { skip }, async () => {
  await withPage({}, async page => {
    for (const id of ['tall', 'tall-form', 'tall-article', 'tall-stack']) {
      const r = await page.evaluate(`(() => {
        const d = $('${id}'); d.showModal(); d.getAnimations().forEach(a => a.finish());
        const scroller = '${id}' === 'tall-stack' ? $('tall-stack-scroll') : d;
        const at = () => ({ header: box('${id}-header').y, footer: box('${id}-footer').bottom, first: box('${id}-first').y });
        const rest = at(), dialog = box('${id}');
        scroller.scrollTop = 600;
        const scrolled = at();
        const pad = parseFloat(getComputedStyle(d).paddingTop), border = parseFloat(getComputedStyle(d).borderTopWidth);
        const title = $('${id}-header').querySelector('h2').getBoundingClientRect().y, scrollTop = scroller.scrollTop;
        d.close();
        return { rest, scrolled, dialog, pad, border, title, scrollTop, viewport: innerHeight };
      })()`);
      assert.ok(r.dialog.bottom <= r.viewport, `${id}: the dialog fits the screen`);
      assert.equal(r.scrollTop, 600, `${id}: the content scrolls`);
      assert.equal(r.scrolled.header, r.rest.header, `${id}: the header stays`);
      assert.equal(r.scrolled.footer, r.rest.footer, `${id}: the footer stays`);
      assert.equal(r.scrolled.first, r.rest.first - 600, `${id}: the content moves`);
      // the header covers the padding above it, its title keeps its place below that padding
      assert.equal(r.rest.header, r.dialog.y + r.border, id);
      assert.ok(r.title >= r.dialog.y + r.border + r.pad, `${id}: title below the padding`);
      assert.equal(r.rest.footer, r.dialog.bottom - r.border, id);
    }
  });
});

test('a stack dialog (or one stack wrapper): its data-grow data-scroll="y" part fills the dialog up to the screen limit and scrolls; with little content the dialog stays small',{ skip }, async () => {
  await withPage({}, async page => {
    const measure = (id, part) => page.evaluate(`(() => {
      const d = $('${id}'); d.showModal(); d.getAnimations().forEach(a => a.finish());
      const p = $('${part}'), r = { dialog: box('${id}'), part: box('${part}'), footer: box('${id}-footer'), header: (h => ({ y: h.y, bottom: h.bottom }))(d.querySelector('header').getBoundingClientRect()), max: parseFloat(cs('${id}').maxBlockSize),
        partScrolls: p.scrollHeight > p.clientHeight + 1, dialogScrolls: d.scrollHeight > d.clientHeight + 1, content: p.firstElementChild.getBoundingClientRect().height };
      d.close(); return r;
    })()`);
    // directly in a stack dialog, or through one stack wrapper (form, div, article) in an ordinary dialog
    for (const [id, part] of [['tall-stack', 'tall-stack-scroll'], ['wrap-form', 'wrap-form-part'], ['wrap-div', 'wrap-div-part'], ['wrap-article', 'wrap-article-part']]) {
      const r = await measure(id, part);
      assert.equal(r.dialog.h, r.max, `${id}: as tall as the screen allows`);
      assert.ok(r.part.h > r.max - 250, `${id}: the part takes the rest: ${r.part.h} of ${r.dialog.h}`);
      assert.ok(r.partScrolls && !r.dialogScrolls, `${id}: the part scrolls, the dialog does not`);
      assert.ok(r.header.y >= r.dialog.y && r.header.bottom <= r.part.y, `${id}: the header is above the part, inside the dialog`);
      assert.ok(r.footer.y >= r.part.bottom && r.footer.bottom <= r.dialog.bottom, `${id}: the footer is below the part, inside the dialog`);
    }
    for (const [id, part] of [['short-stack', 'short-stack-scroll'], ['wrap-short', 'wrap-short-part']]) {
      const r = await measure(id, part);
      assert.equal(r.part.h, r.content, `${id}: the part is as tall as its content (not 8rem)`);
      assert.ok(r.dialog.h < 300 && !r.partScrolls && !r.dialogScrolls, `${id}: the dialog stays small: ${r.dialog.h}`);
    }
  });
});

// The stack dialog's rule (data-grow starts from its content) must not reach a row dialog: there data-grow starts from
// 8rem, so a search field or a title shares the line with its button (from its content, both wrapped onto two lines).
test('a row dialog: a data-grow child keeps its 8rem start and shares the line with its button', { skip }, async () => {
  for (const width of [360, 1280]) await withPage({ width }, async page => {
    const r = await page.evaluate(`['row-search', 'row-title'].map(id => {
      const d = $(id); d.showModal(); d.getAnimations().forEach(a => a.finish());
      const g = box(id + '-grow'), b = box(id + '-button'), basis = cs(id + '-grow').flexBasis;
      d.close(); return { id, oneLine: b.x > g.right - 1 && b.y < g.bottom, basis };
    })`);
    assert.deepEqual(r, [{ id: 'row-search', oneLine: true, basis: '128px' }, { id: 'row-title', oneLine: true, basis: '128px' }], `${width}px`);
  });
});

test('inside a dialog: dialog > article takes the dialog padding (not the card one), sticky bars and table headers paint the raised surface and slide under the header', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      const d = $('padded'); d.showModal(); d.getAnimations().forEach(a => a.finish());
      const rest = box('padded-header').y;
      d.scrollTop = 400;
      const raised = cs('padded').backgroundColor;
      return {
        header: [cs('padded-header').paddingTop, cs('padded-header').marginTop, rest === box('padded-header').y],
        surfaces: ['padded-header', 'padded-bar', 'padded-th'].map(id => cs(id).backgroundColor === raised),
        z: ['padded-header', 'padded-bar', 'padded-th'].map(id => +cs(id).zIndex),
        scrollbar: cs('padded').scrollbarWidth,
      };
    })()`);
    assert.deepEqual(r.header, ['16px', '-16px', true]);
    assert.deepEqual(r.surfaces, [true, true, true]);
    assert.ok(r.z[0] > r.z[1] && r.z[1] > r.z[2], `header above bar above table header: ${r.z}`);
    assert.equal(r.scrollbar, 'thin');
  });
});

test('a short dialog looks as before: padding, the gap between its parts, closedby="any"', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      $('short').showModal(); $('short').getAnimations().forEach(a => a.finish());
      const h2 = $('short-header').querySelector('h2').getBoundingClientRect();
      return { dialog: box('short'), header: box('short-header'), first: box('short-first'), footer: box('short-footer'), h2: { y: h2.y, h: h2.height }, scrollable: $('short').scrollHeight > $('short').clientHeight };
    })()`);
    assert.equal(r.scrollable, false);
    // 1px border + 24px padding (lg) above the title, the md gap (16px) between header, content and footer
    const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.5, `${what}: ${a} vs ${b}`);
    near(r.h2.y, r.dialog.y + 1 + 24, 'title below border and padding');
    near(r.first.y - (r.h2.y + r.h2.h), 16, 'gap below the header');
    near(r.footer.y - (r.first.y + r.first.h), 16, 'gap above the footer');
    near(r.footer.bottom, r.dialog.bottom - 1, 'the footer box covers the bottom padding');
    near(r.footer.h, 40 + 24, 'footer: buttons and the padding below them');
    // closedby="any": a click on the dialog's own padding keeps it open, a click on the backdrop closes it
    const click = async (x, y) => {
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      await sleep(50);
    };
    await click(r.dialog.x + 8, r.dialog.y + 8);
    assert.equal(await page.evaluate(`$('short').open`), true);
    await click(10, 10);
    assert.equal(await page.evaluate(`$('short').open`), false);
  });
});

const edges = `(id => { $(id).showModal(); $(id).getAnimations().forEach(a => a.finish()); const b = box(id); const s = cs(id); $(id).close(); return { x: Math.round(b.x), right: Math.round(b.right), y: Math.round(b.y), bottom: Math.round(b.bottom), w: Math.round(b.w), display: s.display, radius: s.borderTopLeftRadius }; })`;

test('sheets sit at their edge: end and start full height, bottom along the bottom, narrow only on phones', { skip }, async () => {
  for (const [width, dir] of [[1280], [1280, 'rtl'], [390]]) await withPage({ width, height: 700, dir }, async page => {
    const r = await page.evaluate(`Object.fromEntries(['end', 'start', 'bottom', 'narrow'].map(id => [id, ${edges}(id)]))`);
    const rtl = dir === 'rtl', name = `${width}${dir ?? ''}`;
    const atRight = s => assert.equal(s.right, width, name), atLeft = s => assert.equal(s.x, 0, name);
    (rtl ? atLeft : atRight)(r.end);
    (rtl ? atRight : atLeft)(r.start);
    for (const s of [r.end, r.start]) {
      assert.deepEqual([s.y, s.bottom, s.display], [0, 700, 'flex'], name);
      assert.equal(s.w, Math.min(480, width - 32), `${name}: --tm-dialog-width, a strip of backdrop left on phones`);
    }
    assert.deepEqual([r.bottom.bottom, r.bottom.w, r.bottom.x], [700, Math.min(480, width), (width - Math.min(480, width)) / 2], name);
    if (width < 768) assert.deepEqual([r.narrow.bottom, r.narrow.w, r.narrow.x], [700, width, 0], 'narrow: a bottom sheet on phones');
    else assert.deepEqual([r.narrow.w, r.narrow.radius, r.narrow.bottom < 700], [480, '12px', true], 'narrow: a centered dialog from 48rem');
  });
});

test('side sheets: the footer sits at the bottom, header and footer stay while it scrolls, a scroll block keeps its height', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      const out = {};
      for (const id of ['end', 'start']) { $(id).showModal(); $(id).getAnimations().forEach(a => a.finish()); out[id] = box(id + '-footer').bottom; $(id).close(); }
      $('end-tall').showModal(); $('end-tall').getAnimations().forEach(a => a.finish());
      const rest = [box('end-tall-header').y, box('end-tall-footer').bottom];
      out.pre = [box('end-tall-pre').h, $('end-tall-pre').scrollHeight];
      $('end-tall').scrollTop = 500;
      out.scrolled = [box('end-tall-header').y, box('end-tall-footer').bottom];
      out.rest = rest;
      return out;
    })()`);
    assert.equal(r.end, 700, 'end: the footer at the bottom (its box covers the padding)');
    assert.equal(r.start, 700, 'start (form wrapper): the footer at the bottom');
    assert.deepEqual(r.scrolled, r.rest);
    assert.ok(r.pre[0] >= r.pre[1], `the pre was squeezed: ${r.pre}`);
  });
});

test('sheets slide in from their edge and back out (mirrored in RTL); reduced motion makes it instant', { skip }, async () => {
  for (const dir of [undefined, 'rtl']) await withPage({ motion: 'no-preference', dir }, async page => {
    const r = await page.evaluate(`(() => {
      const out = {};
      for (const id of ['end', 'start', 'bottom']) {
        $(id).showModal();
        const props = transitions(id);
        at(id, 'translate', 0);
        const from = box(id);
        $(id).getAnimations().forEach(a => a.finish());
        const to = box(id);
        $(id).close();
        const closing = { props: transitions(id), display: cs(id).display };
        at(id, 'translate', 150);
        out[id] = { props, from: [Math.round(from.x), Math.round(from.y)], to: [Math.round(to.x), Math.round(to.y)], closing, end: [Math.round(box(id).x), Math.round(box(id).y)] };
        $(id).getAnimations().forEach(a => a.finish());
      }
      return out;
    })()`);
    const rtl = dir === 'rtl';
    // end starts off the right edge (left in RTL), start off the left edge, bottom below the screen
    assert.equal(r.end.from[0], rtl ? -480 : 1280);
    assert.equal(r.start.from[0], rtl ? 1280 : -480);
    assert.equal(r.bottom.from[1], 700);
    for (const [id, s] of Object.entries(r)) {
      assert.ok(s.props.includes('translate') && !s.props.includes('opacity'), `${id} slides, it does not fade: ${s.props}`);
      assert.ok(s.closing.props.includes('translate') && s.closing.display !== 'none', `${id} slides out: ${JSON.stringify(s.closing)}`);
      assert.deepEqual(s.end, s.from, `${id} leaves the way it came`);
    }
    assert.deepEqual([r.end.to[0], r.start.to[0]], rtl ? [0, 800] : [800, 0]);
  });
  await withPage({}, async page => {
    assert.match(await page.evaluate(`($('end').showModal(), cs('end').transitionDuration)`), /^0\.001s(, 0\.001s)*$/);
  });
});

/** The number of pages `page` prints to (A4). */
async function printedPages(page) {
  const { data } = await page.send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69 });
  return (Buffer.from(data, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

test('an open dialog prints all of its content, from the first page; header and footer print once, in place', { skip }, async () => {
  await withPage({ media: { type: 'print' } }, async page => {
    await page.evaluate(`$('rows').remove()`); // the page itself fits on one sheet
    assert.equal(await printedPages(page), 1);
    for (const id of ['tall', 'tall-form', 'tall-article', 'tall-stack', 'wrap-form', 'end-tall']) {
      const r = await page.evaluate(`(() => {
        const d = $('${id}'); d.showModal(); d.getAnimations().forEach(a => a.finish());
        const s = cs('${id}'), border = parseFloat(s.borderTopWidth);
        return { top: box('${id}').y + scrollY, dialog: box('${id}'), scroll: d.scrollHeight, client: d.clientHeight, overflow: s.overflowY, position: s.position,
          header: box('${id}-header'), footer: box('${id}-footer'), sticky: [cs('${id}-header').position, cs('${id}-footer').position], border };
      })()`);
      assert.equal(r.position, 'absolute', id);
      assert.equal(r.overflow, 'visible', id);
      assert.equal(r.top, 0, `${id}: starts at the top of the first page`); // (showModal may scroll to a focused button)
      assert.ok(r.dialog.h > 1500 && r.client >= r.scroll, `${id}: as tall as its content: ${r.dialog.h}, ${r.client} < ${r.scroll}`);
      // not sticky: printed once, the header at the top of the dialog, the footer after the content
      assert.deepEqual(r.sticky, ['static', 'static'], id);
      assert.equal(r.header.y, r.dialog.y + r.border, id);
      assert.ok(Math.abs(r.footer.bottom - (r.dialog.bottom - r.border)) < 1, `${id}: footer at the end`);
      assert.ok(await printedPages(page) >= 2, `${id}: prints on more than one page`);
      await page.evaluate(`$('${id}').close()`);
    }
  });
});

test('sheets: print in full, forced colors keep their edge, safe-area insets pad the screen edges', { skip }, async () => {
  await withPage({ media: { type: 'print' } }, async page => {
    const r = await page.evaluate(`($('end-tall').showModal(), $('end-tall').getAnimations().forEach(a => a.finish()), { h: box('end-tall').h, overflow: cs('end-tall').overflowY, translate: cs('end-tall').translate })`);
    assert.ok(r.h > 1500, `printed sheet is one screen tall: ${r.h}`);
    assert.deepEqual([r.overflow, r.translate], ['visible', 'none']);
  });
  await withPage({ media: { 'forced-colors': 'active' } }, async page => {
    const r = await page.evaluate(`['end', 'start', 'bottom'].map(id => { $(id).showModal(); const s = cs(id); const w = [s.borderInlineStartWidth, s.borderInlineEndWidth, s.borderBlockStartWidth]; $(id).close(); return w; })`);
    assert.deepEqual(r, [['1px', '0px', '0px'], ['0px', '1px', '0px'], ['1px', '1px', '1px']], 'the edge toward the page keeps its line');
  });
  // a phone with a notch, in landscape: the sheet pads the screen edges it touches by the insets
  await withPage({ width: 844, height: 390 }, async page => {
    await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, bottom: 21, left: 47, right: 47 } });
    const r = await page.evaluate(`['end', 'start', 'bottom'].map(id => { $(id).showModal(); const s = cs(id); const p = [s.paddingLeft, s.paddingRight, s.paddingBottom]; $(id).close(); return p; })`);
    assert.deepEqual(r, [['24px', '71px', '45px'], ['71px', '24px', '45px'], ['71px', '71px', '45px']]);
  });
});

test('popovers and menus fade in and out; the rail drawer and the toast region keep their own motion', { skip }, async () => {
  await withPage({ motion: 'no-preference', width: 390 }, async page => {
    const r = await page.evaluate(`(() => {
      const out = {};
      for (const id of ['menu', 'note']) {
        $(id).showPopover();
        const props = transitions(id);
        at(id, 'opacity', 0);
        const start = [cs(id).opacity, cs(id).scale];
        $(id).getAnimations().forEach(a => a.finish());
        $(id).hidePopover();
        const closing = { props: transitions(id), display: cs(id).display };
        $(id).getAnimations().forEach(a => a.finish());
        out[id] = { props, start, closing, closed: cs(id).display };
      }
      $('rail').showPopover(); out.rail = transitions('rail'); $('rail').hidePopover();
      $('toasts').showPopover(); out.toasts = transitions('toasts');
      out.toastsOpacity = cs('toasts').opacity;
      return out;
    })()`);
    for (const id of ['menu', 'note']) {
      assert.ok(r[id].props.includes('opacity') && r[id].props.includes('scale'), `${id}: ${r[id].props}`);
      assert.deepEqual(r[id].start, ['0', '0.97'], id);
      assert.ok(r[id].closing.props.includes('opacity') && r[id].closing.display !== 'none', `${id} fades out: ${JSON.stringify(r[id].closing)}`);
      assert.equal(r[id].closed, 'none', id);
    }
    assert.ok(r.rail.includes('translate') && !r.rail.includes('opacity'), `rail drawer: ${r.rail}`);
    assert.deepEqual([r.toasts, r.toastsOpacity], [[], '1']);
  });
  // reduced motion: the reset shortens them
  await withPage({}, async page => {
    assert.match(await page.evaluate(`($('menu').showPopover(), cs('menu').transitionDuration)`), /^0\.001s(, 0\.001s)*$/);
  });
});

test('menus: a data-caption labels a group, a kbd sits at the end of its item; items keep their height', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`(() => {
      $('menu').showPopover();
      const text = el => { const n = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); const g = document.createRange(); g.selectNodeContents(n); return g.getBoundingClientRect(); };
      const item = box('with-kbd'), kbd = box('kbd');
      return {
        heights: ['plain', 'with-kbd', 'icon-kbd'].map(id => box(id).h),
        check: box('check-kbd').h,
        kbdEnd: item.right - kbd.right, pad: parseFloat(cs('with-kbd').paddingInlineEnd),
        center: [Math.round(item.y + item.h / 2), Math.round(kbd.y + kbd.h / 2)],
        label: text($('with-kbd')).width, labelEnd: text($('with-kbd')).right, kbdStart: kbd.x,
        caption: Math.round(text($('caption')).x), itemText: Math.round(text($('plain')).x),
        kbdColor: cs('kbd').color, muted: getComputedStyle(document.documentElement).getPropertyValue('--tm-text-muted') && cs('caption').color,
        border: cs('kbd').borderTopWidth,
      };
    })()`);
    assert.ok(Math.max(...r.heights) - Math.min(...r.heights) < 0.1, `items differ in height: ${r.heights}`);
    assert.ok(r.check >= r.heights[0], 'a checkbox item is at least as tall');
    assert.ok(Math.abs(r.kbdEnd - r.pad) < 1, `the shortcut ends at the item padding: ${r.kbdEnd}`);
    assert.ok(Math.abs(r.center[0] - r.center[1]) <= 1, `the shortcut is centered on the item: ${r.center}`);
    assert.ok(r.label > 150 && r.labelEnd < r.kbdStart, `the label keeps its width: ${r.label}`);
    assert.ok(Math.abs(r.caption - r.itemText) <= 1, `the group label lines up with the item text: ${r.caption}, ${r.itemText}`);
    assert.equal(r.kbdColor, r.muted, 'the shortcut is muted');
    assert.equal(r.border, '0px');
  });
});

// A modal dialog makes the rest of the page inert, so Chrome restyles the whole document when one opens or closes, with
// or without temper. The scroll lock (a :has() on the root) must add next to nothing to that; a menu restyles itself.
test('restyle cost: the scroll lock adds next to nothing to opening a modal dialog; a menu restyles itself only', { skip }, async () => {
  await withPage({}, async page => {
    const measure = async () => {
      const counts = {};
      for (const [name, open, close] of [
        ['dialog', `$('tall').showModal()`, `$('tall').close()`],
        ['sheet', `$('end').showModal()`, `$('end').close()`],
        ['menu', `$('menu').showPopover()`, `$('menu').hidePopover()`],
      ]) {
        counts[`open ${name}`] = await restyled(page, `(() => { ${open}; return document.body.offsetHeight; })()`);
        counts[`append while ${name} open`] = await restyled(page, `(() => { const c = $('rows'); c.append(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`);
        counts[`close ${name}`] = await restyled(page, `(() => { ${close}; return document.body.offsetHeight; })()`);
        await sleep(20);
      }
      return counts;
    };
    const withLock = await measure();
    // the same, with the scroll lock rule deleted from core.css
    const removed = await page.evaluate(`(() => {
      const del = (list, owner) => [...list].some((r, i) => r.selectorText?.includes('html:has(dialog:modal)') ? (owner.deleteRule(i), true) : r.cssRules?.length && del(r.cssRules, r));
      const sheet = [...document.styleSheets].find(s => s.href?.endsWith('/core.css'));
      return del(sheet.cssRules, sheet);
    })()`);
    assert.ok(removed, 'the scroll lock rule was not found');
    const without = await measure();
    assert.ok(withLock['open dialog'] >= 1, `no UpdateLayoutTree events traced: ${JSON.stringify(withLock)}`);
    for (const k of ['open dialog', 'close dialog', 'open sheet', 'close sheet'])
      assert.ok(withLock[k] <= without[k] + 3, `${k}: ${withLock[k]} with the scroll lock, ${without[k]} without`);
    const tooMany = Object.entries(withLock).filter(([k, n]) => !/^(open|close) (dialog|sheet)$/.test(k) && n > 30);
    assert.deepEqual(tooMany, [], `restyled elements: ${JSON.stringify(withLock)}`);
  });
});

test('checker: data-sheet takes end, start, bottom or narrow, on a dialog, and needs sheet.css', () => {
  const codes = (html, ctx = { modules: new Set(['core', 'sheet']) }) => checkMarkup(html, 'x.html', ctx).map(d => d.code);
  assert.deepEqual(codes('<dialog data-sheet="end" aria-label="Details"></dialog>'), []);
  assert.deepEqual(codes('<dialog data-sheet="narrow" aria-label="Share"></dialog>'), []);
  assert.deepEqual(codes('<dialog data-sheet="left" aria-label="Details"></dialog>'), ['TM101']);
  assert.ok(codes('<div data-sheet="end"></div>').length > 0, 'not on a div');
  assert.deepEqual(codes('<dialog data-sheet="end" aria-label="Details"></dialog>', { modules: new Set(['core']) }), ['TM110']);
});

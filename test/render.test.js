// Layout behavior in a real browser (fixtures/layout.html, served over HTTP from the repository root).
// Regressions found while moving an app onto temper. Skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const root = fileURLToPath(new URL('..', import.meta.url));

async function withPage(width, fn, fixture = 'layout.html') {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/${fixture}`, { width, height: 700, scheme: 'light', settle: 100 });
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}

const probe = `(() => {
  const el = id => document.getElementById(id);
  const box = id => el(id).getBoundingClientRect();
  const firstLine = id => { const r = document.createRange(); r.selectNodeContents(el(id)); return r.getClientRects()[0].left - box(id).left; };
  el('open').click();
  return {
    justifyText: firstLine('justify'),
    stackChild: el('item-stack').firstElementChild.getBoundingClientRect().left - box('item-stack').left,
    itemBusy: getComputedStyle(el('item-busy')).pointerEvents,
    busy: getComputedStyle(el('busy')).pointerEvents,
    menu: { left: box('menu').left, right: box('menu').right, open: el('menu').matches(':popover-open') },
    listBar: getComputedStyle(el('list-bar')).borderInlineStartWidth + ' ' + getComputedStyle(el('list-bar')).borderInlineStartColor,
    railOff: getComputedStyle(el('rail-off')).backgroundColor,
    railOn: getComputedStyle(el('rail-on')).backgroundColor,
    opener: box('open').left,
    ratio: [box('ratio').width, box('ratio').height],
    iconGap: Object.fromEntries(['icon-link', 'icon-only', 'icon-row', 'icon-menu', 'icon-rail'].map(id => [id, getComputedStyle(el(id), '::before').marginInlineEnd])),
    viewport: innerWidth,
  };
})()`;

test('buttons, items and menus lay out as documented', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  const wide = await withPage(1280, page => page.evaluate(probe));
  const narrow = await withPage(390, page => page.evaluate(probe));
  for (const r of [wide, narrow]) {
    // data-justify="start" puts the label's first line at the start (only the padding before it), not centered
    assert.ok(r.justifyText < 20, `data-justify="start" button text starts at ${r.justifyText}px`);
    // an item that is a data-layout stack keeps its children at the start edge
    assert.ok(r.stackChild < 20, `item stack child starts at ${r.stackChild}px`);
    // a busy item stays interactive; a busy plain button does not take clicks
    assert.equal(r.itemBusy, 'auto');
    assert.equal(r.busy, 'none');
    assert.ok(r.menu.open);
    // an item row in a data-list keeps its colored bar (the list's row reset used to remove it)
    assert.equal(r.listBar, '3px rgb(255, 152, 0)');
    // a pressed toggle in the rail gets a background; an unpressed one stays transparent
    assert.equal(r.railOff, 'rgba(0, 0, 0, 0)');
    assert.notEqual(r.railOn, r.railOff, 'a pressed rail toggle looks like an unpressed one');
    // an image narrowed by max-inline-size keeps its ratio: its height attribute does not squash it
    assert.deepEqual(r.ratio, [120, 60]);
    // a plain link's icon keeps 0.375em (16px text: 6px) from its text; an icon-only link and links whose layout has a gap add none
    assert.deepEqual(r.iconGap, { 'icon-link': '6px', 'icon-only': '0px', 'icon-row': '0px', 'icon-menu': '0px', 'icon-rail': '0px' });
  }
  // there is room: the menu starts under its button
  assert.ok(Math.abs(wide.menu.left - wide.opener) < 1, `menu at ${wide.menu.left}, button at ${wide.opener}`);
  // no room on a phone: the menu stays inside the screen with a gap on both sides
  assert.ok(narrow.menu.left >= 4 && narrow.viewport - narrow.menu.right >= 4, `menu ${narrow.menu.left}..${narrow.menu.right} of ${narrow.viewport}`);
});

// A real press and release (CDP mouse events, not element.click()) at a point of the card: returns what was clicked.
async function press(page, x, y) {
  await page.evaluate('window.clicks = []; document.getElementById("detail").close()');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return page.evaluate('({ clicks: window.clicks, open: document.getElementById("detail").open })');
}

test('a stretch card is clickable anywhere, its other links on their own', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    const rect = id => page.evaluate(`(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const commands = await page.evaluate("'command' in HTMLButtonElement.prototype");
    for (const [card, target] of [['card-button', 'stretch-button'], ['card-link', 'stretch-link'], ['card-role', 'stretch-role']]) {
      const c = await rect(card);
      // corners (inside the border radius) and the middle of the free space below the avatar's side
      for (const [x, y] of [[c.x + 12, c.y + 12], [c.x + c.w - 12, c.y + c.h - 12], [c.x + 12, c.y + c.h / 2]]) {
        const r = await press(page, x, y);
        assert.deepEqual(r.clicks, [target], `${card} pressed at ${x},${y}`);
        if (target === 'stretch-button' && commands) assert.ok(r.open, 'the commandfor dialog did not open');
      }
    }
    // the stretch element's own text (data-truncate: overflow hidden does not clip the overlay, which the corners show)
    const b = await rect('stretch-button');
    assert.deepEqual((await press(page, b.x + b.w / 2, b.y + b.h / 2)).clicks, ['stretch-button']);
    // links and buttons inside the card are above the overlay
    for (const id of ['nested-link', 'nested-button']) {
      const n = await rect(id);
      const r = await press(page, n.x + n.w / 2, n.y + n.h / 2);
      assert.deepEqual(r.clicks, [id]);
      assert.ok(!r.open);
    }
    // a busy stretch button keeps position: relative, so its spinner (::after) stays on the button
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('stretch-busy')).position"), 'relative');
    assert.equal(await page.evaluate("getComputedStyle(document.getElementById('stretch-button')).position"), 'static');
  }, 'stretch.html');
});

test('a menu with more items than fit scrolls, and no item shrinks', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    const r = await page.evaluate(`(() => {
      const heights = id => [...document.getElementById(id).children].map(c => Math.round(c.getBoundingClientRect().height * 10) / 10);
      const m = document.getElementById('long');
      return { long: heights('long'), free: heights('free'), scrolls: m.scrollHeight > m.clientHeight + 1, client: m.clientHeight };
    })()`);
    assert.ok(r.scrolls, `the capped menu does not scroll (${r.client}px)`);
    // every row as tall as in the uncapped menu (the divider and the list included)
    assert.deepEqual(r.long, r.free);
  }, 'menu-long.html');
});

test('no browser tap highlight: every element inherits a transparent one', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(390, async page => {
    const colors = await page.evaluate(`[...new Set([...document.querySelectorAll('html, button, a, label, [data-menu] *')].map(e => getComputedStyle(e).webkitTapHighlightColor))]`);
    assert.deepEqual(colors, ['rgba(0, 0, 0, 0)']);
  });
});

test('data-lazy on a container makes its rows skip off-screen work', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    const r = await page.evaluate(`(() => { const l = document.getElementById('lazy'); return [getComputedStyle(l).contentVisibility, getComputedStyle(l.firstElementChild).contentVisibility]; })()`);
    assert.deepEqual(r, ['visible', 'auto']);
  });
});

test('data-gutter reserves the scrollbar gutter, only where it is set', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    const r = await page.evaluate(`['gutter', 'no-gutter'].map(id => getComputedStyle(document.getElementById(id)).scrollbarGutter)`);
    assert.deepEqual(r, ['stable', 'auto']);
  });
});

// sinter sets aria-busy on an action's element while its request runs, and shows a "Loading…" line (aria-busy="true")
// while a resource loads. Nothing shows for a request shorter than --tm-busy-delay (200ms); input is blocked at once.
test('busy states show after a delay, and a dimmed container fades back', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    // goto emulates reduced motion (for steady screenshots); these fades are about normal motion
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const at = ms => new Promise(r => setTimeout(r, ms));
    const state = () => page.evaluate(`(() => {
      const el = id => document.getElementById(id), cs = (id, p) => getComputedStyle(el(id), p);
      return {
        label: cs('save').color, saveEvents: cs('save').pointerEvents, spinner: +cs('save', '::after').opacity,
        itemLabel: cs('item').color, itemSpinner: +cs('item', '::after').opacity,
        form: +cs('form').opacity, loading: +cs('loading').opacity, loadingSpinner: cs('loading', '::before').borderRadius,
      };
    })()`);
    const set = on => page.evaluate(`(() => {
      for (const id of ['save', 'item', 'form']) ${on} ? document.getElementById(id).setAttribute('aria-busy', 'true') : document.getElementById(id).removeAttribute('aria-busy');
      document.getElementById('loading').hidden = !${on};
    })()`);
    // an opaque color, in whatever notation (a held animation value serializes as oklab)
    const opaque = c => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && !/\/ 0(\.0+)?\)$/.test(c);
    const idle = await state();

    await set(true);
    await at(60);
    const early = await state();
    // within the delay: the label stays, no spinner, nothing dimmed, the line not visible yet; clicks blocked already
    assert.ok(opaque(early.label), `the label was hidden at once (${early.label})`);
    assert.equal(early.saveEvents, 'none');
    assert.equal(early.spinner, 0);
    assert.equal(early.itemSpinner, 0);
    assert.equal(early.form, 1);
    assert.equal(early.loading, 0);

    // a request that ended within the delay: nothing was shown and nothing animates back
    await set(false);
    assert.equal(await page.evaluate("document.getElementById('form').getAnimations().length"), 0);

    await set(true);
    await at(500);
    const late = await state();
    assert.ok(!opaque(late.label), `the label shows under the spinner (${late.label})`);
    assert.equal(late.spinner, 1);
    assert.equal(late.itemLabel, idle.itemLabel, 'a busy item keeps its label');
    assert.equal(late.itemSpinner, 0.7);
    assert.equal(late.form, 0.65);
    assert.equal(late.loading, 1);
    assert.equal(late.loadingSpinner, '50%', 'the loading line has a spinner');

    // the request ends: the dimmed form fades back instead of jumping
    await set(false);
    const back = await page.evaluate("(() => { const f = document.getElementById('form'); return { running: f.getAnimations().length, opacity: +getComputedStyle(f).opacity }; })()");
    assert.equal(back.running, 1);
    assert.ok(back.opacity < 1, `the form jumped back to ${back.opacity}`);
    await at(300);
    assert.equal((await state()).form, 1);
  }, 'busy.html');
});

// With reduced motion every animation is forced to 1ms; an infinite spinner then turned 1000 times a second. It pulses.
test('with reduced motion a busy spinner pulses slowly instead of turning', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  await withPage(1280, async page => {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.evaluate("for (const id of ['save', 'item']) document.getElementById(id).setAttribute('aria-busy', 'true'); document.getElementById('loading').hidden = false");
    await new Promise(r => setTimeout(r, 400));
    const sample = () => page.evaluate(`['save', 'item', 'loading'].map(id => {
      const s = getComputedStyle(document.getElementById(id), id == 'loading' ? '::before' : '::after');
      return { duration: s.animationDuration.split(', ')[0], rotate: s.rotate, opacity: +s.opacity };
    })`);
    const seen = [];
    for (let i = 0; i < 8; i++) { seen.push(await sample()); await new Promise(r => setTimeout(r, 90)); }
    for (const [i, id] of ['save', 'item', 'loading'].entries()) {
      const s = seen.map(x => x[i]);
      assert.equal(s[0].duration, '1.4s', `${id}: spinner duration`);
      assert.ok(s.every(x => x.rotate == 'none'), `${id}: the spinner turns`);
      const o = s.map(x => x.opacity);
      assert.ok(Math.max(...o) - Math.min(...o) > 0.1, `${id}: the spinner does not pulse (${o})`);
    }
    // the busy line and spinner still appear (their 1ms fade-in ran after the delay)
    assert.equal(await page.evaluate("+getComputedStyle(document.getElementById('loading')).opacity"), 1);
  }, 'busy.html');
});

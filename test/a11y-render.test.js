// States, tooltip combinations, RTL, forced colors, print and focus in a real browser (fixtures/a11y*.html, served
// over HTTP from the repository root). Skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const skip = !browser && 'no Chrome/Chromium found';
const root = fileURLToPath(new URL('..', import.meta.url));

/** Opens a fixture; `media`: extra emulated media features ({ 'forced-colors': 'active' }) or a media type ({ type: 'print' }). */
async function withPage(fixture, { width = 1280, height = 700, dir, media = {} } = {}, fn) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/${fixture}`, { width, height, scheme: 'light', settle: 100 });
    const { type, ...features } = media;
    await page.send('Emulation.setEmulatedMedia', {
      media: type ?? '',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, ...Object.entries(features).map(([name, value]) => ({ name, value }))],
    });
    // helpers: computed style (of a pseudo-element), a color as [r, g, b, a], WCAG contrast of two opaque colors
    await page.evaluate(`(() => {
      ${dir ? `document.documentElement.dir = '${dir}';` : ''}
      window.$ = id => document.getElementById(id);
      window.cs = (el, pseudo) => getComputedStyle(typeof el == 'string' ? $(el) : el, pseudo);
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      window.rgba = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
      const lum = c => rgba(c).slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      window.contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      window.box = id => { const r = $(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    })()`);
    await new Promise(r => setTimeout(r, 50));
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}

const center = async (page, id) => {
  const r = await page.evaluate(`box('${id}')`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const hover = async (page, id) => {
  const { x, y } = await center(page, id);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await new Promise(r => setTimeout(r, 30));
};

test('a tooltip never moves a positioned element', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    const pos = await page.evaluate(`['badge-tip', 'stretch', 'stretch-tip', 'th-tip'].map(id => cs(id).position)`);
    // the badge gets a containing block for its tooltip; a stretch link stays static (its overlay covers the card);
    // a sticky header stays sticky
    assert.deepEqual(pos, ['relative', 'static', 'static', 'sticky']);
  });
  await withPage('a11y-shell.html', {}, async page => {
    assert.equal(await page.evaluate(`cs('fab').position`), 'fixed');
    const r = await page.evaluate(`box('fab')`);
    assert.ok(Math.abs(r.right - (1280 - 24)) < 1 && Math.abs(r.bottom - (700 - 24)) < 1, `the FAB with a tooltip is not in its corner: ${JSON.stringify(r)}`);
  });
});

test('the tooltip gives way where the ::after is taken', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    const after = id => page.evaluate(`(() => { const s = cs('${id}', '::after'); return { content: s.content, display: s.display, mask: s.maskImage != 'none', radius: s.borderTopLeftRadius, border: s.borderTopWidth, position: s.position, opacity: s.opacity }; })()`);
    // busy: the spinner (a ring), as without a tooltip; the label is transparent, so the button would be blank
    const ring = async id => { const { opacity, ...rest } = await after(id); return rest; }; // the spinner pulses
    assert.deepEqual(await ring('busy-tip'), await ring('busy'));
    assert.equal((await after('busy-tip')).border, '2px');
    assert.notEqual((await after('busy-tip')).display, 'none');
    // a text button that opens a menu keeps its caret
    assert.deepEqual(await after('caret-tip'), await after('caret'));
    assert.ok((await after('caret-tip')).mask);
    // a text button that opens a dialog has no caret: it keeps its tooltip
    assert.equal((await after('modal-tip')).content, '"Opens the editor"');
    // a sort button keeps its arrow
    const sort = await after('sort-tip');
    assert.ok(sort.mask && sort.content === '""' && sort.opacity === '0.35', JSON.stringify(sort));
    // a stretch link keeps its overlay over the whole card
    assert.deepEqual(await after('stretch-tip'), await after('stretch'));
    // an icon button that opens a menu has no caret: it keeps its tooltip, hidden while the menu is open
    assert.equal((await after('menu-tip')).content, '"More"');
    await page.evaluate(`$('icon-tip').focus({ focusVisible: true })`);
    await new Promise(r => setTimeout(r, 300)); // transitions on pseudo-elements keep their duration with reduced motion
    const tip = await after('icon-tip');
    assert.equal(tip.content, '"Edit"');
    assert.equal(tip.opacity, '1');
    await page.evaluate(`$('menu-tip').setAttribute('aria-expanded', 'true')`);
    assert.equal((await after('menu-tip')).display, 'none');
  });
});

test('hover keeps the invalid border and leaves disabled controls alone', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    const read = () => page.evaluate(`({ inv: cs('inv').borderTopColor, field: cs('field').borderTopColor, disField: cs('dis-field').borderTopColor,
      dis: cs('dis').backgroundColor, disOutline: cs('dis-outline').backgroundColor, disMove: cs('dis').transform })`);
    const rest = await read();
    await hover(page, 'inv');
    assert.equal((await read()).inv, rest.inv, 'an invalid field lost its danger border on hover');
    await hover(page, 'field');
    assert.notEqual((await read()).field, rest.field, 'a field shows no hover');
    await hover(page, 'dis-field');
    assert.equal((await read()).disField, rest.disField);
    for (const id of ['dis', 'dis-outline']) {
      await hover(page, id);
      assert.equal((await read())[id === 'dis' ? 'dis' : 'disOutline'], rest[id === 'dis' ? 'dis' : 'disOutline'], `${id} changes on hover`);
    }
    const { x, y } = await center(page, 'dis');
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    const pressed = await read();
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    assert.equal(pressed.disMove, 'none', 'a disabled button moves when pressed');
    assert.equal(pressed.dis, rest.dis);
  });
});

test('checkbox and radio marks contrast with their fill in every tone, light and dark, also when invalid', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    const rows = await page.evaluate(`[...document.querySelectorAll('#marks input')].map(i => {
      const box = i.closest('[data-tm-callout]'), mark = cs(i, '::before');
      const ink = i.type == 'radio' ? mark.borderTopColor : i.indeterminate ? mark.borderBottomColor : mark.borderRightColor;
      return { where: (box.dataset.tmTone || 'default') + ' ' + box.dataset.tmTheme + ' ' + i.type + (i.ariaInvalid ? ' invalid' : '') + (i.indeterminate ? ' mixed' : ''),
        ratio: contrast(ink, cs(i).backgroundColor), ink };
    })`);
    assert.equal(rows.length, 56);
    const low = rows.filter(r => r.ratio < 3).map(r => `${r.where}: ${r.ratio.toFixed(2)}`);
    assert.deepEqual(low, []);
    // the mark does not depend on the container's tone
    const inks = new Set(rows.filter(r => r.where.endsWith('light checkbox')).map(r => r.ink));
    assert.equal(inks.size, 1, [...inks].join(' '));
  });
});

test('a focused data-tm-sr-only element (a skip link) is visible', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    assert.deepEqual(await page.evaluate(`[box('skip').w, box('skip').h]`), [1, 1]);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const r = await page.evaluate(`({ focused: document.activeElement.id, w: box('skip').w, h: box('skip').h, clip: cs('skip').clipPath })`);
    assert.equal(r.focused, 'skip');
    assert.ok(r.w > 50 && r.h > 10, `the focused skip link is ${r.w}×${r.h}`);
    assert.equal(r.clip, 'none');
  });
});

test('RTL: controls, the drawer, toasts and menus mirror', { skip }, async () => {
  for (const dir of ['ltr', 'rtl']) {
    const rtl = dir === 'rtl';
    await withPage('a11y.html', { dir }, async page => {
      await new Promise(r => setTimeout(r, 300)); // the thumb's move to the other side, after dir changed
      const r = await page.evaluate(`({
        thumb: cs('sw', '::before').translate,
        arrow: cs('sel').backgroundPositionX,
        tab: [cs('vtab').borderTopLeftRadius, cs('vtab').borderTopRightRadius, cs('vtab').boxShadow],
      })`);
      // the thumb moves toward the inline end, inside its track
      // (it starts at the inline start: the track is a grid with place-content: center start, which follows dir)
      assert.equal(r.thumb, rtl ? '-16px' : '16px');
      assert.equal(r.arrow, rtl ? 'calc(0% + 14px)' : 'calc(100% - 14px)');
      // a vertical tab is rounded on the start side; the selected one's line is on the end side
      assert.deepEqual(r.tab.slice(0, 2), rtl ? ['0px', '8px'] : ['8px', '0px']);
      assert.match(r.tab[2], rtl ? /\) 2px 0px 0px 0px inset$/ : /\) -2px 0px 0px 0px inset$/);
    });
    await withPage('a11y-shell.html', { dir, width: 390 }, async page => {
      await page.evaluate(`$('rail').showPopover()`);
      await new Promise(r => setTimeout(r, 300));
      const r = await page.evaluate(`({ rail: box('rail'), toasts: box('toasts'), toast: [cs('toast').paddingLeft, cs('toast').paddingRight] })`);
      // the drawer opens on the start side, fully on screen
      if (rtl) assert.ok(Math.abs(r.rail.right - 390) < 1, `RTL drawer at ${r.rail.x}..${r.rail.right}`);
      else assert.ok(Math.abs(r.rail.x) < 1, `drawer at ${r.rail.x}`);
      assert.deepEqual(r.toast, rtl ? ['8px', '16px'] : ['16px', '8px']);
      // a closed drawer sits off the start edge
      await page.evaluate(`$('rail').hidePopover()`);
      await new Promise(r => setTimeout(r, 100));
      assert.equal(await page.evaluate(`cs('rail').translate`), rtl ? '100%' : '-100%');
    });
    await withPage('a11y-shell.html', { dir }, async page => {
      await page.evaluate(`$('menu').showPopover()`);
      const r = await page.evaluate(`({ toasts: box('toasts'), menu: [cs('menu').marginLeft, cs('menu').marginRight], chevron: cs('collapse', '::before').scale })`);
      // toasts in the bottom corner on the inline end
      if (rtl) assert.ok(Math.abs(r.toasts.x - 16) < 1, `RTL toasts at ${r.toasts.x}`);
      else assert.ok(Math.abs(r.toasts.right - (1280 - 16)) < 1, `toasts end at ${r.toasts.right}`);
      // the menu keeps its gap to the screen edge on the side it grows toward
      assert.deepEqual(r.menu, rtl ? ['8px', '0px'] : ['0px', '8px']);
      // the collapse chevron points toward the start edge
      assert.equal(r.chevron, rtl ? '-1 1' : '1');
    });
  }
});

test('forced colors: icons, switches, selected states and focus stay visible', { skip }, async () => {
  await withPage('a11y.html', { media: { 'forced-colors': 'active' } }, async page => {
    const r = await page.evaluate(`(() => {
      const canvas = cs(document.body).backgroundColor;
      const paint = (id, pseudo) => cs(id, pseudo).backgroundColor;
      return {
        canvas,
        icons: { span: paint('icon'), button: paint('icon-tip', '::before'), caret: paint('caret', '::after'), sort: paint('sort', '::after'), close: paint('close', '::before') },
        text: [cs('icon-tip').color, cs('icon').color, cs('caret').color],
        switchTrack: cs('sw-off').borderTopWidth + ' ' + cs('sw-off').borderTopColor,
        thumb: cs('sw-off', '::before').borderTopColor,
        radio: cs(document.querySelector('#marks input[type=radio]'), '::before').borderTopWidth,
        highlight: (() => { const i = document.body.appendChild(document.createElement('i')); i.style.color = 'Highlight'; const c = cs(i).color; i.remove(); return c; })(),
        selected: Object.fromEntries(['vtab', 'pressed', 'row'].map(id => [id, cs(id).outlineStyle + ' ' + cs(id).outlineColor])),
        progress: cs('prog').forcedColorAdjust + ' ' + cs('meter').forcedColorAdjust,
      };
    })()`);
    for (const [k, c] of Object.entries(r.icons)) assert.notEqual(c, r.canvas, `the ${k} icon is painted in the canvas color`);
    // in the (forced) text color of the element that draws them
    assert.deepEqual([r.icons.button, r.icons.span, r.icons.caret], r.text);
    assert.match(r.switchTrack, /^1px /);
    assert.notEqual(r.thumb, r.canvas);
    assert.notEqual(r.radio, '0px');
    // selected, pressed and current: a ring in the selection color (their fill is gone)
    for (const [k, ring] of Object.entries(r.selected)) assert.equal(ring, `solid ${r.highlight}`, `the selected ${k} looks unselected`);
    assert.equal(r.progress, 'none none');
    // a focused menu item shows a ring (its fill is gone in this mode)
    await page.evaluate(`$('m').showPopover(); $('m1').focus({ focusVisible: true })`);
    const ring = await page.evaluate(`[cs('m1').outlineStyle, cs('m1').outlineColor, cs(document.body).backgroundColor]`);
    assert.equal(ring[0], 'solid');
    assert.notEqual(ring[1], ring[2]);
  });
});

test('print: no app chrome, nothing clipped, no shadows', { skip }, async () => {
  await withPage('a11y-shell.html', { media: { type: 'print', 'prefers-color-scheme': 'dark' } }, async page => {
    const r = await page.evaluate(`({
      hidden: ['rail', 'fab', 'toasts'].map(id => cs(id).display),
      tip: cs('fab', '::after').display,
      shell: [cs(document.body).overflow, document.body.getBoundingClientRect().height, innerHeight],
      main: cs('main').overflow,
      shadow: cs('card').boxShadow,
      text: contrast(cs('main').color, 'white'),
    })`);
    assert.deepEqual(r.hidden, ['none', 'none', 'none']);
    assert.equal(r.tip, 'none');
    // a fixed shell grows with its content instead of printing one screen
    assert.equal(r.shell[0], 'visible');
    assert.ok(r.shell[1] > 3000, `the fixed shell is ${r.shell[1]}px tall`);
    assert.equal(r.main, 'visible');
    assert.ok(!/px [1-9]/.test(r.shadow), `a card prints a shadow: ${r.shadow}`);
    // dark mode prints dark text: the paper is white and browsers drop backgrounds
    assert.ok(r.text > 4.5, `text contrast on paper ${r.text}`);
  });
  await withPage('a11y.html', { media: { type: 'print' } }, async page => {
    const r = await page.evaluate(`[cs('scroller').overflowY, cs('th-tip').position]`);
    assert.deepEqual(r, ['visible', 'static']);
  });
});

test('the FAB, the toast region and the rail keep clear of safe-area insets', { skip }, async () => {
  await withPage('a11y-shell.html', {}, async page => {
    const read = () => page.evaluate(`[cs('fab').bottom, cs('fab').right, cs('toasts').bottom, cs('toasts').right, cs('rail').paddingTop, cs('rail').paddingBottom, cs('rail').paddingLeft, cs('rail').width]`);
    // without insets (and in browsers without env()): the plain offsets
    assert.deepEqual(await read(), ['24px', '24px', '16px', '16px', '8px', '8px', '8px', '240px']);
    // a notched phone (viewport-fit=cover); older Chrome has no way to emulate it
    try { await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 40, bottom: 30, left: 20, right: 10 } }); } catch { return; }
    await new Promise(r => setTimeout(r, 50));
    assert.deepEqual(await read(), ['54px', '34px', '46px', '26px', '48px', '38px', '28px', '260px']);
  });
});

test('reduced motion: dialog and drawer backdrops do not fade', { skip }, async () => {
  const read = `(() => { $('dlg').showModal(); const d = cs('dlg', '::backdrop').transitionDuration; $('dlg').close(); return d; })()`;
  await withPage('a11y.html', {}, async page => assert.equal(await page.evaluate(read), '0.001s'));
  await withPage('a11y.html', { media: { 'prefers-reduced-motion': 'no-preference' } }, async page => assert.match(await page.evaluate(read), /^0\.15s/));
  await withPage('a11y-shell.html', { width: 390 }, async page => {
    assert.equal(await page.evaluate(`(() => { $('rail').showPopover(); return cs('rail', '::backdrop').transitionDuration; })()`), '0.001s');
  });
});

// Lists are often rendered from a leading <template> (sinter, frameworks): :first-child would draw a line above the
// first row there. The ~ rule costs a restyle of the list's rows on prepend, which short data-lists can afford.
test('a data-tm-list whose first child is a <template> has no line above its first row', { skip }, async () => {
  await withPage('a11y.html', {}, async page => {
    assert.deepEqual(await page.evaluate(`[cs('row1').borderTopWidth, cs('row2').borderTopWidth]`), ['0px', '1px']);
  });
});

// forms.css in a real browser (fixtures/forms.html, served over HTTP from the repository root): data-field (heights,
// states, RTL), read-only, the required marker, autofill, range and indeterminate progress, forced colors, reduced
// motion and restyle cost; and the checker's vocabulary for it. The browser tests are skipped without Chrome/Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../packages/inspect/lib/cdp.js';
import { checkMarkup, check } from '../lib/check.js';
import { restyled as restyledBy } from './restyled.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const skip = !browser && 'no Chrome/Chromium found';
const root = fileURLToPath(new URL('..', import.meta.url));

/** Opens fixtures/forms.html; `media`: emulated media features, `dir`: the page direction, `motion`: reduce or no-preference. */
async function withPage({ dir, scheme = 'light', motion = 'reduce', media = {} } = {}, fn) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/forms.html`, { width: 1000, height: 800, scheme, settle: 100 });
    await page.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: motion },
      ...Object.entries(media).map(([name, value]) => ({ name, value })),
    ] });
    await page.evaluate(`(() => {
      ${dir ? `document.documentElement.dir = '${dir}';` : ''}
      window.$ = id => document.getElementById(id);
      window.cs = (el, pseudo) => getComputedStyle(typeof el == 'string' ? $(el) : el, pseudo);
      const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
      window.rgba = c => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
      // a color custom property of an element, resolved in its context (light-dark(), color-mix())
      window.resolve = (id, prop) => { const s = document.createElement('span');
        s.setAttribute('style', 'color:' + cs(id).getPropertyValue(prop)); $(id).after(s); const c = cs(s).color; s.remove(); return c; };
      window.box = id => { const r = $(id).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      // pixels of a screenshot (a data URL) at points relative to it
      window.pixels = (url, points) => new Promise(done => {
        const img = new Image();
        img.onload = () => {
          const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }).getContext('2d');
          c.drawImage(img, 0, 0);
          done(points.map(([x, y]) => [...c.getImageData(Math.round(x), Math.round(y), 1, 1).data]));
        };
        img.src = url;
      });
    })()`);
    await new Promise(r => setTimeout(r, 50));
    return await fn(page);
  } finally {
    await b.close();
    srv.close();
  }
}

/** Colors of the element `id` at fractions [fx, fy] of its box, from a real screenshot. */
async function sample(page, id, fractions) {
  const r = await page.evaluate(`box('${id}')`), [sx, sy] = await page.evaluate('[scrollX, scrollY]');
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: r.x + sx, y: r.y + sy, width: r.w, height: r.h, scale: 1 } });
  return page.evaluate(`pixels('data:image/png;base64,${data}', ${JSON.stringify(fractions.map(([fx, fy]) => [Math.min(fx * r.w, r.w - 1), fy * r.h]))})`);
}
const near = (a, b, tolerance = 30) => a.slice(0, 3).reduce((s, v, i) => s + Math.abs(v - b[i]), 0) <= tolerance;
const color = (page, expr) => page.evaluate(`rgba(${expr})`);
const hover = async (page, id) => {
  const r = await page.evaluate(`box('${id}')`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + 4, y: r.y + r.h / 2 });
  await new Promise(r => setTimeout(r, 30));
};

test('data-field is exactly as tall as a plain field, at both densities and every size, in a label and a row', { skip }, async () => {
  await withPage({}, async page => {
    const h = await page.evaluate(`['h', 'hc', 'hs', 'hl'].map(k => [box(k + '-plain').h, box(k + '-field').h])`);
    assert.deepEqual(h, [[40, 40], [32, 32], [32, 32], [48, 48]]);
    const r = await page.evaluate(`({
      grow: box('grow').w, row: box('row').w,
      label: cs('l-field').display, gap: box('lf').y - box('l-field').y, plainGap: box('l-plain').lastElementChild?.y,
      labelW: box('l-field').w, fieldW: box('lf').w,
      button: box('hl-button'), field: box('hl-field'),
    })`);
    assert.ok(r.grow > r.row - 100, `data-grow does not stretch the field in a row: ${r.grow} of ${r.row}`);
    assert.equal(r.label, 'grid', 'a label around a data-field stacks');
    assert.equal(r.fieldW, r.labelW, 'the field fills its label');
    // the button sits inside the border, as far from the end as from the top and bottom
    const top = r.button.y - r.field.y, end = r.field.x + r.field.w - (r.button.x + r.button.w);
    assert.ok(Math.abs(top - end) < 1, `inset ${top} at the top, ${end} at the end`);
    assert.ok(Math.abs(r.button.w - r.button.h) < 1, 'the icon button is square');
  });
});

test('data-field shows focus, hover, invalid and disabled on the whole field', { skip }, async () => {
  await withPage({}, async page => {
    const border = id => color(page, `cs('${id}').borderTopColor`);
    const accent = await color(page, `cs('probe-accent').color`), danger = await color(page, `cs('probe-danger').color`);
    const rest = await border('s-hover');
    // focus: the field, not the bare input inside it
    await page.evaluate(`$('s-focus-input').focus()`);
    await new Promise(r => setTimeout(r, 250)); // the border transition
    assert.ok(near(await border('s-focus'), accent), 'a focused field has the accent border');
    assert.notEqual(await page.evaluate(`cs('s-focus').boxShadow`), 'none');
    assert.equal(await page.evaluate(`cs('s-focus-input').boxShadow`), 'none');
    // hover
    await hover(page, 's-hover');
    await new Promise(r => setTimeout(r, 250));
    assert.ok(!near(await border('s-hover'), rest, 3), 'hover changes the border');
    // invalid: aria-invalid, and :user-invalid once the user has typed and left; also while hovered
    assert.ok(near(await border('s-aria'), danger), 'aria-invalid');
    await hover(page, 's-aria');
    await new Promise(r => setTimeout(r, 250));
    assert.ok(near(await border('s-aria'), danger), 'an invalid field keeps its border on hover');
    await page.evaluate(`$('s-user-input').focus()`);
    await page.send('Input.insertText', { text: 'x' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await page.evaluate(`$('s-user-input').blur()`);
    await new Promise(r => setTimeout(r, 250));
    assert.equal(await page.evaluate(`$('s-user-input').matches(':user-invalid')`), true);
    assert.ok(near(await border('s-user'), danger), ':user-invalid');
    // disabled: dimmed once, as a whole (not the input and its button again)
    const dim = await page.evaluate(`['s-disabled', 's-disabled-input', 's-disabled-button'].map(id => cs(id).opacity)`);
    assert.deepEqual(dim, ['0.5', '1', '1']);
    // a disabled button in an enabled field still dims itself
    await page.evaluate(`$('s-button-button').disabled = true`);
    assert.equal(await page.evaluate(`cs('s-button-button').opacity`), '0.5');
  });
});

test('data-field in RTL: the end button is on the left', { skip }, async () => {
  await withPage({ dir: 'rtl' }, async page => {
    const r = await page.evaluate(`({ button: box('hl-button'), field: box('hl-field') })`);
    assert.ok(r.button.x - r.field.x < 10, `the button is not at the start of the field: ${JSON.stringify(r)}`);
  });
});

test('data-field in forced colors: focus shows as an outline', { skip }, async () => {
  await withPage({ media: { 'forced-colors': 'active' } }, async page => {
    await page.evaluate(`$('s-focus-input').focus()`);
    const r = await page.evaluate(`({ style: cs('s-focus').outlineStyle, width: cs('s-focus').outlineWidth, rest: cs('s-hover').outlineStyle })`);
    assert.deepEqual(r, { style: 'solid', width: '2px', rest: 'none' });
  });
});

test('read-only fields look read-only, and stay focusable and selectable', { skip }, async () => {
  await withPage({}, async page => {
    const fill = await color(page, `cs('probe-fill').color`);
    assert.ok(near(await color(page, `cs('ro').backgroundColor`), fill, 3), 'a readonly input is filled');
    assert.ok(near(await color(page, `cs('s-readonly').backgroundColor`), fill, 3), 'a data-field with a readonly input is filled');
    assert.ok(!near(await color(page, `cs('rw').backgroundColor`), fill, 3), 'an editable input is not');
    const r = await page.evaluate(`(() => { const i = $('ro'); i.focus(); i.setSelectionRange(0, 4);
      return { focused: document.activeElement === i, selected: i.selectionEnd - i.selectionStart, userSelect: cs(i).userSelect }; })()`);
    assert.deepEqual(r, { focused: true, selected: 4, userSelect: 'auto' });
  });
});

test('required fields mark their label with an asterisk that is not read out, on the label text row', { skip }, async () => {
  await withPage({}, async page => {
    const marks = await page.evaluate(`['r-req', 'r-opt', 'r-hint', 'r-field', 'r-check', 'r-radio', 'r-for', 'r-for-opt', 'r-for-plain'].map(id => cs(id, '::after').content)`);
    assert.deepEqual(marks, ['"*" / ""', 'none', '"*" / ""', '"*" / ""', '"*" / ""', 'none', '"*" / ""', 'none', '"*" / ""']);
    // on the first row: a required label is as tall as an optional one, and the field still fills the label
    const h = await page.evaluate(`[box('r-req').h, box('r-opt').h, $('r-hint').querySelector('input').getBoundingClientRect().width, box('r-hint').w]`);
    assert.equal(h[0], h[1]);
    assert.equal(h[2], h[3]);
    // the accessible names have no asterisk (the field itself is announced as required)
    const { nodes } = await page.send('Accessibility.getFullAXTree');
    const names = nodes.filter(n => n.role?.value === 'textbox' || n.role?.value === 'checkbox').map(n => n.name?.value ?? '');
    assert.ok(names.includes('Name') && names.includes('I agree'), JSON.stringify(names));
    assert.deepEqual(names.filter(n => n.includes('*')), []);
  });
});

for (const scheme of ['light', 'dark']) {
  test(`autofill: the theme's tint instead of the browser's color (${scheme})`, { skip }, async t => {
    await withPage({ scheme }, async page => {
      const r = await page.evaluate(`box('cc-number')`);
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: r.x + 5, y: r.y + 5, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, 800));
      await page.send('DOM.getDocument');
      const { result } = await page.send('Runtime.evaluate', { expression: `$('cc-number')` });
      const { node } = await page.send('DOM.describeNode', { objectId: result.objectId });
      try {
        await page.send('Autofill.trigger', { fieldId: node.backendNodeId, card: { number: '4444444444444444', name: 'Ada Lovelace', expiryMonth: '01', expiryYear: '2030', cvc: '123' } });
      } catch (e) { t.skip(`this Chrome cannot autofill: ${e.message}`); return; }
      await new Promise(r => setTimeout(r, 300));
      assert.equal(await page.evaluate(`$('cc-number').matches(':autofill')`), true);
      const [field, plain] = await sample(page, 'cc-field', [[0.5, 0.5]]).then(async a => [a[0], (await sample(page, 'cc-name', [[0.9, 0.5]]))[0]]);
      const tint = await color(page, `resolve('cc-field', '--_af')`);
      assert.ok(near(field, tint, 6) && near(plain, tint, 6), `autofilled fields ${field} ${plain}, tint ${tint}`);
      if (scheme === 'dark') assert.ok(tint[0] + tint[1] + tint[2] < 150, `a dark tint in dark mode: ${tint}`);
      else assert.ok(!near(tint, [232, 240, 254], 3), "the browser's own color");
    });
  });
}

test('range: the track is filled up to the thumb, mirrored in RTL; disabled and forced colors', { skip }, async () => {
  for (const dir of ['ltr', 'rtl']) {
    await withPage({ dir }, async page => {
      const on = await color(page, `resolve('range', '--_on')`), off = await color(page, `resolve('range', '--_off')`);
      const knob = await color(page, `resolve('range', '--_knob')`);
      // value 25 of 100: the thumb (1.25rem) is centered at 10 + 0.25 * (400 - 20) = 105px from the start
      const at = x => dir === 'ltr' ? x / 400 : 1 - x / 400;
      const [start, end, center] = await sample(page, 'range', [[at(40), 0.5], [at(300), 0.5], [at(105), 0.5]]);
      assert.ok(near(start, on), `${dir}: filled part ${start}, expected ${on}`);
      assert.ok(near(end, off), `${dir}: rest of the track ${end}, expected ${off}`);
      assert.ok(near(center, knob), `${dir}: thumb center ${center}, expected ${knob}`);
    });
  }
  await withPage({}, async page => {
    assert.deepEqual(await page.evaluate(`[cs('range').appearance, cs('range-disabled').opacity]`), ['none', '0.5']);
  });
  await withPage({ media: { 'forced-colors': 'active' } }, async page => {
    const r = await page.evaluate(`['--_on', '--_off', '--_knob'].map(p => cs('range').getPropertyValue(p).trim()).concat(cs('range').forcedColorAdjust)`);
    assert.deepEqual(r, ['Highlight', 'GrayText', 'Canvas', 'none']);
  });
});

test('indeterminate progress: a sweeping segment; it stands still in the middle under reduced motion', { skip }, async () => {
  await withPage({}, async page => {
    const r = await page.evaluate(`[cs('indeterminate').animationName, cs('determinate').animationName, cs('indeterminate').backgroundPositionX]`);
    assert.deepEqual(r, ['none', 'none', '50%']);
    const tone = await color(page, `resolve('indeterminate', '--tm-tone')`), fill = await color(page, `cs('probe-fill').color`);
    const [edge, middle] = await sample(page, 'indeterminate', [[0.05, 0.5], [0.5, 0.5]]);
    assert.ok(near(middle, tone) && near(edge, fill), `middle ${middle} (tone ${tone}), edge ${edge} (fill ${fill})`);
  });
  for (const dir of ['ltr', 'rtl']) {
    await withPage({ dir, motion: 'no-preference' }, async page => {
      // early in the sweep the segment is before the middle: left of it, or right of it in RTL
      // the animation is set to 0.15s, not paused where it happens to be: on a busy machine it has already run for a while
      const r = await page.evaluate(`(() => { const p = $('indeterminate'), a = p.getAnimations()[0]; a.pause(); a.currentTime = 150;
        return [cs(p).animationName, parseFloat(cs(p).backgroundPositionX)]; })()`);
      assert.equal(r[0], 'tm-sweep');
      assert.ok(dir === 'ltr' ? r[1] < 50 : r[1] > 50, `${dir}: background-position-x ${r[1]}`);
    });
  }
});

// (core.css) A list-box select paints its checked options with an accent tint, but a focused one is the browser's:
// Chrome and Firefox then force the selection's text color (white, !important in the UA sheet) over the tint.
const listBox = `document.body.insertAdjacentHTML('beforeend', '<select multiple size="3" id="lb" style="inline-size: 12rem">'
  + '<option selected id="lb-on">Selected option</option><option id="lb-off">Other</option></select>')`;
const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrastOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('list-box select: a checked option stays readable, focused or not, light and dark', { skip }, async () => {
  for (const scheme of ['light', 'dark']) {
    await withPage({ scheme }, async page => {
      await page.evaluate(listBox);
      for (const focused of [false, true]) {
        if (focused) await page.evaluate(`$('lb').focus()`);
        // the row's background at its end, and the strongest contrast along the text
        const px = await sample(page, 'lb-on', [...Array.from({ length: 60 }, (_, i) => [0.03 + i * 0.01, 0.5]), [0.97, 0.5]]);
        const bg = px.pop(), best = Math.max(...px.map(p => contrastOf(p, bg)));
        assert.ok(best >= 3, `${scheme}, ${focused ? 'focused' : 'not focused'}: text contrast ${best.toFixed(2)}`);
      }
    });
  }
});

test('selects in forced colors: the native arrow, and checked options in the system selection colors', { skip }, async () => {
  for (const scheme of ['light', 'dark']) {
    await withPage({ scheme, media: { 'forced-colors': 'active' } }, async page => {
      await page.evaluate(listBox + `; document.body.insertAdjacentHTML('beforeend', '<select id="dd"><option>One</option></select>')`);
      // the gradient arrow and tint are dropped in this mode: the arrow vanished, the checked text was unreadable
      assert.deepEqual(await page.evaluate(`[cs('dd').appearance, cs('lb').appearance]`), ['auto', 'auto']);
      const px = await sample(page, 'lb-on', [...Array.from({ length: 60 }, (_, i) => [0.03 + i * 0.01, 0.5]), [0.97, 0.5]]);
      const bg = px.pop(), best = Math.max(...px.map(p => contrastOf(p, bg)));
      const [other] = await sample(page, 'lb-off', [[0.97, 0.5]]);
      assert.ok(best >= 3, `${scheme}: checked option text contrast ${best.toFixed(2)}`);
      assert.ok(!near(bg, other), `${scheme}: the checked option ${bg} looks like an unchecked one ${other}`);
    });
  }
});

// The :has() rules of data-field must not make ordinary pages slower (see perf.test.js for how this is measured).
test('a page with forms.css: adding a row, focusing or disabling a plain field restyles a few elements', { skip }, async () => {
  await withPage({}, async page => {
    const restyled = expression => restyledBy(page, expression);
    const counts = {
      append: await restyled(`(() => { const c = $('ul'); c.append(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`),
      prepend: await restyled(`(() => { const c = $('inputs'); c.prepend(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`),
      focus: await restyled(`(() => { $('inputs').children[100].querySelector('input').focus(); return document.body.offsetHeight; })()`),
      disable: await restyled(`(() => { $('inputs').children[150].querySelector('input').disabled = true; return document.body.offsetHeight; })()`),
      field: await restyled(`(() => { $('s-focus-input').focus(); return document.body.offsetHeight; })()`),
    };
    assert.ok(counts.append >= 1, `no UpdateLayoutTree events traced: ${JSON.stringify(counts)}`);
    assert.deepEqual(Object.entries(counts).filter(([, n]) => n > 20), [], `restyled elements per change: ${JSON.stringify(counts)}`);
  });
});

test('checker: data-field is a boolean on a div or span, and needs forms.css', () => {
  const codes = (m, o) => checkMarkup(m, 'a.html', o).map(d => d.code);
  assert.deepEqual(codes('<div data-field><span data-icon="search"></span><input type="search" aria-label="Search"></div>', { modules: new Set(['core', 'forms']) }), []);
  assert.deepEqual(codes('<label>Amount <span data-field><input><span>€</span></span></label>'), []);
  assert.deepEqual(codes('<div data-field><input aria-label="q"></div>', { modules: new Set(['core']) }), ['TM110']);
  assert.match(checkMarkup('<div data-field><input aria-label="q"></div>', 'a.html', { modules: new Set(['core']) })[0].message, /import '@tiaforge-ui\/temper\/forms\.css'/);
  assert.deepEqual(codes('<p data-field>x</p>'), ['TM108']);
  assert.deepEqual(codes('<div data-field="true"><input aria-label="q"></div>'), ['TM102']);
  const page = fileURLToPath(new URL('../kitchen-sink/forms.html', import.meta.url));
  assert.deepEqual(check([page]).filter(d => d.severity === 'error'), []);
});

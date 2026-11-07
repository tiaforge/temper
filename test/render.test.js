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

async function withPage(width, fn) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/layout.html`, { width, height: 700, scheme: 'light', settle: 100 });
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
    opener: box('open').left,
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
  }
  // there is room: the menu starts under its button
  assert.ok(Math.abs(wide.menu.left - wide.opener) < 1, `menu at ${wide.menu.left}, button at ${wide.opener}`);
  // no room on a phone: the menu stays inside the screen with a gap on both sides
  assert.ok(narrow.menu.left >= 4 && narrow.viewport - narrow.menu.right >= 4, `menu ${narrow.menu.left}..${narrow.menu.right} of ${narrow.viewport}`);
});

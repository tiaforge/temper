// Runtime cost of the CSS in a real browser (fixtures/perf.html, every module loaded), measured in restyled elements
// (the elementCount of Chrome's UpdateLayoutTree trace events), not milliseconds, so a slow machine cannot fail it.
// Plus two behaviors that came with performance and size changes: icon overrides and reduced motion on pseudo-elements.
// Skipped when no Chrome/Chromium is installed.
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
const skip = !browser && 'no Chrome/Chromium found';

async function withPage(fn, { fixture = 'perf.html', motion = 'reduce' } = {}) {
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
    await page.goto(`http://127.0.0.1:${srv.address().port}/test/fixtures/${fixture}`, { width: 1280, height: 700, scheme: 'light', settle: 100 });
    if (motion !== 'reduce') await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
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

// A positional pseudo-class (:nth-child, :last-child, ...) or a sibling combinator in the subject compound of a rule
// with nothing else to filter on is tried on every element, which marks every parent: then one child added anywhere
// restyles all its siblings (data-layout="split" did this: a 3,000-row list, 13-17 ms per append instead of 0.3).
// Each container holds 300 children; one change should restyle a handful of elements, not hundreds.
test('adding or removing one child restyles only a few elements, in any container', { skip }, async () => {
  await withPage(async page => {
    const ops = {
      append: id => `(() => { const c = document.getElementById('${id}'); c.append(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`,
      prepend: id => `(() => { const c = document.getElementById('${id}'); c.prepend(c.lastElementChild.cloneNode(true)); return document.body.offsetHeight; })()`,
      remove: id => `(() => { document.getElementById('${id}').firstElementChild.remove(); return document.body.offsetHeight; })()`,
    };
    // data-list draws a line above every row after the first (a ~ combinator inside the list): prepending to one
    // restyles that list's rows, by design, but appending and removing do not, and other containers are not affected
    const cases = [...['ul', 'div', 'tbody', 'checks', 'toasts'].flatMap(id => Object.keys(ops).map(op => [id, op])), ['list', 'append']];
    const counts = {};
    for (const [id, op] of cases) counts[`${op} ${id}`] = await restyled(page, ops[op](id));
    // the trace has to work at all: a change restyles at least the new element
    assert.ok(counts['append ul'] >= 1, `no UpdateLayoutTree events traced: ${JSON.stringify(counts)}`);
    const tooMany = Object.entries(counts).filter(([, n]) => n > 20);
    assert.deepEqual(tooMany, [], `restyled elements per change: ${JSON.stringify(counts)}`);
  });
});

test('data-layout="split": the first child is the sidebar and the last the content, <template> children skipped', { skip }, async () => {
  await withPage(async page => {
    const flex = await page.evaluate(`['side', 'middle', 'content', 'side2', 'content2'].map(id => {
      const s = getComputedStyle(document.getElementById(id));
      return s.flex + ' / ' + s.minInlineSize;
    })`);
    assert.deepEqual(flex, ['1 1 256px / auto', '0 1 auto / auto', '999 1 0px / 60%', '1 1 256px / auto', '999 1 0px / 60%']);
    // the layout follows the children when they change
    const after = await page.evaluate(`(() => {
      const s = document.getElementById('split2');
      s.append(Object.assign(document.createElement('aside'), { id: 'extra' }));
      const f = id => getComputedStyle(document.getElementById(id)).flex;
      return [f('content2'), f('extra')];
    })()`);
    assert.deepEqual(after, ['0 1 auto', '999 1 0px']);
  });
});

// icons.css writes each image once, as the fallback of --tm-icon-<name> in the [data-icon] rule; the property stays an input
test('icons: --tm-icon-<name> replaces a default icon or adds one; an unlayered rule (the Vite plugin) replaces a default', { skip }, async () => {
  await withPage(async page => {
    const icon = id => `getComputedStyle(document.getElementById('${id}')).maskImage`;
    const r = await page.evaluate(`(() => {
      const before = [${icon('mail')}, ${icon('rocket')}];
      const style = document.head.appendChild(document.createElement('style'));
      style.textContent = ':root { --tm-icon-mail: url("data:image/svg+xml,mine"); --tm-icon-rocket: url("data:image/svg+xml,rocket"); } [data-icon="rocket"] { --_icon: var(--tm-icon-rocket); }';
      const own = [${icon('mail')}, ${icon('rocket')}];
      style.textContent = ':where([data-icon="mail"]) { --_icon: var(--tm-icon-mail, url("data:image/svg+xml,folder")); }';
      const folder = ${icon('mail')};
      return { before, own, folder };
    })()`);
    assert.match(r.before[0], /^url\("data:image\/svg\+xml,.*rect/, 'the default mail icon');
    assert.equal(r.before[1], 'none', 'rocket is not a default icon');
    assert.deepEqual(r.own, ['url("data:image/svg+xml,mine")', 'url("data:image/svg+xml,rocket")']);
    assert.equal(r.folder, 'url("data:image/svg+xml,folder")');
  });
});

// pseudo-elements are not allowed inside :where(), so :where(*, ::before, ::after) only ever matched elements
test('reduced motion also shortens the transitions of pseudo-elements; they keep content-box sizing', { skip }, async () => {
  const probe = `(() => {
    const s = getComputedStyle(document.querySelector('#details summary'), '::after');
    return { duration: s.transitionDuration, boxSizing: s.boxSizing, element: getComputedStyle(document.getElementById('details')).boxSizing };
  })()`;
  assert.deepEqual(await withPage(page => page.evaluate(probe)), { duration: '0.001s', boxSizing: 'content-box', element: 'border-box' });
  assert.deepEqual(await withPage(page => page.evaluate(probe), { motion: 'no-preference' }), { duration: '0.15s', boxSizing: 'content-box', element: 'border-box' });
});

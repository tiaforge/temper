// The inspector against its fixtures, served over HTTP from the repository root (they load ../../../../src/all.css):
// every check fires on broken.html, rows.html is clean, and state.html's dialogs are opened through their openers.
// Skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect, format } from '../lib/inspect.js';
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

test('fixtures: every check on broken.html, a clean page, dialogs opened through their openers', { skip: !browser && 'no Chrome/Chromium found' }, async () => {
  const { srv, base } = await serve();
  // A temp dir of its own: other test files launch browsers in parallel, and their profiles would show up in a shared one.
  const tmp = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prevTmp = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  try {
    const { findings } = await inspect(['broken', 'rows', 'state'].map(f => `${base}${f}.html`), { settle: 200 });
    const of = (file, state = 'page') => findings.filter(f => f.url.endsWith(file) && f.state === state);
    const codes = list => [...new Set(list.map(f => `${f.severity} ${f.code}`))].sort();
    const all = ['1280 light', '1280 dark', '390 light', '390 dark'];

    // broken.html: overflow, contrast (light mode only: #bbb on white), unlabeled icon button, placeholder-only field,
    // image without alt, a button covered by a pseudo-element, and a dialog with margin: 0 stuck in the corner
    assert.deepEqual(codes(of('broken.html')), ['error alt', 'error contrast', 'error label', 'error overflow', 'warning covered', 'warning label']);
    const contrast = of('broken.html').find(f => f.code === 'contrast');
    assert.match(contrast.selector, /^p\.faint/);
    assert.deepEqual(contrast.where.sort(), ['1280 light', '390 light']);
    assert.deepEqual(of('broken.html').find(f => f.code === 'overflow').where.length, all.length);
    assert.deepEqual(codes(of('broken.html', 'dialog dialog#d1')), ['error position', 'warning state']);

    // rows.html: a form dialog and a menu popover, both opened by clicking their button; no errors or warnings anywhere
    assert.deepEqual(findings.filter(f => f.url.endsWith('rows.html') && f.severity !== 'info'), []);
    assert.deepEqual(of('rows.html', 'dialog dialog#f').map(f => `${f.code} ${f.selector}`), ['opened button "Open form"']);
    assert.deepEqual(of('rows.html', 'popover div#m').map(f => f.code), ['opened']);

    // state.html: the detail dialog is opened by its card button (so its content is filled in by the app), the nested
    // confirm dialog through the detail dialog's button, and the orphan dialog directly, with a warning that it is empty
    assert.deepEqual(of('state.html', 'dialog dialog#detail').map(f => `${f.severity} ${f.code}`), ['info opened']);
    assert.match(of('state.html', 'dialog dialog#confirm').find(f => f.code === 'opened').selector, /^#detail button/);
    assert.deepEqual(codes(of('state.html', 'dialog dialog#orphan')), ['warning state']);
    assert.deepEqual(findings.filter(f => f.url.endsWith('state.html') && f.severity === 'error'), []);

    // the text report: grouped by page and state, infos hidden unless verbose
    const text = format(findings, { allWhere: all });
    assert.match(text, /broken\.html\n  page\n    error overflow: div\.wide/);
    assert.match(text, /\[1280 light, 390 light\]/);
    assert.doesNotMatch(text, /rows\.html/);
    assert.match(text, /5 error\(s\), 4 warning\(s\) \(\d+ info hidden/);
    assert.match(format(findings, { allWhere: all, verbose: true }), /rows\.html\n  dialog dialog#f\n    info opened/);
    // the browser profile is removed (also when the browser is a Flatpak, whose /tmp is not ours)
    assert.deepEqual(readdirSync(tmp), []);
  } finally {
    if (prevTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prevTmp;
    rmSync(tmp, { recursive: true, force: true });
    srv.close();
  }
});

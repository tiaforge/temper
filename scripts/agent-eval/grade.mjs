// Agent eval grader: node scripts/agent-eval/grade.mjs <run dir>... [--json]
// Each run dir holds the ten pages of tasks.md (01-event-form.html, …), which load the library from /lib/… (this
// server maps /lib/ to the repository's dist/, so a page writes <link rel="stylesheet" href="/lib/all.css">). Every
// page is opened in headless Chrome at 1024×768, in light and dark mode, and measured: colours (as painted, through a
// canvas), contrast, hue, alignment, sizes, gaps, accessible names. A task is fully correct when all its checks pass.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from '../../packages/inspect/lib/cdp.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const json = args.includes('--json');
const runs = args.filter(a => !a.startsWith('--')).map(d => resolve(d));
if (!runs.length) { console.error('usage: node scripts/agent-eval/grade.mjs <run dir>... [--json]'); process.exit(2); }

export const TASKS = ['01-event-form', '02-delete-confirm', '03-outline-danger', '04-invalid-field', '05-toolbar',
  '06-status-badges', '07-settings-switches', '08-dark-mode', '09-brand-color', '10-exact-spacing'];

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

// In the page: measuring helpers. Colours are painted on a canvas and read back, so any CSS colour syntax counts
// as drawn; hue is OKLCH's.
const HELPERS = `(() => {
  const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const rgba = c => { g.clearRect(0, 0, 1, 1); g.fillStyle = 'rgba(0,0,0,0)'; g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
  const over = (top, under) => { const a = top[3] / 255; return [0, 1, 2].map(i => Math.round(top[i] * a + under[i] * (1 - a))).concat(255); };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hue = c => { // sRGB → OKLab → hue in degrees, and chroma
    const [r, gg, b] = c.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360, c: Math.hypot(A, B) };
  };
  // the background an element is painted on: its own and its ancestors' backgrounds, composited
  const bg = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3]) layers.push(c); if (c[3] === 255) break; }
    let out = [255, 255, 255, 255]; if (!layers.length || layers.at(-1)[3] < 255) out = matchMedia('(prefers-color-scheme: dark)').matches ? [0, 0, 0, 255] : [255, 255, 255, 255];
    for (const l of layers.reverse()) out = over(l, out); return out; };
  const fg = el => over(rgba(getComputedStyle(el).color), bg(el));
  const box = el => el.getBoundingClientRect();
  const name = el => { if (!el) return '';
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    const by = el.getAttribute('aria-labelledby'); if (by) return by.split(/\\s+/).map(i => document.getElementById(i)?.textContent ?? '').join(' ').trim();
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return l.textContent.trim(); }
    const wrap = el.closest('label'); if (wrap) return wrap.textContent.trim();
    if (/^(BUTTON|A)$/.test(el.tagName)) return el.textContent.trim() || el.title;
    return el.title || ''; };
  const red = c => { const { h, c: ch } = hue(c); return ch > 0.06 && (h < 45 || h > 340); };
  // the colour an element shows: the most chromatic of its fill, its text and its border (a soft badge's colour is
  // its text, a solid button's its fill, an outline button's its border)
  const tint = el => { const s = getComputedStyle(el); const cs = [bg(el), fg(el)]; if (parseFloat(s.borderTopWidth) >= 1) cs.push(over(rgba(s.borderTopColor), bg(el)));
    return cs.sort((a, b) => hue(b).c - hue(a).c)[0]; };
  return { rgba, contrast, hue, bg, fg, box, name, red, lum, tint };
})()`;

// Each check: [description, page function returning true/false]; functions run in the page with $ = id lookup and
// H = HELPERS, in the scheme named (both: once in light and once in dark, two checks).
const both = (label, fn) => [[label + ' (light)', fn, 'light'], [label + ' (dark)', fn, 'dark']];
const CHECKS = {
  '01-event-form': [
    ['every field and button exists and has a name', `['title','start','end','calendar','notes','save','cancel'].every(i => $(i) && H.name($(i)))`],
    ['the title is required', `$('title').required`],
    ['the calendar offers Personal, Work, Family', `['Personal','Work','Family'].every(t => [...$('calendar').options].some(o => o.text.trim() === t))`],
    ['Save submits the form', `$('save').type === 'submit' && !!$('save').form`],
    ...both('Save is filled, with readable text', `H.rgba(getComputedStyle($('save')).backgroundColor)[3] > 0 && H.contrast(H.fg($('save')), H.bg($('save'))) >= 4.5`),
    ['Cancel is less prominent than Save', `H.contrast(H.bg($('cancel')), H.bg($('save').parentElement)) < H.contrast(H.bg($('save')), H.bg($('save').parentElement))`],
    // a row of fields side by side (start and end, as temper's form recipe does) counts once, by its first field
    ['the rows of fields start at one x', `(() => { const rows = new Map(); for (const i of ['title','start','end','calendar','notes']) { const b = H.box($(i)); const k = Math.round(b.top); rows.set(k, Math.min(rows.get(k) ?? Infinity, b.left)); } return new Set([...rows.values()].map(Math.round)).size === 1; })()`],
    ['the fields are evenly spaced', `(() => { const b = ['title','start','end','calendar','notes'].map(i => H.box($(i))).sort((x, y) => x.top - y.top); const gaps = b.slice(1).map((x, i) => x.top - b[i].bottom); return Math.max(...gaps) - Math.min(...gaps) <= 2 || new Set(b.map(x => x.top)).size < 5 && Math.max(...gaps) >= 0; })()`],
    ['Save and Cancel sit in one row', `Math.abs((H.box($('save')).top + H.box($('save')).bottom) - (H.box($('cancel')).top + H.box($('cancel')).bottom)) <= 4`],
    ['the buttons sit at the end of the form', `Math.max(H.box($('save')).right, H.box($('cancel')).right) >= H.box($('save').form).right - parseFloat(getComputedStyle($('save').form).paddingRight) - 2`],
    ['nothing overflows sideways', `document.documentElement.scrollWidth <= innerWidth`],
  ],
  '02-delete-confirm': [
    ['the dialog is open and modal', `$('confirm')?.matches(':modal')`],
    ['the dialog has a name', `!!(H.name($('confirm')) || $('confirm').querySelector('h1,h2,h3')?.id && $('confirm').getAttribute('aria-labelledby'))`],
    ...both('Delete is red', `H.red(H.tint($('delete')))`),
    ...both('Delete has readable text', `H.contrast(H.fg($('delete')), H.bg($('delete'))) >= 4.5`),
    ['Cancel exists and has a name', `!!$('keep') && !!H.name($('keep'))`],
    ['Delete and Cancel sit in one row', `Math.abs((H.box($('delete')).top + H.box($('delete')).bottom) - (H.box($('keep')).top + H.box($('keep')).bottom)) <= 4`],
    ['the buttons sit at the end of the dialog', `Math.max(H.box($('delete')).right, H.box($('keep')).right) >= H.box($('confirm')).right - parseFloat(getComputedStyle($('confirm')).paddingRight) - parseFloat(getComputedStyle($('confirm')).borderRightWidth) - 2`],
    ['the dialog is centred', `Math.abs((H.box($('confirm')).left + H.box($('confirm')).right) / 2 - innerWidth / 2) <= 2`],
  ],
  '03-outline-danger': [
    ['the button has no fill', `H.rgba(getComputedStyle($('remove')).backgroundColor)[3] === 0`],
    ...both('its border is red and visible', `parseFloat(getComputedStyle($('remove')).borderTopWidth) >= 1 && H.red(H.rgba(getComputedStyle($('remove')).borderTopColor))`),
    ...both('its text is red', `H.red(H.fg($('remove')))`),
    ...both('its text is readable', `H.contrast(H.fg($('remove')), H.bg($('remove'))) >= 4.5`),
  ],
  '04-invalid-field': [
    ['the field is marked invalid', `$('email').getAttribute('aria-invalid') === 'true'`],
    ['the field points to its message', `($('email').getAttribute('aria-describedby') ?? '').split(/\\s+/).includes('email-error') || ($('email').getAttribute('aria-errormessage') === 'email-error')`],
    ['the field is labelled Email', `/^Email\\b/.test(H.name($('email')))`],
    ['the field holds ada@', `$('email').value === 'ada@'`],
    ...both('the field shows red', `H.red(H.rgba(getComputedStyle($('email')).borderTopColor)) || H.red(H.rgba(getComputedStyle($('email')).outlineColor)) && getComputedStyle($('email')).outlineStyle !== 'none'`),
    ...both('the message is red', `H.red(H.fg($('email-error')))`),
    ...both('the message is readable', `H.contrast(H.fg($('email-error')), H.bg($('email-error'))) >= 4.5`),
    ['the message is under the field', `H.box($('email-error')).top >= H.box($('email')).bottom - 1`],
  ],
  '05-toolbar': [
    ['everything sits in one row, centred', `(() => { const c = ['search','new','refresh'].map(i => (H.box($(i)).top + H.box($(i)).bottom) / 2); return Math.max(...c) - Math.min(...c) <= 2; })()`],
    ['the search field takes the space left', `H.box($('search')).width >= H.box($('toolbar')).width - H.box($('new')).width - H.box($('refresh')).width - 64`],
    ['search and refresh have names', `!!H.name($('search')) && !!H.name($('refresh'))`],
    ['the refresh button is square', `Math.abs(H.box($('refresh')).width - H.box($('refresh')).height) <= 1`],
    ...both('New message is filled, with readable text', `H.rgba(getComputedStyle($('new')).backgroundColor)[3] > 0 && H.contrast(H.fg($('new')), H.bg($('new'))) >= 4.5`),
    ['nothing overflows sideways', `document.documentElement.scrollWidth <= innerWidth`],
  ],
  '06-status-badges': [
    ...both('Paid is green', `(() => { const c = H.tint($('paid')); const { h, c: ch } = H.hue(c); return ch > 0.04 && h > 110 && h < 175; })()`),
    ...both('Due soon is yellow or orange', `(() => { const c = H.tint($('due')); const { h, c: ch } = H.hue(c); return ch > 0.04 && h >= 45 && h <= 110; })()`),
    ...both('Overdue is red', `H.red(H.tint($('overdue')))`),
    ...both('every badge is readable', `['paid','due','overdue'].every(i => H.contrast(H.fg($(i)), H.bg($(i))) >= 4.5)`),
    ['the badges are the same height', `new Set(['paid','due','overdue'].map(i => Math.round(H.box($(i)).height))).size === 1`],
    ['the badges sit side by side', `(() => { const b = ['paid','due','overdue'].map(i => H.box($(i))); return Math.abs(b[0].top - b[2].top) <= 2 && b[0].right <= b[1].left && b[1].right <= b[2].left; })()`],
  ],
  '07-settings-switches': [
    ['three switches', `['notify','sounds','digest'].every(i => $(i)?.type === 'checkbox' || $(i)?.getAttribute('role') === 'switch')`],
    ['on, off, on', `['notify','sounds','digest'].map(i => $(i).checked ?? $(i).getAttribute('aria-checked') === 'true').join() === 'true,false,true'`],
    ['each switch is named by its label', `[['notify','Email notifications'],['sounds','Play sounds'],['digest','Weekly digest']].every(([i, t]) => H.name($(i)).includes(t))`],
    ['each label is on its switch’s row', `[['notify','Email notifications'],['sounds','Play sounds'],['digest','Weekly digest']].every(([i, t]) => { const l = [...document.querySelectorAll('label, span, div, p')].find(e => e.childElementCount === 0 && e.textContent.trim() === t) ?? [...document.querySelectorAll('label')].find(e => e.textContent.includes(t)); const a = H.box($(i)), b = l.getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= Math.max(a.height, 12); })`],
    ['the switches line up', `new Set(['notify','sounds','digest'].map(i => Math.round(H.box($(i)).right))).size === 1`],
    ['the switches sit at the end of the rows', `['notify','sounds','digest'].every(i => H.box($(i)).left > innerWidth / 3 || H.box($(i)).right >= H.box($(i).closest('label, div, li, section, form, fieldset')).right - 32)`],
  ],
  '08-dark-mode': [
    ['the card is light in light mode', `H.lum(H.bg($('card'))) > 0.7`, 'light'],
    ['the card is dark in dark mode', `H.lum(H.bg($('card'))) < 0.1`, 'dark'],
    ['the page is dark in dark mode', `H.lum(H.bg(document.body)) < 0.1`, 'dark'],
    ...both('the card’s text is readable', `[...$('card').querySelectorAll('h1,h2,h3,p')].every(e => H.contrast(H.fg(e), H.bg(e)) >= 4.5)`),
    ...both('the link is readable', `H.contrast(H.fg($('open')), H.bg($('open'))) >= 4.5`),
  ],
  '09-brand-color': [
    ...both('Create event is teal', `(() => { const { h, c } = H.hue(H.tint($('create'))); return c > 0.05 && h >= 160 && h <= 215; })()`),
    ...both('Create event is readable', `H.contrast(H.fg($('create')), H.bg($('create'))) >= 4.5`),
    ...both('Learn more is teal', `(() => { const { h, c } = H.hue(H.fg($('learn'))); return c > 0.05 && h >= 160 && h <= 215; })()`),
    ...both('Learn more is readable', `H.contrast(H.fg($('learn')), H.bg($('learn'))) >= 4.5`),
  ],
  '10-exact-spacing': [
    ['the cards sit in one row', `Math.abs(H.box($('a')).top - H.box($('c')).top) <= 1 && H.box($('a')).right <= H.box($('b')).left && H.box($('b')).right <= H.box($('c')).left`],
    ['16px between a and b', `Math.abs(H.box($('b')).left - H.box($('a')).right - 16) <= 0.5`],
    ['16px between b and c', `Math.abs(H.box($('c')).left - H.box($('b')).right - 16) <= 0.5`],
    ['24px of padding inside each card', `['a','b','c'].every(i => ['Top','Right','Bottom','Left'].every(s => Math.abs(parseFloat(getComputedStyle($(i))['padding' + s]) - 24) <= 0.5))`],
  ],
};

async function serve(dir) {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = path.startsWith('/lib/') ? join(root, 'dist', path.slice(5)) : join(dir, path);
    try { res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return srv;
}

const browserCmd = findBrowser();
const results = [];
for (const dir of runs) {
  const srv = await serve(dir);
  const b = await launch(browserCmd);
  const run = { run: basename(dir), tasks: [], classes: new Set() };
  for (const task of TASKS) if (existsSync(join(dir, task + '.html')))
    for (const [, v] of (await readFile(join(dir, task + '.html'), 'utf8')).matchAll(/\sclass\s*=\s*["']([^"']*)["']/g)) for (const c of v.split(/\s+/).filter(Boolean)) run.classes.add(c);
  try {
    for (const task of TASKS) {
      const file = join(dir, task + '.html');
      const checks = CHECKS[task].map(c => ({ label: c[0], expr: c[1], scheme: c[2] ?? 'light' }));
      const out = { task, checks: [] };
      if (!existsSync(file)) { out.checks = checks.map(c => ({ label: c.label, ok: false, error: 'no page' })); run.tasks.push(out); continue; }
      for (const scheme of ['light', 'dark']) {
        const page = await b.newPage();
        await page.goto(`http://127.0.0.1:${srv.address().port}/${task}.html`, { width: 1024, height: 768, scheme, settle: 300 });
        for (const c of checks.filter(c => c.scheme === scheme)) {
          let ok = false, error;
          try { ok = await page.evaluate(`(() => { const H = ${HELPERS}; const $ = id => document.getElementById(id); return !!(${c.expr}); })()`); }
          catch (e) { error = String(e.message).split('\n')[0]; }
          out.checks.push({ label: c.label, ok, ...(error ? { error } : {}) });
        }
        await page.close();
      }
      run.tasks.push(out);
    }
  } finally { await b.close(); srv.close(); }
  run.classes = [...run.classes].sort();
  results.push(run);
}

if (json) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  const full = r.tasks.filter(t => t.checks.every(c => c.ok)).length;
  const passed = r.tasks.flatMap(t => t.checks).filter(c => c.ok).length, all = r.tasks.flatMap(t => t.checks).length;
  console.log(`${r.run}: ${full} / ${r.tasks.length} tasks fully correct, ${passed} / ${all} checks, ${r.classes.length} classes${r.classes.length ? ` (${r.classes.join(' ')})` : ''}`);
  for (const t of r.tasks) for (const c of t.checks) if (!c.ok) console.log(`  ✗ ${t.task}: ${c.label}${c.error ? ` (${c.error})` : ''}`);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import temper from '../lib/vite.js';

function project(html) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-vite-'));
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
}

function run(dir, command) {
  const plugin = temper();
  const warnings = [];
  plugin.configResolved({ root: dir, command, logger: { warn: m => warnings.push(m) } });
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  return { error, warnings };
}

test('a build fails on errors and names file, line and fix', () => {
  const { error } = run(project('<p>x</p>\n<button data-variant="danger">Delete</button>'), 'build');
  assert.match(error, /index\.html:2:\d+ error TM101/);
  assert.match(error, /Did you mean data-tone="danger"\?/);
});

test('the dev server only warns', () => {
  const { error, warnings } = run(project('<button data-variant="danger">Delete</button>'), 'serve');
  assert.equal(error, undefined);
  assert.match(warnings[0], /TM101/);
});

test('a clean project is silent', () => {
  const { error, warnings } = run(project('<button data-tone="danger">Delete</button>'), 'build');
  assert.equal(error, undefined);
  assert.deepEqual(warnings, []);
});

test('icons: folder icons and used Lucide icons only, all Lucide names pass the checker', async () => {
  const { mkdirSync } = await import('node:fs');
  const dir = project('<span data-icon="rocket"></span>\n<button data-icon="alarm-clock">Remind me</button>\n<span data-icon="mail"></span>');
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'icons', 'rocket.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>');
  writeFileSync(join(dir, 'icons', 'mail.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>');
  const plugin = temper({ icons: { dir: 'icons' } });
  const warnings = [];
  plugin.configResolved({ root: dir, command: 'build', logger: { warn: m => warnings.push(m) } });
  assert.equal(plugin.resolveId('virtual:temper-icons.css'), '/__temper-icons.css');
  const css = plugin.load('/__temper-icons.css');
  assert.match(css, /--tm-icon-rocket:/);           // own icon
  assert.match(css, /--tm-icon-mail: url\("data:image\/svg\+xml,[^"]*circle/); // own icon replaces the default
  assert.match(css, /--tm-icon-alarm-clock:/);      // used Lucide icon, not in the default set
  assert.doesNotMatch(css, /--tm-icon-calendar:/);  // unused: not emitted
  assert.match(css, /Lucide/);                      // license notice for the Lucide icons
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  assert.equal(error, undefined, error);
  assert.deepEqual(warnings, []);
});

test('icons: unknown names still fail with a suggestion', () => {
  const dir = project('<span data-icon="alarm-clok"></span>');
  const plugin = temper({ icons: {} });
  plugin.configResolved({ root: dir, command: 'build', logger: { warn() {} } });
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  assert.match(error, /TM105.*Did you mean "alarm-clock"\?/);
});

test('enhance: appends the chosen enhancements to core.css and all.css only', async () => {
  const { ENTRY_FILES } = await import('../lib/enhance.js');
  const plugin = temper({ enhance: ['customizable-select'] });
  const out = plugin.transform.handler('/* core */', ENTRY_FILES[0] + '?direct');
  assert.match(out.code, /^\/\* core \*\/[\s\S]*appearance: ?base-select/);
  assert.match(plugin.transform.handler('', ENTRY_FILES[1]).code, /base-select/);
  assert.equal(plugin.transform.handler('', '/app/src/app.css'), undefined);
  assert.equal(plugin.transform.order, 'pre');
});

test('enhance: off by default, "all" includes every enhancement', async () => {
  const { ENTRY_FILES, ENHANCEMENTS } = await import('../lib/enhance.js');
  assert.equal(temper().transform.handler('x', ENTRY_FILES[0]), undefined);
  const all = temper({ enhance: 'all' }).transform.handler('', ENTRY_FILES[0]).code;
  assert.ok(ENHANCEMENTS.length && /base-select/.test(all));
});

test('enhance: unknown ids fail with a suggestion', () => {
  assert.throws(() => temper({ enhance: ['customisable-select'] }), /unknown enhancement "customisable-select"\. Did you mean "customizable-select"\?/);
});

test('enhance: the list matches src/enhance/', async () => {
  const { readdirSync } = await import('node:fs');
  const { ENHANCEMENTS } = await import('../lib/enhance.js');
  const files = readdirSync(new URL('../src/enhance/', import.meta.url)).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4));
  assert.deepEqual([...ENHANCEMENTS].sort(), files.sort());
});

test('prune: build only, keeps what the project uses', async () => {
  const { fileURLToPath } = await import('node:url');
  const dir = project('<span data-badge data-tone="danger">x</span><div data-layout="stack" data-gap="sm"></div>');
  const plugin = temper({ prune: true });
  const info = [];
  plugin.configResolved({ root: dir, command: 'build', logger: { warn() {}, info: m => info.push(m) } });
  const id = fileURLToPath(new URL('../dist/core.css', import.meta.url));
  const css = ':where([data-tone="danger"]){--a:1}:where([data-tone="success"]){--b:1}:where([data-gap="sm"]){--c:1}:where([data-gap="xl"]){--d:1}:where([data-badge]){--e:1}:where([data-avatar]){--f:1}';
  const out = plugin.transform.handler(css, id).code;
  assert.equal(out, ':where([data-tone="danger"]){--a:1}:where([data-gap="sm"]){--c:1}:where([data-badge]){--e:1}');
  assert.match(info[0], /pruned core\.css/);
  // the dev server never prunes
  const dev = temper({ prune: true });
  dev.configResolved({ root: dir, command: 'serve', logger: { warn() {} } });
  assert.equal(dev.transform.handler(css, id), undefined);
});

test('hot updates report the same diagnostics as the build: project icons count, missing modules are reported', () => {
  const dir = project('<!doctype html><html><body data-shell>\n<button data-icon="rocket" aria-label="Launch"></button>\n<nav data-rail></nav>\n</body></html>');
  writeFileSync(join(dir, 'app.css'), ':root { --tm-icon-rocket: url("data:image/svg+xml,x"); }');
  writeFileSync(join(dir, 'main.js'), "import '@tiaforge-ui/temper/core.css';");
  const plugin = temper();
  const warnings = [];
  plugin.configResolved({ root: dir, command: 'serve', logger: { warn: m => warnings.push(m) } });
  plugin.buildStart.call({ error: m => { throw new Error(m); } });
  const codes = text => [...text.matchAll(/\b(TM\d{3})\b/g)].map(m => m[1]);
  assert.deepEqual(codes(warnings[0]), ['TM110']); // app.css is not imported; the icon is the project's own
  warnings.length = 0;
  plugin.handleHotUpdate({ file: join(dir, 'index.html') });
  assert.deepEqual(codes(warnings[0]), ['TM110']);
});

// ───────────── inspect: the rendered-page audit in dev ─────────────

const AUDIT = new URL('../packages/inspect/lib/audit.js', import.meta.url).pathname;

function devServer(options, command = 'serve') {
  const plugin = temper(options);
  const log = { warn: [], info: [] }, handlers = {};
  plugin.configResolved({ root: process.cwd(), command, logger: { warn: m => log.warn.push(m), info: m => log.info.push(m) } });
  plugin.configureServer({ ws: { on: (name, fn) => { handlers[name] = fn; } }, moduleGraph: {} });
  return { plugin, log, send: data => handlers['temper:inspect']?.(data) };
}

test('inspect adds the client script to the dev page, and the client carries the audit', async () => {
  const { plugin } = devServer({ inspect: { audit: AUDIT } });
  const [tag] = plugin.transformIndexHtml.handler('<p>x</p>');
  assert.equal(tag.tag, 'script');
  assert.equal(tag.attrs.src, '/@id/__x00__virtual:temper-inspect-client');
  assert.equal(plugin.resolveId('virtual:temper-inspect-client'), '\0virtual:temper-inspect-client');
  const code = await plugin.load('\0virtual:temper-inspect-client');
  assert.match(code, /const install = function install\(opts\)/);
  assert.match(code, /import\.meta\.hot\?\.send\('temper:inspect'/);
  assert.match(code, /overlays: false/);
});

test('inspect does nothing without the option, and never in a build', () => {
  assert.equal(devServer({}).plugin.transformIndexHtml.handler('<p>x</p>'), undefined);
  assert.equal(devServer({ inspect: { audit: AUDIT } }, 'build').plugin.transformIndexHtml.handler('<p>x</p>'), undefined);
  assert.equal(devServer({ inspect: { audit: AUDIT } }, 'build').plugin.transform.handler('<p>x</p>', '/p/a.svelte'), undefined);
});

test('inspect without the temper-inspect package says so and stays off', () => {
  const plugin = temper({ inspect: true });
  const warnings = [];
  plugin.configResolved({ root: '/nonexistent', command: 'serve', logger: { warn: m => warnings.push(m) } });
  assert.match(warnings[0], /needs @tiaforge-ui\/temper-inspect/);
  assert.equal(plugin.transformIndexHtml.handler('<p>x</p>'), undefined);
});

test('inspect prints findings once per change, ignores info, and says when a page is clean again', () => {
  const { log, send } = devServer({ inspect: { audit: AUDIT } });
  const overflow = { severity: 'error', code: 'overflow', selector: 'div "wide"', message: 'sticks out' };
  const info = { severity: 'info', code: 'opened', selector: 'button', message: 'opened by clicking this' };
  send({ page: '/', findings: [info] });
  assert.deepEqual(log.warn, []); // clean on first sight: silent
  send({ page: '/', findings: [overflow, info] });
  send({ page: '/', findings: [overflow] }); // the same again: not printed twice
  assert.equal(log.warn.length, 1);
  assert.match(log.warn[0], /temper inspect \/: 1 error\(s\), 0 warning\(s\)\n {2}error overflow: div "wide" sticks out/);
  send({ page: '/', findings: [] });
  assert.deepEqual(log.info, ['temper inspect /: no problems']);
  send({ page: '/other', findings: [overflow] }); // another page reports on its own
  assert.equal(log.warn.length, 2);
});

test('inspect caps a flood of one kind of finding', () => {
  const { log, send } = devServer({ inspect: { audit: AUDIT } });
  send({ page: '/', findings: Array.from({ length: 12 }, (_, i) => ({ severity: 'warning', code: 'contrast', selector: `p${i}`, message: 'low' })) });
  assert.match(log.warn[0], /… 4 more contrast findings/);
});

test('inspect stamps elements with their source line: pages and components, never in a build, switchable off', () => {
  const dev = devServer({ inspect: { audit: AUDIT } }).plugin;
  const root = process.cwd();
  const { html, tags } = dev.transformIndexHtml.handler('<h1>a</h1>\n<p>b</p>', { filename: root + '/index.html' });
  assert.equal(html, '<h1 data-tm-src="index.html:1">a</h1>\n<p data-tm-src="index.html:2">b</p>');
  assert.equal(tags.length, 1);
  const stamped = dev.transform.handler('<script>let a: Array<string>;</script>\n<Card />\n<button>x</button>', root + '/src/A.svelte');
  assert.equal(stamped.code, '<script>let a: Array<string>;</script>\n<Card />\n<button data-tm-src="src/A.svelte:3">x</button>');
  assert.equal(dev.transform.handler('<button>x</button>', root + '/src/a.js'), undefined); // not markup
  assert.equal(dev.transform.handler('<button>x</button>', root + '/src/A.svelte?svelte&type=style'), undefined); // a part of a file
  const off = devServer({ inspect: { audit: AUDIT, source: false } }).plugin;
  assert.equal(off.transform.handler('<button>x</button>', root + '/src/A.svelte'), undefined);
  assert.equal(off.transformIndexHtml.handler('<p>x</p>', { filename: root + '/index.html' }).length, 1); // just the script tag
});

test('inspect names the source line of a finding', () => {
  const { log, send } = devServer({ inspect: { audit: AUDIT } });
  send({ page: '/', findings: [{ state: 'page', severity: 'error', code: 'contrast', selector: 'p', message: 'low', src: 'src/App.svelte:7' }] });
  assert.match(log.warn[0], /\n {2}src\/App\.svelte:7 error contrast: p low$/);
});

test('inspect keeps what a dialog showed while it is closed again, and forgets it on a reload or hot update', () => {
  const { log, send } = devServer({ inspect: { audit: AUDIT } });
  const bad = { state: 'dialog dialog#d', severity: 'error', code: 'position', selector: 'dialog#d', message: 'in the corner' };
  send({ page: '/', states: ['page'], findings: [], reset: true });
  assert.deepEqual(log.warn, []);
  send({ page: '/', states: ['page', 'dialog dialog#d'], findings: [bad] }); // the user opens the dialog
  assert.equal(log.warn.length, 1);
  assert.match(log.warn[0], /error position: dialog#d in the corner \[dialog dialog#d\]/);
  send({ page: '/', states: ['page'], findings: [] }); // it is closed again: the finding stands, nothing new is printed
  assert.equal(log.warn.length, 1);
  assert.deepEqual(log.info, []);
  send({ page: '/', states: ['page'], findings: [], reset: true }); // the source changed
  assert.deepEqual(log.info, ['temper inspect /: no problems']);
});

test('inspect lists a finding once when the page check and an open dialog both see it', () => {
  const { log, send } = devServer({ inspect: { audit: AUDIT } });
  const f = state => ({ state, severity: 'warning', code: 'contrast', selector: 'p', message: 'low' });
  send({ page: '/', states: ['page', 'dialog dialog#d'], findings: [f('page'), f('dialog dialog#d')] });
  assert.match(log.warn[0], /1 error\(s\)|0 error\(s\), 1 warning\(s\)/);
});

function withInspectPackage(version, exportsMap, audit) {
  const root = mkdtempSync(join(tmpdir(), 'tm-inspect-pkg-'));
  const dir = join(root, 'node_modules', '@tiaforge-ui', 'temper-inspect');
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@tiaforge-ui/temper-inspect', version, exports: exportsMap }));
  writeFileSync(join(dir, 'lib', 'audit.js'), audit);
  return root;
}

function pluginIn(root, options = { inspect: true }) {
  const plugin = temper(options);
  const warnings = [];
  plugin.configResolved({ root, command: 'serve', logger: { warn: m => warnings.push(m) } });
  return { plugin, warnings };
}

test('inspect: an installed temper-inspect without the ./audit export is too old, and says which version', () => {
  const root = withInspectPackage('0.1.9', { '.': './lib/audit.js', './package.json': './package.json' }, 'export function install() {}');
  const { plugin, warnings } = pluginIn(root);
  assert.match(warnings[0], /needs a newer @tiaforge-ui\/temper-inspect than the installed 0\.1\.9/);
  assert.equal(plugin.transformIndexHtml.handler('<p>x</p>'), undefined);
});

test('inspect: an audit that cannot check open dialogs is too old', () => {
  const root = withInspectPackage('0.1.10', { './audit': './lib/audit.js', './package.json': './package.json' }, 'export function install() {}');
  const { plugin, warnings } = pluginIn(root);
  assert.match(warnings[0], /needs a newer @tiaforge-ui\/temper-inspect than the installed 0\.1\.10 \(its audit cannot check open dialogs\)/);
  assert.equal(plugin.transformIndexHtml.handler('<p>x</p>'), undefined);
});

test('inspect: a current temper-inspect is found through the package exports', () => {
  const root = withInspectPackage('0.1.10', { './audit': './lib/audit.js', './package.json': './package.json' }, 'export function install() { /* checkOpen */ }');
  const { plugin, warnings } = pluginIn(root);
  assert.deepEqual(warnings, []);
  assert.equal(plugin.transformIndexHtml.handler('<p>x</p>').length, 1);
});

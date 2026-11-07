import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tinystyle from '../lib/vite.js';

function project(html) {
  const dir = mkdtempSync(join(tmpdir(), 'ts-vite-'));
  writeFileSync(join(dir, 'index.html'), html);
  return dir;
}

function run(dir, command) {
  const plugin = tinystyle();
  const warnings = [];
  plugin.configResolved({ root: dir, command, logger: { warn: m => warnings.push(m) } });
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  return { error, warnings };
}

test('a build fails on errors and names file, line and fix', () => {
  const { error } = run(project('<p>x</p>\n<button data-variant="danger">Delete</button>'), 'build');
  assert.match(error, /index\.html:2:\d+ error TS101/);
  assert.match(error, /Did you mean data-tone="danger"\?/);
});

test('the dev server only warns', () => {
  const { error, warnings } = run(project('<button data-variant="danger">Delete</button>'), 'serve');
  assert.equal(error, undefined);
  assert.match(warnings[0], /TS101/);
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
  const plugin = tinystyle({ icons: { dir: 'icons' } });
  const warnings = [];
  plugin.configResolved({ root: dir, command: 'build', logger: { warn: m => warnings.push(m) } });
  assert.equal(plugin.resolveId('virtual:tinystyle-icons.css'), '/__tinystyle-icons.css');
  const css = plugin.load('/__tinystyle-icons.css');
  assert.match(css, /--ts-icon-rocket:/);           // own icon
  assert.match(css, /--ts-icon-mail: url\("data:image\/svg\+xml,[^"]*circle/); // own icon replaces the default
  assert.match(css, /--ts-icon-alarm-clock:/);      // used Lucide icon, not in the default set
  assert.doesNotMatch(css, /--ts-icon-calendar:/);  // unused: not emitted
  assert.match(css, /Lucide/);                      // license notice for the Lucide icons
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  assert.equal(error, undefined, error);
  assert.deepEqual(warnings, []);
});

test('icons: unknown names still fail with a suggestion', () => {
  const dir = project('<span data-icon="alarm-clok"></span>');
  const plugin = tinystyle({ icons: {} });
  plugin.configResolved({ root: dir, command: 'build', logger: { warn() {} } });
  let error;
  try { plugin.buildStart.call({ error: m => { throw new Error(m); } }); } catch (e) { error = e.message; }
  assert.match(error, /TS105.*Did you mean "alarm-clock"\?/);
});

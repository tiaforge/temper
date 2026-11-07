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

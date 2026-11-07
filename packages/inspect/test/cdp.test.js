// The browser command line. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLine } from '../lib/cdp.js';

test('a Flatpak browser gets the profile dir and file:// directories shared into its sandbox', () => {
  const argv = commandLine(['flatpak', 'run', 'com.google.Chrome'], '/tmp/temper-inspect-abc', ['/srv/site']);
  assert.deepEqual(argv.slice(0, 5), ['flatpak', 'run', '--filesystem=/srv/site:ro', '--filesystem=/tmp/temper-inspect-abc', 'com.google.Chrome']);
  assert.ok(argv.includes('--user-data-dir=/tmp/temper-inspect-abc'));
  assert.ok(argv.includes('--headless=new') && argv.includes('--disable-component-update'));
  assert.equal(argv.at(-1), 'about:blank');
});

test('a plain browser command is left alone apart from the flags', () => {
  const argv = commandLine(['chromium'], '/tmp/p');
  assert.equal(argv[0], 'chromium');
  assert.ok(!argv.some(a => a.startsWith('--filesystem=')));
  assert.ok(argv.includes('--user-data-dir=/tmp/p'));
  // a user-supplied command with its own arguments keeps them in front
  assert.deepEqual(commandLine(['/opt/chrome/chrome', '--no-sandbox'], '/tmp/p').slice(0, 3), ['/opt/chrome/chrome', '--no-sandbox', '--headless=new']);
});

// The browser command line. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLine, flatpakApp } from '../lib/cdp.js';

test('a Flatpak browser gets the profile dir and file:// directories shared into its sandbox, and TMPDIR', () => {
  const argv = commandLine(['flatpak', 'run', 'com.google.Chrome'], '/tmp/temper-inspect-abc', ['/srv/site']);
  // flatpak run drops TMPDIR: without --env, Chrome's temp dirs pile up in the app's private /tmp
  assert.deepEqual(argv.slice(0, 6), ['flatpak', 'run', '--filesystem=/srv/site:ro', '--filesystem=/tmp/temper-inspect-abc',
    '--env=TMPDIR=/tmp/temper-inspect-abc/tmp', 'com.google.Chrome']);
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

test('the app id of a Flatpak command', () => {
  assert.equal(flatpakApp(['flatpak', 'run', 'com.google.Chrome']), 'com.google.Chrome');
  assert.equal(flatpakApp(['flatpak', 'run', '--branch=beta', 'org.chromium.Chromium', '--foo']), 'org.chromium.Chromium');
  assert.equal(flatpakApp(['chromium']), null);
});

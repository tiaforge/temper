// The browser command line and the removal of a killed browser's profile. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandLine, flatpakApp, removeProfile } from '../lib/cdp.js';

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

// A killed browser can still write into its profile for a moment. Here a process group keeps recreating files in a
// directory until a second process kills it 200 ms later: the removal waits for it, so nothing is left behind.
test('removeProfile waits for the killed processes, then removes the profile; bounded', { skip: process.platform !== 'linux' && 'reads /proc' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'temper-inspect-rm-'));
  const writer = spawn('sh', ['-c', `i=0; while :; do mkdir -p "${dir}/a"; echo x > "${dir}/a/f$i"; i=$((i+1)); done`], { detached: true, stdio: 'ignore' });
  spawn('sh', ['-c', `sleep 0.2; kill -9 -${writer.pid}`], { stdio: 'ignore' });
  const start = Date.now();
  removeProfile(dir, writer.pid);
  const took = Date.now() - start;
  assert.equal(existsSync(dir), false, 'the directory is gone');
  assert.ok(took >= 100 && took < 2000, `waited for the writer, not longer: ${took} ms`);
  // a group that never dies: it gives up after the bound
  const stuck = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  const other = mkdtempSync(join(tmpdir(), 'temper-inspect-rm-'));
  const t = Date.now();
  removeProfile(other, stuck.pid, 300);
  assert.ok(Date.now() - t < 1000);
  process.kill(-stuck.pid, 'SIGKILL');
});

// A tab whose renderer goes away (as when a dev server restarts and the page reloads itself mid-run) must not hang
// the run: commands sent to it fail fast, inspect() goes on in a new tab, and no browser is left running, also when
// the process is stopped by a signal. Skipped when no Chrome/Chromium is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from '../lib/inspect.js';
import { findBrowser, launch } from '../lib/cdp.js';

let browser = null;
try { browser = findBrowser(); } catch {}
const skip = !browser && 'no Chrome/Chromium found';
const PAGE = '<!doctype html><html lang="en"><title>t</title><main><h1>Hello</h1><p>Some text.</p></main></html>';

async function serve(onRequest = () => {}) {
  let hits = 0;
  const srv = createServer((req, res) => { onRequest(++hits, req); res.setHeader('content-type', 'text/html'); res.end(PAGE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, url: `http://127.0.0.1:${srv.address().port}/` };
}

// Each test gets a TMPDIR of its own, so it can find its browser's profile (and nothing else's) in it.
function ownTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'temper-inspect-test-'));
  const prev = process.env.TMPDIR;
  process.env.TMPDIR = dir;
  return { dir, restore() { if (prev === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = prev; rmSync(dir, { recursive: true, force: true }); } };
}

// Browser processes started with a profile under `dir` (Linux: read from /proc).
const browsersUnder = dir => readdirSync('/proc').filter(p => /^\d+$/.test(p)).filter(p => {
  try { return readFileSync(`/proc/${p}/cmdline`, 'utf8').includes(`--user-data-dir=${dir}`); } catch { return false; }
});
const settled = async (check, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end && !check();) await new Promise(r => setTimeout(r, 100)); return check(); };

// The renderer goes away through chrome://kill: the browser terminates it, so the tab reports Inspector.targetCrashed
// at once. Page.crash would make it segfault instead, and a system crash handler (systemd-coredump, apport) then holds
// the dying process while it writes a core dump: no crash event for a long time (CI timed out), and a desktop crash
// notification on every run.
const KILL = { url: 'chrome://kill' };

// Kills the renderer of the inspected tab from a second DevTools connection, like a renderer that goes away.
async function crashTab(dir) {
  const profile = readdirSync(dir).find(d => d.startsWith('temper-inspect-'));
  const [port, path] = readFileSync(join(dir, profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise(r => { ws.onopen = r; });
  let id = 0; const waits = new Map();
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); waits.get(m.id)?.(m.result); };
  const send = (method, params = {}, sessionId) => new Promise(r => { waits.set(++id, r); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetInfos } = await send('Target.getTargets');
  const tab = targetInfos.find(t => t.type === 'page' && t.url.startsWith('http'));
  const { sessionId } = await send('Target.attachToTarget', { targetId: tab.targetId, flatten: true });
  ws.send(JSON.stringify({ id: ++id, method: 'Page.navigate', params: KILL, sessionId })); // never answered: the renderer is gone
  await new Promise(r => setTimeout(r, 300));
  ws.close();
}

test('commands to a tab whose renderer is gone fail at once; a command without an answer times out', { skip }, async () => {
  const { srv, url } = await serve();
  const b = await launch(browser, { timeout: 1500 });
  try {
    const page = await b.newPage();
    await page.goto(url, { width: 800, height: 600, scheme: 'light', settle: 50 });
    assert.equal(await page.evaluate('document.title'), 't');
    // a promise that never settles: the command gets no answer
    await assert.rejects(page.evaluate('new Promise(() => {})'), { code: 'COMMAND_TIMEOUT', message: /Runtime\.evaluate within 2 s/ });
    page.send('Page.navigate', KILL).catch(() => {});
    const t0 = Date.now();
    await assert.rejects(page.evaluate('1'), { code: 'PAGE_LOST' });
    assert.ok(Date.now() - t0 < 1500, 'rejected when the renderer went away, not at the timeout');
    // the browser itself is fine: a new tab works
    const next = await b.newPage();
    await next.goto(url, { width: 800, height: 600, scheme: 'light', settle: 50 });
    assert.equal(await next.evaluate('1 + 1'), 2);
  } finally {
    await b.close();
    srv.close();
  }
});

test('inspect() goes on in a new tab when the renderer goes away mid-run', { skip }, async () => {
  const tmp = ownTmp();
  let crashed = null, loads = 0;
  // the second load of the page (1280 dark) crashes the tab as soon as it has been served
  const { srv, url } = await serve((hit, req) => { if (req.url === '/' && ++loads === 2) crashed = new Promise(r => setTimeout(r, 100)).then(() => crashTab(tmp.dir)); });
  const retries = [];
  try {
    const { findings } = await inspect([url], { settle: 400, overlays: false, onRetry: m => retries.push(m) });
    await crashed;
    assert.equal(retries.length, 1, retries.join('\n'));
    assert.match(retries[0], /1280 dark: The page's tab stopped answering: its renderer crashed/);
    assert.deepEqual(findings.filter(f => f.severity !== 'info'), []);
    assert.deepEqual(readdirSync(tmp.dir), [], 'profile removed');
  } finally {
    srv.close();
    tmp.restore();
  }
});

test('a signal (Ctrl-C, timeout) stops the browser and removes its profile', { skip }, async () => {
  const tmp = ownTmp();
  const { srv, url } = await serve();
  const bin = fileURLToPath(new URL('../bin/temper-inspect.js', import.meta.url));
  try {
    // a long settle keeps the run going until the signal
    const child = spawn(process.execPath, [bin, url, '--settle', '60000', '--no-overlays'], { env: process.env, stdio: 'ignore' });
    const exited = new Promise(r => child.once('exit', (code, signal) => r({ code, signal })));
    const profile = () => readdirSync(tmp.dir).find(d => d.startsWith('temper-inspect-'));
    assert.ok(await settled(() => profile() && existsSync(join(tmp.dir, profile(), 'DevToolsActivePort')), 30000), 'browser started');
    const dir = join(tmp.dir, profile());
    assert.ok(browsersUnder(dir).length > 0);
    child.kill('SIGTERM');
    assert.equal((await exited).signal, 'SIGTERM');
    assert.ok(await settled(() => browsersUnder(dir).length === 0), `browser processes left: ${browsersUnder(dir)}`);
    assert.deepEqual(readdirSync(tmp.dir), []);
  } finally {
    srv.close();
    tmp.restore();
  }
});

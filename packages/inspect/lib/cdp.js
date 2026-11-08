// Minimal Chrome DevTools Protocol client: launches a headless Chrome/Chromium and talks to it over
// Node's built-in WebSocket. No dependencies.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const CANDIDATES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome', 'microsoft-edge'];
const FLATPAKS = ['com.google.Chrome', 'org.chromium.Chromium', 'com.microsoft.Edge'];

const has = cmd => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

/** Returns [command, ...args] that starts a Chromium-based browser. */
export function findBrowser(explicit = process.env.CHROME_PATH) {
  if (explicit) return explicit.split(' ');
  for (const c of CANDIDATES) if (has(c)) return [c];
  if (has('flatpak')) {
    for (const id of FLATPAKS) {
      try { execFileSync('flatpak', ['info', id], { stdio: 'ignore' }); return ['flatpak', 'run', id]; } catch {}
    }
  }
  throw new Error('No Chrome or Chromium found. Set CHROME_PATH or pass --browser.');
}

/** The Flatpak app id of a `flatpak run [options] <app id>` command, or null. */
export function flatpakApp([cmd, ...pre]) {
  const run = cmd === 'flatpak' ? pre.indexOf('run') : -1;
  return run >= 0 ? pre.slice(run + 1).find(a => !a.startsWith('-')) ?? null : null;
}

/**
 * The command line for a headless browser with its profile in `profile`. A Flatpak browser cannot see the host's
 * /tmp: its /tmp is a private tmpfs under $XDG_RUNTIME_DIR (a few GB, wiped only when the app's last instance exits,
 * which never happens while the user's own Chrome is open). Without sharing, the profile lands inside the sandbox,
 * the cleanup removes an empty host dir, and every run leaks 70 MB and more until bwrap fails with ENOSPC. So the
 * profile dir and the directories of file:// pages are shared into the sandbox explicitly. `flatpak run` also drops
 * TMPDIR, so it is passed with --env: Chrome's own temp dirs then live in the profile too.
 */
export function commandLine(browserCmd, profile, share = []) {
  const [cmd, ...pre] = browserCmd;
  const run = cmd === 'flatpak' ? pre.indexOf('run') : -1;
  if (run >= 0) pre.splice(run + 1, 0, ...share.map(d => `--filesystem=${d}:ro`), `--filesystem=${profile}`, `--env=TMPDIR=${join(profile, 'tmp')}`);
  return [cmd, ...pre, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    // keep the profile small and the run offline apart from the pages themselves: no component downloads (Safe Browsing
    // lists, dictionaries, models: 100 MB and more per profile), no sync, extensions or crash reports
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--disable-default-apps', '--metrics-recording-only', '--disable-breakpad', 'about:blank'];
}

/** Thrown when the page's tab can no longer answer: its renderer is gone or its DevTools session was detached. */
export class PageLostError extends Error {
  constructor(message) { super(message); this.name = 'PageLostError'; this.code = 'PAGE_LOST'; }
}

/** Thrown when the browser does not answer a command in time. */
export class CommandTimeoutError extends Error {
  constructor(message) { super(message); this.name = 'CommandTimeoutError'; this.code = 'COMMAND_TIMEOUT'; }
}

/**
 * Launches the browser. `share`: directories of file:// pages (a Flatpak browser cannot see them otherwise).
 * `timeout`: ms the browser gets to answer a single command; a command that gets no answer rejects instead of
 * waiting forever.
 */
export async function launch(browserCmd = findBrowser(), { share = [], timeout = 30000 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'temper-inspect-'));
  const [cmd, ...argv] = commandLine(browserCmd, profile, share);
  // Chrome keeps its own temp files (com.google.Chrome.XXXXXX, the single-instance socket) in TMPDIR, and they outlive
  // a browser that is killed while shutting down. Inside the profile they are removed with it.
  const tmp = join(profile, 'tmp');
  mkdirSync(tmp);
  // A process group of its own, so the whole browser can be killed: `flatpak run` execs bwrap, and a signal to bwrap
  // does not reach the Chrome inside its sandbox (it keeps running as an orphan). Chrome stays in bwrap's group.
  const proc = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: tmp }, detached: true });
  const exited = new Promise(r => proc.once('exit', r));
  // bwrap leaves the mount point of the shared profile behind in the app's private /tmp: an empty dir per run.
  const app = flatpakApp(browserCmd);
  const mountPoint = app && process.env.XDG_RUNTIME_DIR && profile.startsWith('/tmp/')
    ? join(process.env.XDG_RUNTIME_DIR, '.flatpak', app, 'tmp', basename(profile)) : null;
  const kill = () => {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
    try { proc.kill('SIGKILL'); } catch {}
  };
  // If this process ends without close() (an exception, process.exit, a signal), the browser must not keep running
  // (240 MB resident, its profile on disk) as an orphan.
  let abandoned = false;
  const abandon = () => {
    if (abandoned) return;
    abandoned = true;
    kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
    if (mountPoint) try { rmdirSync(mountPoint); } catch {} // only when empty
  };
  process.once('exit', abandon);
  // Ctrl-C, `timeout`, a closed terminal: the browser is in its own process group and does not get the signal, so
  // clean up here and then die of the same signal.
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const onSignal = sig => { abandon(); unhook(); process.kill(process.pid, sig); };
  const unhook = () => { process.off('exit', abandon); for (const s of signals) process.off(s, onSignal); };
  for (const s of signals) process.once(s, onSignal);

  // Everything that waits on the browser fails together when it dies (a crash, a kill, a sandbox that refuses to
  // start): a wait that never settles would end the process with "unsettled top-level await" and no message.
  let err = '', dead = null, closing = false;
  const pending = new Map(), waiting = new Set(); // waiting: the reject functions of waits outside `pending`
  const lost = new Map(); // sessionId -> PageLostError, once a page's session is gone
  const settle = (id, fn) => { const p = pending.get(id); if (!p) return; pending.delete(id); clearTimeout(p.timer); fn(p); };
  const die = e => {
    if (dead || closing) return;
    dead = e;
    for (const reject of waiting) reject(e);
    for (const id of [...pending.keys()]) settle(id, p => p.reject(e));
    waiting.clear();
  };
  const loseSession = (sessionId, why) => {
    if (lost.has(sessionId)) return;
    const e = new PageLostError(`The page's tab stopped answering: ${why}. This happens when the page's renderer goes away, e.g. while a dev server restarts and the page reloads itself.`);
    lost.set(sessionId, e);
    for (const [id, p] of [...pending]) if (p.sessionId === sessionId) settle(id, q => q.reject(e));
    for (const w of [...waiting]) if (w.sessionId === sessionId) w(e);
  };
  const until = (start, ms, what, sessionId) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    if (sessionId && lost.has(sessionId)) return reject(lost.get(sessionId));
    const fail = e => { clearTimeout(timer); waiting.delete(fail); reject(e); };
    fail.sessionId = sessionId;
    const timer = setTimeout(() => fail(new Error(`${what}:\n${err.slice(-2000)}`)), ms);
    waiting.add(fail);
    start(value => { clearTimeout(timer); waiting.delete(fail); resolve(value); });
  });
  proc.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
  proc.on('exit', code => die(new Error(`The browser exited (${code}):\n${err.slice(-2000)}`)));
  proc.on('error', e => die(new Error(`Could not start the browser (${cmd}): ${e.message}`)));

  const wsUrl = await until(done => {
    const look = () => { const m = err.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { proc.stderr.off('data', look); done(m[1]); } };
    proc.stderr.on('data', look); look();
  }, 30000, 'The browser did not start');

  const ws = new WebSocket(wsUrl);
  ws.onclose = () => die(new Error(`The browser closed the DevTools connection (did it crash?):\n${err.slice(-2000)}`));
  ws.onerror = () => die(new Error(`Could not connect to the browser at ${wsUrl}`));
  await until(done => { ws.onopen = () => done(); }, 20000, 'The DevTools connection did not open');
  let nextId = 1;
  const listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      settle(msg.id, p => msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message} ${msg.error.data ?? ''}`.trim())) : p.resolve(msg.result));
      return;
    }
    // A page whose renderer is gone stays a target, but nothing sent to it is ever answered: fail what waits on it.
    if (msg.method === 'Inspector.detached') loseSession(msg.sessionId, `DevTools detached it (${msg.params.reason})`);
    else if (msg.method === 'Inspector.targetCrashed') loseSession(msg.sessionId, 'its renderer crashed');
    else if (msg.method === 'Target.detachedFromTarget' && !closing) loseSession(msg.params.sessionId, 'its DevTools session was detached');
    for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId, ms = timeout) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    if (sessionId && lost.has(sessionId)) return reject(lost.get(sessionId));
    const id = nextId++;
    const timer = setTimeout(() => settle(id, p => p.reject(new CommandTimeoutError(
      `The browser did not answer ${method} within ${Math.round(ms / 1000)} s`))), ms);
    pending.set(id, { resolve, reject, sessionId, method, timer });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const waitFor = (method, sessionId, ms = 20000) => {
    let l;
    return until(done => { l = msg => { if (msg.method === method && msg.sessionId === sessionId) done(msg.params); }; listeners.add(l); },
      ms, `Timed out waiting for ${method}`, sessionId).finally(() => listeners.delete(l));
  };

  async function close() {
    try { await send('Browser.close', {}, undefined, 2000); } catch {}
    closing = true;
    // Browser.close answers before the browser has exited: give it time to clean up before it is killed
    if (proc.exitCode === null && proc.signalCode === null) await Promise.race([exited, new Promise(r => setTimeout(r, 2000))]);
    ws.onclose = ws.onerror = ws.onmessage = null;
    ws.close();
    for (const id of [...pending.keys()]) settle(id, p => p.reject(new Error('The browser was closed')));
    unhook();
    abandon();
  }

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params, ms) => send(method, params, sessionId, ms);
    // A JavaScript dialog blocks the page (and every command sent to it) until it is answered: dismiss it, but let a
    // beforeunload dialog through so the next navigation is not held up.
    listeners.add(msg => {
      if (msg.sessionId === sessionId && msg.method === 'Page.javascriptDialogOpening')
        s('Page.handleJavaScriptDialog', { accept: msg.params.type === 'beforeunload' }).catch(() => {});
    });
    await s('Inspector.enable');
    await s('Page.enable');
    await s('Runtime.enable');
    return {
      send: s,
      targetId,
      get lost() { return lost.get(sessionId) ?? null; },
      async goto(url, { width, height, scheme, settle }) {
        await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
        const loaded = waitFor('Page.loadEventFired', sessionId);
        loaded.catch(() => {}); // awaited below; a navigation error must not leave it unhandled
        const nav = await s('Page.navigate', { url }, 20000);
        if (nav.errorText) throw new Error(`Could not load ${url}: ${nav.errorText}`);
        await loaded;
        await new Promise(r => setTimeout(r, settle));
      },
      async evaluate(expression) {
        const { result, exceptionDetails } = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
      /** Closes the tab, without waiting long for a tab that no longer answers. */
      async close() { try { await send('Target.closeTarget', { targetId }, undefined, 2000); } catch {} },
    };
  }

  return { newPage, close };
}

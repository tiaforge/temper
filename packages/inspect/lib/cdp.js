// Minimal Chrome DevTools Protocol client: launches a headless Chrome/Chromium and talks to it over
// Node's built-in WebSocket. No dependencies.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/**
 * The command line for a headless browser with its profile in `profile`. A Flatpak browser cannot see the host's
 * /tmp: its /tmp is a private tmpfs under $XDG_RUNTIME_DIR (a few GB, wiped only when the app's last instance exits,
 * which never happens while the user's own Chrome is open). Without sharing, the profile lands inside the sandbox,
 * the cleanup removes an empty host dir, and every run leaks 70 MB and more until bwrap fails with ENOSPC. So the
 * profile dir and the directories of file:// pages are shared into the sandbox explicitly.
 */
export function commandLine(browserCmd, profile, share = []) {
  const [cmd, ...pre] = browserCmd;
  const run = cmd === 'flatpak' ? pre.indexOf('run') : -1;
  if (run >= 0) pre.splice(run + 1, 0, ...share.map(d => `--filesystem=${d}:ro`), `--filesystem=${profile}`);
  return [cmd, ...pre, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
    // keep the profile small and the run offline apart from the pages themselves: no component downloads (Safe Browsing
    // lists, dictionaries, models: 100 MB and more per profile), no sync, extensions or crash reports
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--disable-default-apps', '--metrics-recording-only', '--disable-breakpad', 'about:blank'];
}

/** Launches the browser. `share`: directories of file:// pages (a Flatpak browser cannot see them otherwise). */
export async function launch(browserCmd = findBrowser(), { share = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'temper-inspect-'));
  const [cmd, ...argv] = commandLine(browserCmd, profile, share);
  // Chrome keeps its own temp files (com.google.Chrome.XXXXXX, the single-instance socket) in TMPDIR, and they outlive
  // a browser that is killed while shutting down. Inside the profile they are removed with it.
  const tmp = join(profile, 'tmp');
  mkdirSync(tmp);
  const proc = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TMPDIR: tmp } });
  const exited = new Promise(r => proc.once('exit', r));
  // If this process ends without close() (an exception, process.exit), the browser must not keep running (240 MB
  // resident, its profile on disk) as an orphan.
  const abandon = () => { try { proc.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  process.once('exit', abandon);

  // Everything that waits on the browser fails together when it dies (a crash, a kill, a sandbox that refuses to
  // start): a wait that never settles would end the process with "unsettled top-level await" and no message.
  let err = '', dead = null;
  const pending = new Map(), waiting = new Set(); // waiting: the reject functions of waits outside `pending`
  const die = e => {
    if (dead) return;
    dead = e;
    for (const reject of waiting) reject(e);
    for (const { reject } of pending.values()) reject(e);
    waiting.clear(); pending.clear();
  };
  const until = (start, timeout, what) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const timer = setTimeout(() => { waiting.delete(reject); reject(new Error(`${what}:\n${err.slice(-2000)}`)); }, timeout);
    waiting.add(reject);
    start(value => { clearTimeout(timer); waiting.delete(reject); resolve(value); });
  });
  proc.stderr.on('data', d => { err += d; });
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
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : resolve(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    if (dead) return reject(dead);
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const waitFor = (method, sessionId, timeout = 20000) => {
    let l;
    return until(done => { l = msg => { if (msg.method === method && msg.sessionId === sessionId) done(msg.params); }; listeners.add(l); },
      timeout, `Timed out waiting for ${method}`).finally(() => listeners.delete(l));
  };

  async function close() {
    try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch {}
    // Browser.close answers before the browser has exited: give it time to clean up before it is killed
    if (proc.exitCode === null && proc.signalCode === null) await Promise.race([exited, new Promise(r => setTimeout(r, 2000))]);
    ws.close();
    process.off('exit', abandon);
    abandon();
  }

  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    return {
      send: s,
      async goto(url, { width, height, scheme, settle }) {
        await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
        const loaded = waitFor('Page.loadEventFired', sessionId);
        const nav = await s('Page.navigate', { url });
        if (nav.errorText) throw new Error(`Could not load ${url}: ${nav.errorText}`);
        await loaded;
        await new Promise(r => setTimeout(r, settle));
      },
      async evaluate(expression) {
        const { result, exceptionDetails } = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
      },
    };
  }

  return { newPage, close };
}

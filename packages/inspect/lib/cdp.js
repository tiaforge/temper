// Minimal Chrome DevTools Protocol client: launches a headless Chrome/Chromium and talks to it over
// Node's built-in WebSocket. No dependencies.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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

export async function launch(browserCmd = findBrowser()) {
  const profile = mkdtempSync(join(tmpdir(), 'tinystyle-inspect-'));
  const [cmd, ...pre] = browserCmd;
  const proc = spawn(cmd, [...pre, '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Browser did not start:\n${err.slice(-2000)}`)), 30000);
    proc.stderr.on('data', d => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited (${code}):\n${err.slice(-2000)}`)); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const pending = new Map(), listeners = new Set();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : resolve(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const waitFor = (method, sessionId, timeout = 20000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(l); reject(new Error(`Timed out waiting for ${method}`)); }, timeout);
    const l = msg => { if (msg.method === method && msg.sessionId === sessionId) { clearTimeout(timer); listeners.delete(l); resolve(msg.params); } };
    listeners.add(l);
  });

  async function close() {
    try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch {}
    ws.close();
    proc.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
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

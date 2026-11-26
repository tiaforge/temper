// Runtime health of a tab, seen from the DevTools side (the CLI only; the in-page audit cannot see these): uncaught
// exceptions and unhandled rejections, console errors and errors the browser logs (a CSP violation), and requests that
// failed. Each one is attributed to the state during which it happened: 'page' for load and settle, then the name of
// the overlay while it is opened and checked.

// Requests that are no finding when they fail: a dev server's HMR socket and event streams (cut on every reload),
// beacons and reports, CORS preflights (the request itself fails and is reported), speculative prefetches.
const IGNORED = new Set(['WebSocket', 'EventSource', 'Ping', 'CSPViolationReport', 'Preflight', 'Prefetch', 'SignedExchange']);
// Without these the page is missing a part of itself: an error. Everything else (images, media, fetch/XHR) a warning.
const NEEDED = { Document: 'so the page is an error page', Stylesheet: 'so its styles are missing', Script: 'so its code does not run', Font: 'so text set in it falls back to another font' };
const KIND = { Document: 'the page', Stylesheet: 'stylesheet', Script: 'script', Font: 'font', Image: 'image', Media: 'media', Fetch: 'fetch', XHR: 'XHR', Manifest: 'manifest', TextTrack: 'text track' };
const MAX = 50; // distinct findings kept per step: a page that logs in a loop must not fill the memory

/** Shortens a URL for the report: relative to the page's directory, or its path on the same origin, or whole. */
export function shortUrl(url, page) {
  try {
    const u = new URL(url), p = new URL(page);
    const s = u.protocol === p.protocol && u.host === p.host
      ? (u.pathname.startsWith(p.pathname.replace(/[^/]*$/, '')) && u.protocol === 'file:' ? u.pathname.slice(p.pathname.replace(/[^/]*$/, '').length) : u.pathname) + u.search
      : url;
    return s.length > 100 ? s.slice(0, 99) + '…' : s;
  } catch { return url.length > 100 ? url.slice(0, 99) + '…' : url; }
}

/** First line of a message, at most `n` characters: what an LLM needs to find the cause, not a page of stack. */
export function firstLine(text, n = 200) {
  const line = String(text ?? '').trim().split('\n')[0].trim();
  return line.length > n ? line.slice(0, n - 1) + '…' : line;
}

/**
 * Starts collecting on `page` (from cdp.js newPage()); enables the Network and Log domains. Returns:
 * - reset(url): forget everything, at the start of a step that loads `url` (also when a step starts over),
 * - begin(): what happens from now on belongs to an overlay whose name is not known yet; claim(name) names it (null:
 *   it did not open, so it counts for the page), end(): back to the page,
 * - findings(): [{ state, severity, code, selector, message, resource? }] of the step so far.
 */
export async function watchRuntime(page) {
  let pageUrl = '', home = { name: 'page' }, now = home, out = new Map(), requests = new Map();
  const add = (state, severity, code, selector, message, resource) => {
    const key = [state.name, code, selector, message].join('\0');
    if (out.size < MAX && !out.has(key)) out.set(key, { state, severity, code, selector, message, resource });
  };
  // "file:line" of the top frame that has a URL; the page's own inline scripts are "line N of the page"
  const where = frames => {
    const f = frames?.find(c => c.url);
    if (!f) return '';
    return f.url === pageUrl ? ` (at line ${f.lineNumber + 1} of the page)` : ` (at ${shortUrl(f.url, pageUrl)}:${f.lineNumber + 1})`;
  };
  // a console argument as text: an object by its preview ({code: 42}), not just "Object"; an Error by its first line
  const value = a => {
    if (a.type === 'string') return a.value;
    if (a.value !== undefined) return JSON.stringify(a.value);
    const p = a.preview;
    if (p?.properties && a.subtype !== 'error') {
      const items = p.properties.map(q => p.subtype === 'array' ? q.value : `${q.name}: ${q.value}`).join(', ') + (p.overflow ? ', …' : '');
      return p.subtype === 'array' ? `[${items}]` : `{${items}}`;
    }
    return firstLine(a.description ?? a.type);
  };

  page.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
    const e = d.exception;
    const text = e ? (e.type === 'string' ? e.value : firstLine(e.description ?? e.value ?? d.text)) : d.text;
    const frames = d.stackTrace?.callFrames?.length ? d.stackTrace.callFrames : d.url ? [{ url: d.url, lineNumber: d.lineNumber }] : [];
    add(now, 'error', 'exception', '', `${/in promise/.test(d.text) ? 'unhandled promise rejection' : 'uncaught exception'}: ${firstLine(text)}${where(frames)}`);
  });
  page.on('Runtime.consoleAPICalled', ({ type, args, stackTrace }) => {
    if (type !== 'error' && type !== 'assert') return;
    const text = firstLine(args.map(value).join(' ')) || '(no message)';
    add(now, 'warning', 'console', '', `${type === 'assert' ? 'console.assert failed' : 'console.error'}: ${text}${where(stackTrace?.callFrames)}`);
  });
  page.on('Log.entryAdded', ({ entry }) => {
    // network: "Failed to load resource" (reported as a request) and failed WebSockets (a dev server's HMR socket);
    // cors: the failed request says it
    if (entry.level !== 'error' || entry.source === 'network' || entry.category === 'cors') return;
    // only a stack says where: the line given for a CSP violation in a stylesheet differs from load to load
    add(now, 'warning', 'console', '', `the browser logged: ${firstLine(entry.text)}${where(entry.stackTrace?.callFrames)}`);
  });
  page.on('Network.requestWillBeSent', ({ requestId, request, type, frameId }) => {
    requests.set(requestId, { state: now, url: request.url, type, main: type === 'Document' && frameId === page.targetId });
  });
  const fail = (id, why, type) => {
    const r = requests.get(id);
    if (!r || r.done) return;
    r.done = true;
    type = r.type ?? type;
    const u = new URL(r.url);
    if (IGNORED.has(type) || !/^(https?|file):$/.test(u.protocol)) return;
    if (type === 'Other' && u.pathname === '/favicon.ico') return; // the browser asks for it by itself
    const severity = NEEDED[type] && (type !== 'Document' || r.main) ? 'error' : 'warning';
    const kind = type === 'Document' && !r.main ? 'frame' : KIND[type] ?? type?.toLowerCase() ?? 'request';
    add(r.state, severity, 'request', shortUrl(r.url, pageUrl), `${why} (${kind})${severity === 'error' ? `, ${NEEDED[type]}` : ''}`, r.url);
  };
  page.on('Network.responseReceived', ({ requestId, response, type }) => {
    if (response.status >= 400) fail(requestId, `answered ${response.status}${response.statusText ? ' ' + response.statusText : ''}`, type);
  });
  page.on('Network.loadingFailed', ({ requestId, type, errorText, canceled, blockedReason, corsErrorStatus }) => {
    // canceled/ERR_ABORTED: the page or the browser dropped it (a navigation, an AbortController, a 404 stylesheet
    // after its response); csp: the browser logs the violation itself
    if (canceled || errorText === 'net::ERR_ABORTED' || blockedReason === 'csp') { requests.delete(requestId); return; }
    const scheme = requests.get(requestId)?.url.startsWith('file:') && corsErrorStatus?.corsError === 'CorsDisabledScheme';
    fail(requestId, corsErrorStatus ? `was blocked by CORS (${corsErrorStatus.corsError})${scheme ? ': fetch does not work in file:// pages, serve the page over HTTP' : ''}`
      : blockedReason ? `was blocked (${blockedReason})` : `failed (${errorText})`, type);
    requests.delete(requestId);
  });
  page.on('Network.loadingFinished', ({ requestId }) => requests.delete(requestId));
  await page.send('Network.enable');
  await page.send('Log.enable');

  return {
    reset(url) { pageUrl = url; home = { name: 'page' }; now = home; out = new Map(); requests = new Map(); },
    begin() { now = { name: null }; },
    claim(name) { now.name ??= name ?? 'page'; },
    end() { if (now.name === null) now.name = 'page'; now = home; },
    findings: () => [...out.values()].map(({ state, resource, ...f }) => ({ state: state.name ?? 'page', ...f, ...(resource ? { resource } : {}) })),
  };
}

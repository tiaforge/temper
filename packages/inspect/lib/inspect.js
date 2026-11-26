import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.js';
import { install } from './audit.js';
import { watchRuntime, AUDIT_URL } from './runtime.js';

/**
 * Loads each URL at each width and color scheme, opens every dialog and popover one at a time, and
 * returns merged findings. With `sheet` (a directory), it also writes contact sheets: one PNG per URL
 * (split into parts of `sheetRows` states) showing every state at every width and scheme, scaled down for an
 * overview, and next to them each state at full size (`<dir>/<page>/<state>-<width>-<scheme>.png`, 1 CSS px = 1 px),
 * to look at details the sheet is too small for.
 * Besides the in-page audit, each tab reports what only DevTools sees (runtime.js): exceptions, console errors and
 * failed requests, each in the state during which it happened. A finding with `resource` names the URL it is about.
 * `cookies` ([{ name, value }]) are set for the origin of every http(s) URL before it loads, and `headers`
 * ({ Name: value }) go with every request: for pages behind a login.
 * `timeout`: ms the browser gets to answer one command. A tab that stops answering (its renderer gone, e.g. while
 * a dev server restarts and the page reloads itself) is replaced by a new one and the step is run again, up to
 * `retries` times; `onRetry(message)` hears about it (default: printed to stderr).
 * @returns {Promise<{findings: Array, sheets: string[], shots: Array<{url, state, width, scheme, file}>}>}
 */
export async function inspect(urls, { widths = [1280, 390], schemes = ['light', 'dark'], height = 900, settle = 800,
  overlays = true, browser, sheet, sheetRows = 3, cookies = [], headers = {}, timeout = 30000, retries = 2,
  onRetry = message => console.error(message) } = {}) {
  const share = [...new Set(urls.filter(u => u.startsWith('file:')).map(u => dirname(fileURLToPath(u))))];
  const b = await launch(browser ? browser.split(' ') : findBrowser(), { share, timeout });
  const merged = new Map(), sheets = [], shotFiles = [];
  const origins = [...new Set(urls.filter(u => /^https?:/.test(u)).map(u => new URL(u).origin))];
  const openPage = async () => {
    const page = await b.newPage();
    page.runtime = await watchRuntime(page); // enables Network: also needed for the headers and cookies below
    if (Object.keys(headers).length) await page.send('Network.setExtraHTTPHeaders', { headers });
    for (const origin of origins) for (const { name, value } of cookies) {
      const { success } = await page.send('Network.setCookie', { name, value, url: origin + '/' });
      if (!success) throw new Error(`Could not set cookie ${name} for ${origin}`);
    }
    return page;
  };
  // One width and scheme of one URL: the page, then each overlay. Findings and screenshots only count once the
  // whole step went through, so a step that is run again does not leave half a step behind.
  async function step(page, url, width, scheme) {
    const found = [], shots = [], rt = page.runtime;
    rt.reset(url);
    await page.goto(url, { width, height, scheme, settle });
    await page.evaluate(NO_GUTTERS);
    await page.evaluate(`(${install.toString()})(${JSON.stringify({ overlays, overlayWait: 200 })})\n//# sourceURL=${AUDIT_URL}`);
    // A file:// page cannot fetch() its own stylesheets, nor read their rules: hand the audit their text (and that of its
    // <style> elements, keyed by their line in the page) over the protocol, so the stylesheet checks see them.
    if (url.startsWith('file:')) {
      const added = [], off = page.on('CSS.styleSheetAdded', ({ header }) => added.push(header));
      await page.send('DOM.enable'); await page.send('CSS.enable'); off();
      const texts = {};
      for (const h of added) if (h.origin === 'regular' && !h.isConstructed && (h.isInline || h.sourceURL.startsWith('file:')))
        try { texts[h.isInline ? `inline:${h.startLine + 1}` : h.sourceURL] ??= (await page.send('CSS.getStyleSheetText', { styleSheetId: h.styleSheetId })).text; } catch {}
      await page.send('CSS.disable'); await page.send('DOM.disable');
      await page.evaluate(`window.__tsiSources = ${JSON.stringify(texts)}`);
    }
    await page.evaluate('window.__tsi.prepare()');
    const take = async state => {
      if (!sheet) return;
      // Full size; the contact sheet scales it down when it lays it out.
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 } });
      const scale = Math.min(0.5, 480 / width);
      shots.push({ state, column: `${width} ${scheme}`, width, scheme, data, w: Math.round(width * scale), h: Math.round(height * scale) });
    };
    found.push(...await page.evaluate(`window.__tsi.check('page')`));
    await take('page');
    const count = await page.evaluate('window.__tsi.list()');
    for (let i = 0; i < count; i++) {
      rt.begin(); // what the opener's handlers throw or request belongs to the overlay, once its name is known
      const state = await page.evaluate(`window.__tsi.open(${i})`);
      rt.claim(state);
      if (!state) { rt.end(); continue; }
      found.push(...await page.evaluate(`window.__tsi.check(${JSON.stringify(state)})`));
      await take(state);
      await page.evaluate(`window.__tsi.close(${i})`);
      rt.end();
    }
    // A broken <img> is reported by the page with its element; its failed request would say the same again.
    const broken = new Set(found.filter(f => f.code === 'image' && f.resource).map(f => f.resource));
    found.push(...rt.findings().filter(f => !(f.code === 'request' && broken.has(f.resource))));
    return { found, shots };
  }
  const replaceable = e => e?.code === 'PAGE_LOST' || e?.code === 'COMMAND_TIMEOUT';
  try {
    let page = await openPage();
    for (const url of urls) {
      const shots = []; // { state, column, data, width, height }
      for (const width of widths) for (const scheme of schemes) {
        for (let attempt = 0; ; attempt++) {
          try {
            const result = await step(page, url, width, scheme);
            for (const f of result.found) {
              // a finding about no element (an exception, a console error, the document) is told apart by its message
              const key = [url, f.state, f.severity, f.code, f.selector, f.selector ? '' : f.message].join('\u0000');
              const entry = merged.get(key) ?? { url, ...f, where: [] };
              const at = `${width} ${scheme}`;
              if (!entry.where.includes(at)) entry.where.push(at);
              if (!merged.has(key)) merged.set(key, entry);
            }
            shots.push(...result.shots);
            break;
          } catch (e) {
            if (!replaceable(e) || attempt >= retries) throw new Error(`${url} at ${width} ${scheme}: ${e.message}`, { cause: e });
            onRetry(`temper-inspect: ${url} at ${width} ${scheme}: ${e.message.split('\n')[0]} Trying again in a new tab.`);
            await page.close();
            page = await openPage();
          }
        }
      }
      if (sheet && shots.length) {
        sheets.push(...await writeSheets(page, url, shots, sheet, sheetRows));
        shotFiles.push(...writeShots(url, shots, sheet));
      }
    }
  } finally {
    await b.close();
  }
  return { findings: [...merged.values()], sheets, shots: shotFiles };
}

/**
 * The browser runs with hidden scrollbars, which take no space, like the overlay scrollbars of phones and macOS. A
 * reserved scrollbar gutter (`scrollbar-gutter: stable`) still took its 15px there: while a modal dialog was open
 * on a page that scrolls, temper's scroll lock reserves the page's gutter, so the page and every dialog in it were
 * laid out 15px narrower than at that width anywhere (a bottom sheet stopped short of the right edge, content just
 * fitting a phone dialog was reported as overflow, rows wrapped). Without a scrollbar there is no gutter, as with
 * overlay scrollbars. A constructed sheet: no element is added to the page.
 */
export const NO_GUTTERS = `(() => {
  const s = new CSSStyleSheet();
  s.replaceSync('* { scrollbar-width: none !important; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, s];
})()`;

const slugOf = url => new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'index';

/** Writes each screenshot at full size into `<dir>/<page slug>/`, named after its state, width and scheme. */
function writeShots(url, shots, dir) {
  const sub = join(dir, slugOf(url));
  mkdirSync(sub, { recursive: true });
  const states = [...new Set(shots.map(s => s.state))];
  // Numbered in the order the sheet shows them, so two states whose names slug alike do not overwrite each other.
  const name = state => `${String(states.indexOf(state)).padStart(2, '0')}-${state.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'state'}`;
  return shots.map(s => {
    const file = join(sub, `${name(s.state)}-${s.width}-${s.scheme}.png`);
    writeFileSync(file, Buffer.from(s.data, 'base64'));
    return { url, state: s.state, width: s.width, scheme: s.scheme, file };
  });
}

/** Lays the screenshots out in a grid (rows: states, columns: width × scheme) and screenshots that page. */
async function writeSheets(page, url, shots, dir, rowsPerSheet) {
  mkdirSync(dir, { recursive: true });
  const columns = [...new Set(shots.map(s => s.column))];
  const states = [...new Set(shots.map(s => s.state))];
  const slug = slugOf(url);
  const esc = t => t.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const files = [];
  for (let part = 0; part * rowsPerSheet < states.length; part++) {
    const rows = states.slice(part * rowsPerSheet, (part + 1) * rowsPerSheet);
    const html = `<!doctype html><html><head><style>
      body { margin: 0; padding: 12px; background: #e9e9ec; font: 13px/1.3 system-ui, sans-serif; color: #222; }
      table { border-collapse: separate; border-spacing: 8px; }
      th { text-align: left; font-weight: 600; padding: 0 2px; }
      td { vertical-align: top; } td img { display: block; border: 1px solid #b8b8bf; }
      td.empty { color: #888; } th.state { max-width: 9rem; word-break: break-word; }
    </style></head><body><table>
      <tr><th></th>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
      ${rows.map(state => `<tr><th class="state">${esc(state)}</th>${columns.map(c => {
        const s = shots.find(x => x.state === state && x.column === c);
        return s ? `<td><img src="data:image/png;base64,${s.data}" width="${s.w}" height="${s.h}"></td>` : '<td class="empty">not shown</td>';
      }).join('')}</tr>`).join('')}
    </table></body></html>`;
    const { frameTree } = await page.send('Page.getFrameTree');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await new Promise(r => setTimeout(r, 300));
    const { cssContentSize: size } = await page.send('Page.getLayoutMetrics');
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
    });
    const file = join(dir, `${slug}${states.length > rowsPerSheet ? `-${part + 1}` : ''}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    files.push(file);
  }
  return files;
}

const RANK = { error: 0, warning: 1, info: 2 };

/** Compact text report: grouped by page and state, at most `limit` lines per check code. */
export function format(findings, { verbose = false, limit = 8, allWhere = [] } = {}) {
  const shown = findings.filter(f => verbose || f.severity !== 'info');
  const counts = Object.fromEntries(['error', 'warning', 'info'].map(s => [s, findings.filter(f => f.severity === s).length]));
  const total = `${counts.error} error(s), ${counts.warning} warning(s)${verbose ? `, ${counts.info} info` : counts.info ? ` (${counts.info} info hidden, --verbose shows them)` : ''}`;
  if (!shown.length) return `No problems found.${counts.info && !verbose ? ` (${counts.info} info hidden, --verbose shows them)` : ''}`;
  const out = [];
  for (const [url, list] of Map.groupBy(shown, f => f.url)) {
    out.push(url);
    for (const [state, items] of Map.groupBy(list, f => f.state)) {
      out.push(`  ${state}`);
      const byCode = Map.groupBy(items.sort((a, b) => RANK[a.severity] - RANK[b.severity]), f => f.code);
      for (const [, group] of byCode) {
        for (const f of group.slice(0, limit)) {
          const where = f.where.length === allWhere.length ? '' : ` [${f.where.join(', ')}]`;
          out.push(`    ${f.severity} ${f.code}: ${f.selector ? f.selector + ' ' : ''}${f.message}${where}`);
        }
        if (group.length > limit) out.push(`    … ${group.length - limit} more ${group[0].code} findings (--limit to show more)`);
      }
    }
  }
  out.push('', total);
  return out.join('\n');
}

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, findBrowser } from './cdp.js';
import { install } from './audit.js';

/**
 * Loads each URL at each width and color scheme, opens every dialog and popover one at a time, and
 * returns merged findings. With `sheet` (a directory), it also writes contact sheets: one PNG per URL
 * (split into parts of `sheetRows` states) showing every state at every width and scheme.
 * `cookies` ([{ name, value }]) are set for the origin of every http(s) URL before it loads, and `headers`
 * ({ Name: value }) go with every request: for pages behind a login.
 * `timeout`: ms the browser gets to answer one command. A tab that stops answering (its renderer gone, e.g. while
 * a dev server restarts and the page reloads itself) is replaced by a new one and the step is run again, up to
 * `retries` times; `onRetry(message)` hears about it (default: printed to stderr).
 * @returns {Promise<{findings: Array, sheets: string[]}>}
 */
export async function inspect(urls, { widths = [1280, 390], schemes = ['light', 'dark'], height = 900, settle = 800,
  overlays = true, browser, sheet, sheetRows = 3, cookies = [], headers = {}, timeout = 30000, retries = 2,
  onRetry = message => console.error(message) } = {}) {
  const share = [...new Set(urls.filter(u => u.startsWith('file:')).map(u => dirname(fileURLToPath(u))))];
  const b = await launch(browser ? browser.split(' ') : findBrowser(), { share, timeout });
  const merged = new Map(), sheets = [];
  const origins = [...new Set(urls.filter(u => /^https?:/.test(u)).map(u => new URL(u).origin))];
  const openPage = async () => {
    const page = await b.newPage();
    if (cookies.length || Object.keys(headers).length) await page.send('Network.enable');
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
    const found = [], shots = [];
    await page.goto(url, { width, height, scheme, settle });
    await page.evaluate(`(${install.toString()})(${JSON.stringify({ overlays, overlayWait: 200 })})`);
    const take = async state => {
      if (!sheet) return;
      const scale = Math.min(0.5, 480 / width);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale } });
      shots.push({ state, column: `${width} ${scheme}`, data, width: Math.round(width * scale), height: Math.round(height * scale) });
    };
    found.push(...await page.evaluate(`window.__tsi.check('page')`));
    await take('page');
    const count = await page.evaluate('window.__tsi.list()');
    for (let i = 0; i < count; i++) {
      const state = await page.evaluate(`window.__tsi.open(${i})`);
      if (!state) continue;
      found.push(...await page.evaluate(`window.__tsi.check(${JSON.stringify(state)})`));
      await take(state);
      await page.evaluate(`window.__tsi.close(${i})`);
    }
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
              const key = [url, f.state, f.severity, f.code, f.selector].join('\u0000');
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
      if (sheet && shots.length) sheets.push(...await writeSheets(page, url, shots, sheet, sheetRows));
    }
  } finally {
    await b.close();
  }
  return { findings: [...merged.values()], sheets };
}

/** Lays the screenshots out in a grid (rows: states, columns: width × scheme) and screenshots that page. */
async function writeSheets(page, url, shots, dir, rowsPerSheet) {
  mkdirSync(dir, { recursive: true });
  const columns = [...new Set(shots.map(s => s.column))];
  const states = [...new Set(shots.map(s => s.state))];
  const slug = new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'index';
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
        return s ? `<td><img src="data:image/png;base64,${s.data}" width="${s.width}" height="${s.height}"></td>` : '<td class="empty">not shown</td>';
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
          out.push(`    ${f.severity} ${f.code}: ${f.selector} ${f.message}${where}`);
        }
        if (group.length > limit) out.push(`    … ${group.length - limit} more ${group[0].code} findings (--limit to show more)`);
      }
    }
  }
  out.push('', total);
  return out.join('\n');
}

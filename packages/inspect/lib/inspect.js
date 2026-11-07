import { launch, findBrowser } from './cdp.js';
import { audit } from './audit.js';

/**
 * Loads each URL at each width and color scheme, opens every dialog and popover, and returns merged findings.
 * @returns {Promise<Array<{url, state, severity, code, selector, message, where: string[]}>>}
 */
export async function inspect(urls, { widths = [1280, 390], schemes = ['light', 'dark'], height = 900, settle = 800, overlays = true, browser } = {}) {
  const b = await launch(browser ? browser.split(' ') : findBrowser());
  const merged = new Map();
  try {
    const page = await b.newPage();
    for (const url of urls) for (const width of widths) for (const scheme of schemes) {
      await page.goto(url, { width, height, scheme, settle });
      const found = await page.evaluate(`(${audit.toString()})(${JSON.stringify({ overlays, overlayWait: 200 })})`);
      for (const f of found) {
        const key = [url, f.state, f.severity, f.code, f.selector].join('\u0000');
        const entry = merged.get(key) ?? { url, ...f, where: [] };
        const at = `${width} ${scheme}`;
        if (!entry.where.includes(at)) entry.where.push(at);
        if (!merged.has(key)) merged.set(key, entry);
      }
    }
  } finally {
    await b.close();
  }
  return [...merged.values()];
}

const RANK = { error: 0, warning: 1, info: 2 };

/** Compact text report: grouped by page and state, at most `limit` lines per check code. */
export function format(findings, { verbose = false, limit = 8, allWhere = [] } = {}) {
  const shown = findings.filter(f => verbose || f.severity !== 'info');
  if (!shown.length) return 'No problems found.';
  const out = [];
  const byUrl = Map.groupBy(shown, f => f.url);
  for (const [url, list] of byUrl) {
    out.push(url);
    const byState = Map.groupBy(list, f => f.state);
    for (const [state, items] of byState) {
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
  const counts = Object.fromEntries(['error', 'warning', 'info'].map(s => [s, findings.filter(f => f.severity === s).length]));
  out.push('', `${counts.error} error(s), ${counts.warning} warning(s)${verbose ? `, ${counts.info} info` : counts.info ? ` (${counts.info} info hidden, --verbose shows them)` : ''}`);
  return out.join('\n');
}

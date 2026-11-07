#!/usr/bin/env node
import { inspect, format } from '../lib/inspect.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args.splice(i, 1), true) : false; };
const all = name => { const out = []; for (let i; (i = args.indexOf(`--${name}`)) >= 0;) out.push(args.splice(i, 2)[1]); return out; };

if (!args.length || flag('help')) {
  console.log(`Usage: temper-inspect <url...> [options]

Loads each page in headless Chrome at each width and color scheme, opens every dialog and popover,
and reports layout and accessibility problems as text: horizontal overflow, overlays stuck in a
corner or outside the viewport, text contrast, clipped text, controls without a name, controls
covered by other elements, images without alt. Point it at a running dev server.

Options:
  --widths 1280,390     viewport widths (default 1280,390)
  --schemes light,dark  color schemes (default light,dark)
  --settle 800          ms to wait after load for data to arrive (default 800)
  --no-overlays         do not open dialogs and popovers
  --verbose             also show info (wrapped rows, small tap targets)
  --limit 8             max lines per check and state
  --sheet <dir>         also write contact sheets: one PNG per page showing every state (page, each
                        dialog and popover) at every width and scheme, 3 states per image
  --json                print findings as JSON
  --browser <cmd>       browser command (default: CHROME_PATH or the first Chrome/Chromium found)
  --cookie name=value   set a cookie for each page's origin before it loads, e.g. a session cookie
                        for pages behind a login (repeatable)
  --header "Name: value"  send this header with every request, e.g. Authorization (repeatable)

Exit code 1 when there are errors.`);
  process.exit(args.length ? 0 : 2);
}

const widths = opt('widths', '1280,390').split(',').map(Number);
const schemes = opt('schemes', 'light,dark').split(',');
const settle = Number(opt('settle', '800'));
const limit = Number(opt('limit', '8'));
const browser = opt('browser');
const sheet = opt('sheet');
const json = flag('json'), verbose = flag('verbose'), overlays = !flag('no-overlays');

try {
  const cookies = all('cookie').map(c => {
    const i = c?.indexOf('=') ?? -1;
    if (i < 1) throw new Error(`--cookie needs name=value, got "${c ?? ''}"`);
    return { name: c.slice(0, i).trim(), value: c.slice(i + 1).trim() };
  });
  const headers = Object.fromEntries(all('header').map(h => {
    const i = h?.indexOf(':') ?? -1;
    if (i < 1) throw new Error(`--header needs "Name: value", got "${h ?? ''}"`);
    return [h.slice(0, i).trim(), h.slice(i + 1).trim()];
  }));
  const { findings, sheets } = await inspect(args, { widths, schemes, settle, overlays, browser, sheet, cookies, headers });
  const allWhere = widths.flatMap(w => schemes.map(s => `${w} ${s}`));
  console.log(json ? JSON.stringify({ findings, sheets }, null, 2) : format(findings, { verbose, limit, allWhere }));
  if (sheets.length && !json) console.log(`\nContact sheets:\n${sheets.map(f => '  ' + f).join('\n')}`);
  process.exit(findings.some(f => f.severity === 'error') ? 1 : 0);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

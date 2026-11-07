#!/usr/bin/env node
import { inspect, format } from '../lib/inspect.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const flag = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args.splice(i, 1), true) : false; };

if (!args.length || flag('help')) {
  console.log(`Usage: tinystyle-inspect <url...> [options]

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
  --json                print findings as JSON
  --browser <cmd>       browser command (default: CHROME_PATH or the first Chrome/Chromium found)

Exit code 1 when there are errors.`);
  process.exit(args.length ? 0 : 2);
}

const widths = opt('widths', '1280,390').split(',').map(Number);
const schemes = opt('schemes', 'light,dark').split(',');
const settle = Number(opt('settle', '800'));
const limit = Number(opt('limit', '8'));
const browser = opt('browser');
const json = flag('json'), verbose = flag('verbose'), overlays = !flag('no-overlays');

try {
  const findings = await inspect(args, { widths, schemes, settle, overlays, browser });
  const allWhere = widths.flatMap(w => schemes.map(s => `${w} ${s}`));
  console.log(json ? JSON.stringify(findings, null, 2) : format(findings, { verbose, limit, allWhere }));
  process.exit(findings.some(f => f.severity === 'error') ? 1 : 0);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

#!/usr/bin/env node
import { check } from '../lib/check.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd !== 'check') {
  console.log(`Usage: tinystyle check [paths...]

Checks tinystyle attributes in HTML/Svelte/Astro/Vue/JSX files and --ts-* tokens in CSS.
Exits with 1 when there are errors. --warnings-as-errors also fails on warnings.
--icons <dir> accepts the icon names of an SVG folder; --lucide accepts every Lucide icon name
(both match the Vite plugin's icons option).`);
  process.exit(cmd ? 2 : 0);
}
const strict = args.includes('--warnings-as-errors');
const iconsAt = args.indexOf('--icons');
const iconsDir = iconsAt >= 0 ? args.splice(iconsAt, 2)[1] : null;
const paths = args.filter(a => !a.startsWith('--'));
// Icon names beyond the default set: an own SVG folder (--icons <dir>) and/or all Lucide names (--lucide),
// matching the Vite plugin's icons option.
const { folderIcons, lucideIconsDir, lucideNames } = await import('../lib/icons.js');
const icons = new Set([...folderIcons(iconsDir).map(i => i.name), ...(args.includes('--lucide') ? lucideNames(lucideIconsDir(process.cwd())) : [])]);
const results = check(paths.length ? paths : ['.'], { icons });
for (const r of results) console.log(`${r.file}:${r.line}:${r.col} ${r.severity} ${r.code} ${r.message}`);
const errors = results.filter(r => r.severity === 'error').length;
const warnings = results.length - errors;
if (results.length) console.log(`\n${errors} error(s), ${warnings} warning(s)`);
// Nudge toward checking the rendered result, which the static check cannot see.
try {
  (await import('node:module')).createRequire(process.cwd() + '/').resolve('@tiaforge-ui/tinystyle-inspect/package.json');
  console.log('Next, check the rendered page: npx tinystyle-inspect <dev-server-url> --sheet <dir>  (every dialog and popover, wide and narrow, light and dark; one image per page)');
} catch {}
process.exit(errors || (strict && warnings) ? 1 : 0);

#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { check, applyFixes } from '../lib/check.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd !== 'check') {
  console.log(`Usage: temper check [paths...]

Checks temper attributes in HTML/Svelte/Astro/Vue/JSX files and --tm-* tokens in CSS.
Exits with 1 when there are errors. --warnings-as-errors also fails on warnings.
--fix applies the safe fixes (a value on the wrong axis, an unambiguous typo, a value on a
boolean attribute, a deprecated name) and reports what is left.
--icons <dir> accepts the icon names of an SVG folder; --lucide accepts every Lucide icon name
(both match the Vite plugin's icons option).`);
  process.exit(cmd ? 2 : 0);
}
const strict = args.includes('--warnings-as-errors');
const iconsAt = args.indexOf('--icons');
const iconsDir = iconsAt >= 0 ? args.splice(iconsAt, 2)[1] : null;
const paths = args.filter(a => !a.startsWith('--'));
for (const p of paths) if (!existsSync(p)) { console.error(`temper: ${p} does not exist`); process.exit(2); }
// Icon names beyond the default set: an own SVG folder (--icons <dir>) and/or all Lucide names (--lucide),
// matching the Vite plugin's icons option.
const { folderIcons, lucideIconsDir, lucideNames } = await import('../lib/icons.js');
const icons = new Set([...folderIcons(iconsDir).map(i => i.name), ...(args.includes('--lucide') ? lucideNames(lucideIconsDir(process.cwd())) : [])]);
let results = check(paths.length ? paths : ['.'], { icons });
if (args.includes('--fix')) {
  const byFile = new Map();
  for (const r of results) if (r.fix) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  let fixed = 0;
  for (const [file, list] of byFile) {
    const { text, applied } = applyFixes(readFileSync(file, 'utf8'), list);
    writeFileSync(file, text);
    fixed += applied;
  }
  if (fixed) console.log(`Fixed ${fixed} problem(s) in ${byFile.size} file(s).\n`);
  results = check(paths.length ? paths : ['.'], { icons });
}
for (const r of results) console.log(`${r.file}:${r.line}:${r.col} ${r.severity} ${r.code} ${r.message}`);
const errors = results.filter(r => r.severity === 'error').length;
const warnings = results.length - errors;
const fixable = results.filter(r => r.fix).length;
if (results.length) console.log(`\n${errors} error(s), ${warnings} warning(s)${fixable ? `; ${fixable} fixable with --fix` : ''}`);
// Nudge toward checking the rendered result, which the static check cannot see.
try {
  (await import('node:module')).createRequire(process.cwd() + '/').resolve('@tiaforge-ui/temper-inspect/package.json');
  console.log('Next, check the rendered page: npx temper-inspect <dev-server-url> --sheet <dir>  (every dialog and popover, wide and narrow, light and dark; one image per page)');
} catch {}
process.exit(errors || (strict && warnings) ? 1 : 0);

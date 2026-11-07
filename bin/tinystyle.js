#!/usr/bin/env node
import { check } from '../lib/check.js';

const [cmd, ...args] = process.argv.slice(2);
if (cmd !== 'check') {
  console.log(`Usage: tinystyle check [paths...]

Checks tinystyle attributes in HTML/Svelte/Astro/Vue/JSX files and --ts-* tokens in CSS.
Exits with 1 when there are errors. --warnings-as-errors also fails on warnings.`);
  process.exit(cmd ? 2 : 0);
}
const strict = args.includes('--warnings-as-errors');
const paths = args.filter(a => !a.startsWith('--'));
const results = check(paths.length ? paths : ['.']);
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

#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { check, applyFixes, closest } from '../lib/check.js';

const USAGE = `Usage: temper check [options] [paths...]

Checks temper attributes in HTML/Svelte/Astro/Vue/JSX files and --tm-* tokens in CSS.
Exits with 1 when there are errors, 2 for a usage error.

Options:
  --fix                 apply the safe fixes (a value on the wrong axis, an unambiguous typo, a value on a
                        boolean attribute, a deprecated name, a bare boolean that renders "false") and
                        report what is left. A missing label gets aria-label="TODO", which stays an error
                        (TM113) until you write the real one.
  --warnings-as-errors  also fail on warnings
  --icons <dir>         accept the icon names of an SVG folder
  --lucide              accept every Lucide icon name, and say where a data-icon's names cannot be seen in
                        the source (both match the Vite plugin's icons option)
  -h, --help            show this help
  -v, --version         show the version`;

const FLAGS = ['--fix', '--warnings-as-errors', '--icons', '--lucide', '--help', '-h', '--version', '-v'];
const usageError = message => {
  console.error(`temper: ${message}\nRun temper --help for the options.`);
  process.exit(2);
};
const version = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === '--help' || argv[0] === '-h') { console.log(USAGE); process.exit(0); }
if (argv[0] === '--version' || argv[0] === '-v') { console.log(version()); process.exit(0); }
if (argv[0] !== 'check') {
  const g = argv[0].startsWith('-') ? closest(argv[0], FLAGS) : closest(argv[0], ['check']);
  usageError(`${argv[0].startsWith('-') ? 'unknown option' : 'unknown command'} ${argv[0]}.${g ? ` Did you mean ${g}?` : ''} The command is: temper check [options] [paths...]`);
}

// strict parsing: every option is known, --icons takes a folder, anything after -- is a path
const opts = { fix: false, strict: false, lucide: false, iconsDir: null };
const paths = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--') { paths.push(...argv.slice(i + 1)); break; }
  if (!a.startsWith('-') || a === '-') { paths.push(a); continue; }
  const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
  if (inline !== undefined && flag !== '--icons') usageError(`${flag} takes no value.`);
  switch (flag) {
    case '--help': case '-h': console.log(USAGE); process.exit(0);
    case '--version': case '-v': console.log(version()); process.exit(0);
    case '--fix': opts.fix = true; break;
    case '--warnings-as-errors': opts.strict = true; break;
    case '--lucide': opts.lucide = true; break;
    case '--icons': {
      const dir = inline ?? argv[++i];
      if (!dir || (inline === undefined && dir.startsWith('-'))) usageError('--icons needs a folder of SVG files: --icons <dir>.');
      if (!existsSync(dir)) usageError(`--icons: ${dir} does not exist.`);
      opts.iconsDir = dir;
      break;
    }
    default: {
      const g = closest(flag, FLAGS, 3);
      usageError(`unknown option ${flag}.${g ? ` Did you mean ${g}?` : ''}`);
    }
  }
}
for (const p of paths) if (!existsSync(p)) usageError(`${p} does not exist.`);
const roots = paths.length ? paths : ['.'];

// Icon names beyond the default set: an own SVG folder (--icons <dir>) and/or all Lucide names (--lucide),
// matching the Vite plugin's icons option.
const { folderIcons, lucideIconsDir, lucideNames, usedIcons, unresolvedIconsNotice } = await import('../lib/icons.js');
const lucide = opts.lucide ? lucideIconsDir(process.cwd()) : null;
if (opts.lucide && !lucide) console.error('temper: --lucide needs the lucide-static package (npm install -D lucide-static); only the default icons are accepted.');
const icons = new Set([...folderIcons(opts.iconsDir).map(i => i.name), ...lucideNames(lucide)]);
let results = check(roots, { icons });
if (opts.fix) {
  const byFile = new Map();
  for (const r of results) if (r.fix) byFile.set(r.file, [...(byFile.get(r.file) ?? []), r]);
  let fixed = 0;
  for (const [file, list] of byFile) {
    const { text, applied } = applyFixes(readFileSync(file, 'utf8'), list);
    writeFileSync(file, text);
    fixed += applied;
  }
  if (fixed) console.log(`Fixed ${fixed} problem(s) in ${byFile.size} file(s).\n`);
  results = check(roots, { icons });
}
for (const r of results) console.log(`${r.file}:${r.line}:${r.col} ${r.severity} ${r.code} ${r.message}`);
const errors = results.filter(r => r.severity === 'error').length;
const warnings = results.length - errors;
const fixable = results.filter(r => r.fix).length;
if (results.length) console.log(`\n${errors} error(s), ${warnings} warning(s)${fixable ? `; ${fixable} fixable with --fix` : ''}`);
// with Lucide on demand, icons whose names the source does not show are not emitted (a notice, not a failure)
if (lucide) {
  const notice = unresolvedIconsNotice(usedIcons(roots).unresolved);
  if (notice) console.log(`\n${notice}`);
}
// Nudge toward checking the rendered result, which the static check cannot see.
try {
  (await import('node:module')).createRequire(process.cwd() + '/').resolve('@tiaforge-ui/temper-inspect/package.json');
  console.log('Next, check the rendered page: npx temper-inspect <dev-server-url> --sheet <dir>  (every dialog and popover, wide and narrow, light and dark; one image per page)');
} catch {}
process.exit(errors || (opts.strict && warnings) ? 1 : 0);

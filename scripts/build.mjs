// Bundles and minifies src/*.css and src/enhance/*.css into dist/ with Lightning CSS and enforces the size budgets.
import { bundle } from 'lightningcss';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const v = (major, minor = 0) => (major << 16) | (minor << 8);
// Baseline 2024: the first versions with light-dark(). Nothing newer gets lowered or prefixed.
const targets = { chrome: v(123), firefox: v(120), safari: v(17, 5) };
const budgets = { 'core.css': 5 * 1024, 'all.css': 16 * 1024, 'icons.css': 6 * 1024 }; // brotli bytes; modules default to 1.5 KB
const moduleBudget = 1.5 * 1024;

mkdirSync(root + 'dist/enhance', { recursive: true });
let failed = false;
const css = dir => readdirSync(root + 'src/' + dir).filter(f => f.endsWith('.css')).map(f => dir + f);
// enhancements (opt-in, see SPEC §1.5) get the module budget
for (const file of [...css(''), ...css('enhance/')]) {
  const { code } = bundle({ filename: root + 'src/' + file, minify: true, targets });
  writeFileSync(root + 'dist/' + file, code);
  const br = brotliCompressSync(code).length, gz = gzipSync(code, { level: 9 }).length;
  const budget = budgets[file] ?? moduleBudget;
  const ok = br <= budget;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} dist/${file}  ${code.length} B min, ${gz} B gzip, ${br} B brotli (budget ${budget} B)`);
}
if (failed) { console.error('Size budget exceeded.'); process.exit(1); }

// Bundles and minifies src/*.css and src/enhance/*.css into dist/ with Lightning CSS and enforces the size budgets.
import { bundle } from 'lightningcss';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const v = (major, minor = 0) => (major << 16) | (minor << 8);
// Baseline 2024: the first versions with light-dark(). Nothing newer gets lowered or prefixed. iOS Safari is listed
// apart: only it reads -webkit-text-size-adjust (desktop Safari has no text-size-adjust), which was dropped without it.
const targets = { chrome: v(123), firefox: v(120), safari: v(17, 5), ios_saf: v(17, 5) };
const budgets = { 'core.css': 6960, 'all.css': 15300, 'icons.css': 2850, 'expressive.css': 2100 }; // brotli bytes, about 2 % above the current size (set 2026-11-24 after two minimization passes; core.css raised 2026-11-25 for whole-pixel centering; all.css raised and expressive.css set 2026-11-26 for the expressive module, which is opt-in; all.css raised again 2026-11-26 for drag.css and the sinter-alloy requests T2–T6): a small fix fits, growth is a decision; modules default to 1.5 KB
const moduleBudget = 1.5 * 1024;

mkdirSync(root + 'dist/enhance', { recursive: true });
let failed = false;
const css = dir => readdirSync(root + 'src/' + dir).filter(f => f.endsWith('.css')).map(f => dir + f);
// enhancements (opt-in, see SPEC §1.5) get the module budget
// Lightning CSS adds -webkit-text-decoration-color for Safari when the value is one it cannot resolve (our
// color-mix() with currentColor), though it leaves a plain color unprefixed: Safari reads the unprefixed property
// since 12.1, so the copy only costs bytes.
const unprefix = css => css.replace(/-webkit-text-decoration-color:[^;}]*;/g, '');
for (const file of [...css(''), ...css('enhance/')]) {
  const code = Buffer.from(unprefix(bundle({ filename: root + 'src/' + file, minify: true, targets }).code.toString()));
  writeFileSync(root + 'dist/' + file, code);
  const br = brotliCompressSync(code).length, gz = gzipSync(code, { level: 9 }).length;
  const budget = budgets[file] ?? moduleBudget;
  const ok = br <= budget;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} dist/${file}  ${code.length} B min, ${gz} B gzip, ${br} B brotli (budget ${budget} B)`);
}
if (failed) { console.error('Size budget exceeded.'); process.exit(1); }

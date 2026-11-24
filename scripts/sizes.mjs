// The size budgets paragraph and the size table in README.md (between <!-- sizes --> and <!-- /sizes -->), from a
// real build: runs scripts/build.mjs and reads the sizes it prints.
// Usage: node scripts/sizes.mjs [--check]
//   without --check: rewrites the section when it is stale (part of npm run gen)
//   --check: fails when it is stale (part of npm test)
// Brotli output can differ by a few bytes between Node versions (CI runs 22, 24 and 26), so sizes are compared at the
// table's precision (0.1 KB) with a small tolerance, and percentages within 1 point: a section that passes is left as it is.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const README = root + 'README.md';
const START = '<!-- sizes -->', END = '<!-- /sizes -->';
const TODO = 'TODO: describe what is in it';
const KB_TOLERANCE = 0.05 + 0.02; // half the table's precision, plus about 20 bytes
const PERCENT_TOLERANCE = 1;

/** { file, br, budget } for every file the build writes, from its output lines. */
export function buildSizes() {
  const run = spawnSync(process.execPath, [root + 'scripts/build.mjs'], { encoding: 'utf8' });
  const sizes = [...run.stdout.matchAll(/^[✓✗] dist\/(\S+)\s+\d+ B min, \d+ B gzip, (\d+) B brotli \(budget (\d+) B\)$/gm)]
    .map(m => ({ file: m[1], br: +m[2], budget: +m[3] }));
  if (!sizes.length) throw new Error(`scripts/build.mjs printed no sizes:\n${run.stdout}${run.stderr}`);
  return sizes;
}

const budgetKb = bytes => String(Math.round(bytes / 1024 * 10) / 10);

/**
 * The section for these sizes; descriptions (file → text) and the row order come from the current README.
 * precise: sizes and percentages with more decimals, to compare a section with (see matches).
 */
export function render(sizes, current = '', { precise = false } = {}) {
  const kb = bytes => (bytes / 1024).toFixed(precise ? 3 : 1);
  const pct = s => precise ? (s.br / s.budget * 100).toFixed(2) : Math.round(s.br / s.budget * 100);
  const rows = [...current.matchAll(/^\| `([^`]+)` \| [^|]* \| (.*) \|$/gm)].map(m => ({ file: m[1], what: m[2] }));
  const what = new Map(rows.map(r => [r.file, r.what]));
  const byFile = new Map(sizes.map(s => [s.file, s]));
  const order = rows.map(r => r.file).filter(f => byFile.has(f));
  for (const s of sizes) if (!order.includes(s.file)) order.splice(order.includes('all.css') ? order.indexOf('all.css') : order.length, 0, s.file);
  // the budget most files have is "every other file"; the others are named
  const counts = new Map();
  for (const s of sizes) counts.set(s.budget, (counts.get(s.budget) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const named = order.map(f => byFile.get(f)).filter(s => s.budget !== common);
  const list = items => items.join(', ').replace(/, ([^,]*)$/, ' and $1');
  return `${START}
**Size budgets are enforced.** \`npm run build\` fails above budget: ${named.map(s => `\`${s.file}\` ${budgetKb(s.budget)} KB`).join(', ')}, every other file ${budgetKb(common)} KB (brotli). Right now ${list(named.map((s, i) => i ? `\`${s.file}\` ${pct(s)} %` : `\`${s.file}\` uses ${pct(s)} % of its budget`))}, so real growth means raising a budget on purpose (in \`scripts/build.mjs\`). \`npm test\` checks this paragraph and the table against a real build; \`npm run gen\` rewrites them.

| File | brotli | What's in it |
|---|---|---|
${order.map(f => `| \`${f}\` | ${kb(byFile.get(f).br)} KB | ${what.get(f) ?? TODO} |`).join('\n')}
${END}`;
}

/** Is `current` the same as `expected` (rendered precise), apart from sizes and percentages within the tolerance? */
export function matches(current, expected) {
  const split = s => s.split(/(\d+(?:\.\d+)?)/);
  const a = split(current), b = split(expected);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (i % 2 === 0) { if (a[i] !== b[i]) return false; continue; }
    const unit = /^\s*(KB|%)/.exec(b[i + 1] ?? '')?.[1];
    const tolerance = unit === 'KB' ? KB_TOLERANCE : unit === '%' ? PERCENT_TOLERANCE : 0;
    if (Math.abs(Number(a[i]) - Number(b[i])) > tolerance + 1e-9) return false;
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const readme = readFileSync(README, 'utf8');
  const start = readme.indexOf(START), end = readme.indexOf(END);
  if (start < 0 || end < 0) { console.error(`README.md has no ${START} … ${END} section.`); process.exit(1); }
  const current = readme.slice(start, end + END.length);
  const sizes = buildSizes(), expected = render(sizes, current);
  const fresh = matches(current, render(sizes, current, { precise: true }));
  if (check) {
    if (!fresh || current.includes(TODO)) {
      console.error(`${process.env.GITHUB_ACTIONS ? '::error::' : ''}README.md: the size budgets and table are out of date${current.includes(TODO) ? ' (a row has no description)' : ''}. Run npm run gen. Expected:\n${expected}`);
      process.exit(1);
    }
  } else {
    if (!fresh) { writeFileSync(README, readme.slice(0, start) + expected + readme.slice(end + END.length)); console.log('wrote README.md (sizes)'); }
    if (expected.includes(TODO)) { console.error(`README.md: describe the new file(s) in the size table (the rows that say "${TODO}").`); process.exit(1); }
  }
}

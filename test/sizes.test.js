// The README size section (scripts/sizes.mjs): npm test runs `node scripts/sizes.mjs --check` against a real build;
// these test how it compares, without building.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, matches } from '../scripts/sizes.mjs';

const sizes = [
  { file: 'core.css', br: 6050, budget: 6144 },
  { file: 'app.css', br: 1394, budget: 1536 },
  { file: 'menu.css', br: 939, budget: 1536 },
  { file: 'all.css', br: 10811, budget: 11776 },
];
const current = render(sizes, '| `core.css` | 1.0 KB | tokens |\n| `app.css` | 1.0 KB | shell |\n| `menu.css` | 1.0 KB | menus |\n| `all.css` | 1.0 KB | everything |');

test('the section names the budgets, the share of each named one, and every file with its description', () => {
  assert.match(current, /fails above budget: `core\.css` 6 KB, `all\.css` 11\.5 KB, every other file 1\.5 KB \(brotli\)/);
  assert.match(current, /`core\.css` uses 98 % of its budget and `all\.css` 92 %/);
  assert.match(current, /\| `core\.css` \| 5\.9 KB \| tokens \|\n\| `app\.css` \| 1\.4 KB \| shell \|\n\| `menu\.css` \| 0\.9 KB \| menus \|\n\| `all\.css` \| 10\.6 KB \| everything \|/);
});

test('a few bytes of brotli difference between Node versions are tolerated, a real change is not', () => {
  const shifted = d => render(sizes.map(s => ({ ...s, br: s.br + d })), current, { precise: true });
  assert.ok(matches(current, shifted(12)));  // 6062 B is still 5.9 KB
  assert.ok(matches(current, shifted(-20))); // 10791 B rounds to 10.5 KB, but is within 0.07 KB of the table's 10.6
  assert.ok(!matches(current, shifted(200)));
  assert.ok(!matches(current, render(sizes, current.replace('| shell |', '| the shell |'), { precise: true })));
});

test('a file without a row gets one to describe, before all.css', () => {
  const out = render([...sizes, { file: 'prose.css', br: 900, budget: 1536 }], current);
  assert.match(out, /\| `prose\.css` \| 0\.9 KB \| TODO: describe what is in it \|\n\| `all\.css` /);
});

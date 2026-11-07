// WCAG AA for the default palette and the kitchen-sink theme examples, resolved by headless Chrome.
// Skipped when no Chrome/Chromium is installed. The full hue sweep is `npm run contrast`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { findBrowser } from '../packages/inspect/lib/cdp.js';
import { validate } from '../scripts/contrast.mjs';

let browser = null;
try { browser = findBrowser(); } catch {}
const themes = fileURLToPath(new URL('../kitchen-sink/theme-examples.css', import.meta.url));
const fails = data => data.results.filter(r => r.ratio < r.min)
  .map(r => `${r.scheme} ${r.label}: ${r.ratio.toFixed(2)} < ${r.min} (${r.fg} on ${r.bg})`);

for (const [name, opts] of [
  ['default palette', {}],
  ['Ink example', { css: [themes], rootAttrs: [['data-example-theme', 'ink']] }],
  ['Fjord example', { css: [themes], rootAttrs: [['data-example-theme', 'fjord']] }],
]) {
  test(`${name} meets WCAG AA in light and dark`, { skip: !browser && 'no Chrome/Chromium found' }, async () => {
    const data = await validate({ ...opts, hues: [null], tints: [null], capTo: 0 });
    assert.deepEqual(fails(data), []);
  });
}

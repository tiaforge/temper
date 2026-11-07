// vocab.json and src/*.css must describe exactly the same vocabulary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const vocab = JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));
const css = readdirSync(new URL('../src/', import.meta.url))
  .filter(f => f.endsWith('.css'))
  .map(f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');

const selectors = new Set([...css.matchAll(/\[(data-[a-z-]+)(?:="([^"]*)")?\]/g)].map(m => m[2] ? `${m[1]}=${m[2]}` : m[1]));
const declared = new Set([...css.matchAll(/(--ts-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const used = new Set([...css.matchAll(/var\((--ts-[a-z0-9-]+)/g)].map(m => m[1]));

test('every vocab attribute and value has a CSS selector', () => {
  for (const [name, spec] of Object.entries(vocab.attributes)) {
    if (spec.boolean) assert.ok(selectors.has(name), `no selector for [${name}]`);
    else for (const v of Object.keys(spec.values)) assert.ok(selectors.has(`${name}=${v}`), `no selector for [${name}="${v}"]`);
  }
});

test('every attribute selector in the CSS is in the vocab', () => {
  for (const s of selectors) {
    const [name, value] = s.split('=');
    const spec = vocab.attributes[name];
    assert.ok(spec, `[${name}] is styled but missing from vocab.json`);
    if (value) assert.ok(spec.values?.[value] !== undefined, `[${name}="${value}"] is styled but missing from vocab.json`);
  }
});

test('every token in the CSS is in the vocab', () => {
  for (const t of new Set([...declared, ...used])) {
    if (t.startsWith('--ts-icon-')) continue; // --ts-icon-<name>, one per icon
    assert.ok(vocab.tokens[t], `${t} is missing from vocab.json`);
  }
});

test('every vocab token is declared in the CSS, unless optional', () => {
  for (const [t, spec] of Object.entries(vocab.tokens)) {
    if (spec.pattern) continue;
    if (spec.optional) assert.ok(used.has(t), `optional ${t} is never used`);
    else assert.ok(declared.has(t), `${t} is in vocab.json but never declared`);
  }
});

test('llms.txt has balanced code fences', () => {
  const llms = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');
  assert.equal((llms.match(/^```/gm) ?? []).length % 2, 0, 'an unclosed ``` block in docs/llms.template.md');
});

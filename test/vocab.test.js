// vocab.json and src/*.css must describe exactly the same vocabulary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const vocab = JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8'));
const css = ['', 'enhance/'].flatMap(dir => readdirSync(new URL('../src/' + dir, import.meta.url))
  .filter(f => f.endsWith('.css'))
  .map(f => readFileSync(new URL('../src/' + dir + f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')))
  .join('\n');

const selectors = new Set([...css.matchAll(/\[(data-[a-z-]+)(?:="([^"]*)")?\]/g)].map(m => m[2] ? `${m[1]}=${m[2]}` : m[1]));
const declared = new Set([...css.matchAll(/(--tm-[a-z0-9-]+)\s*:/g)].map(m => m[1]));
const used = new Set([...css.matchAll(/var\((--tm-[a-z0-9-]+)/g)].map(m => m[1]));

test('every vocab attribute and value has a CSS selector', () => {
  for (const [name, spec] of Object.entries(vocab.attributes)) {
    if (spec.boolean) assert.ok(selectors.has(name), `no selector for [${name}]`);
    else for (const v of Object.keys(spec.values)) assert.ok(selectors.has(`${name}=${v}`), `no selector for [${name}="${v}"]`);
  }
});

const dep = vocab.deprecated;
test('every attribute selector in the CSS is in the vocab', () => {
  for (const s of selectors) {
    const [name, value] = s.split('=');
    if (dep.attributes[name] || (value && dep.values[name]?.[value] !== undefined)) continue; // still styled until removed
    const spec = vocab.attributes[name];
    assert.ok(spec, `[${name}] is styled but missing from vocab.json`);
    if (value) assert.ok(spec.values?.[value] !== undefined, `[${name}="${value}"] is styled but missing from vocab.json`);
  }
});

test('deprecated names keep working until they are removed', () => {
  for (const [old, now] of Object.entries(dep.attributes)) {
    assert.ok(selectors.has(old), `deprecated [${old}] has no selector any more`);
    assert.ok(vocab.attributes[now], `deprecated ${old} points to unknown ${now}`);
  }
  for (const [name, values] of Object.entries(dep.values)) for (const [old, now] of Object.entries(values)) {
    assert.ok(selectors.has(`${name}=${old}`), `deprecated [${name}="${old}"] has no selector any more`);
    assert.ok(vocab.attributes[name]?.values?.[now] !== undefined, `deprecated ${name}="${old}" points to unknown "${now}"`);
  }
  for (const [old, now] of Object.entries(dep.tokens)) {
    assert.ok(declared.has(old), `deprecated ${old} is not declared any more (alias it: ${old}: var(${now}))`);
    assert.ok(vocab.tokens[now], `deprecated ${old} points to unknown ${now}`);
  }
});

test('every token in the CSS is in the vocab', () => {
  for (const t of new Set([...declared, ...used])) {
    if (t.startsWith('--tm-icon-') || dep.tokens[t]) continue; // --tm-icon-<name>, one per icon
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

for (const file of ['llms.txt', 'llms-full.txt']) {
  test(`${file} has balanced code fences and no template markers`, () => {
    const llms = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.equal((llms.match(/^```/gm) ?? []).length % 2, 0, 'an unclosed ``` block in docs/llms.template.md');
    assert.doesNotMatch(llms, /<!-- \/?(full|short) -->|\{\{\w+\}\}/);
  });
}

test('llms.txt stays short', () => { // 12000 until feedback.css and table.css (2026-11-07)
  const short = readFileSync(new URL('../llms.txt', import.meta.url), 'utf8');
  assert.ok(short.length < 13000, `llms.txt is ${short.length} bytes; move detail to llms-full.txt (full-only blocks)`);
});

test('dialog and card headers and footers are flex rows', () => {
  // Guards against selector-list edits that move these selectors onto another rule (happened once).
  for (const part of ['header', 'footer']) {
    const rule = css.match(new RegExp(`:where\\(dialog, article\\) > :where\\(${part}\\)[^{]*\\{([^}]*)\\}`));
    assert.ok(rule, `no rule for dialog/article > ${part}`);
    assert.match(rule[1], /display:\s*flex/, `dialog/article > ${part} is not display: flex`);
  }
});

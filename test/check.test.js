import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkMarkup, checkStyles, check, applyFixes } from '../lib/check.js';

const codes = r => r.map(d => d.code);

test('the kitchen sink has no errors', () => {
  const errors = check([new URL('../kitchen-sink', import.meta.url).pathname]).filter(d => d.severity === 'error');
  assert.deepEqual(errors, []);
});

test('a value from another axis suggests that axis', () => {
  const [d] = checkMarkup('<button data-variant="danger">Delete</button>');
  assert.equal(d.code, 'TS101');
  assert.match(d.message, /Did you mean data-tone="danger"\?/);
});

test('data-variant="primary" explains the default', () => {
  assert.match(checkMarkup('<button data-variant="primary">Save</button>')[0].message, /Leave data-variant out/);
});

test('typos in values get a suggestion', () => {
  assert.match(checkMarkup('<div data-layout="stak"></div>')[0].message, /Did you mean "stack"\?/);
});

test('numeric gaps are rejected', () => {
  const [d] = checkMarkup('<div data-layout="stack" data-gap="4"></div>');
  assert.equal(d.code, 'TS101');
  assert.match(d.message, /allowed: none, xs, sm, md, lg, xl/);
});

test('boolean attributes must not have a value', () => {
  assert.deepEqual(codes(checkMarkup('<span data-badge="true">3</span>')), ['TS102']);
  assert.deepEqual(codes(checkMarkup('<span data-badge>3</span><span data-badge="">3</span>')), []);
});

test('icon buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button data-icon data-variant="ghost">×</button>')), ['TS103']);
  assert.deepEqual(codes(checkMarkup('<button data-icon aria-label="Close">×</button>')), []);
});

test('empty close buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close"></button>')), ['TS103']);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" aria-label="Close"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close">Cancel</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" data-sn-text="m.cancel()"></button>')), []);
});

test('icons: known names pass, typos get a suggestion, project icons count', () => {
  assert.deepEqual(codes(checkMarkup('<span data-icon="mail"></span><button data-icon="plus">New</button>')), []);
  const [d] = checkMarkup('<span data-icon="maill"></span>');
  assert.equal(d.code, 'TS105');
  assert.match(d.message, /Did you mean "mail"\?/);
  assert.deepEqual(codes(checkMarkup('<span data-icon="rocket"></span>', 'a', { icons: new Set(['rocket']) })), []);
});

test('icon-only buttons need a label, icon + text buttons do not', () => {
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus"></button>')), ['TS103']);
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus" aria-label="New contact"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus">New contact</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-icon><svg></svg></button>')), ['TS103']);
});

test('fields need a label (warning)', () => {
  assert.deepEqual(codes(checkMarkup('<input type="search" placeholder="Search">')), ['TS106']);
  assert.deepEqual(codes(checkMarkup('<label>Name <input></label><label for="e">Email</label><input id="e">')), []);
  assert.deepEqual(codes(checkMarkup('<select aria-label="Type"></select><input data-sn-attr="{\'aria-label\': m.x()}"><input type="hidden">')), []);
});

test('layout attributes need data-layout', () => {
  assert.deepEqual(codes(checkMarkup('<div data-gap="sm" data-justify="end"></div>')), ['TS107']);
  assert.deepEqual(codes(checkMarkup('<div data-layout="row" data-gap="sm"></div><dl data-pairs></dl>')), []);
});

test('misspelled attribute names are warnings', () => {
  const [d] = checkMarkup('<button data-varient="ghost">x</button>');
  assert.equal(d.severity, 'warning');
  assert.match(d.message, /Did you mean data-variant\?/);
});

test('dynamic values and sinter attributes are skipped', () => {
  assert.deepEqual(checkMarkup('<button data-variant={v} data-tone="{tone}" data-sn-attr="{x: 1}">x</button>'), []);
});

test('positions are reported', () => {
  const [d] = checkMarkup('<p>ok</p>\n  <button data-tone="red">x</button>', 'a.html');
  assert.equal(d.file, 'a.html');
  assert.equal(d.line, 2);
});

test('unknown tokens get a suggestion', () => {
  const [d] = checkStyles('.x { color: var(--ts-text-mute); }');
  assert.equal(d.code, 'TS201');
  assert.match(d.message, /Did you mean --ts-text-muted\?/);
});

test('setting inputs is fine, setting derived or unknown tokens warns', () => {
  assert.deepEqual(checkStyles(':root { --ts-hue: 30; --ts-primary: var(--ts-accent); }'), []);
  assert.deepEqual(codes(checkStyles(':root { --ts-tone-ink: red; --ts-brand: red; }')), ['TS203', 'TS202']);
});

// ───── computed values ─────

test('outcomes: literals, ternaries and logical operators', async () => {
  const { outcomes } = await import('../lib/check.js');
  assert.deepEqual(outcomes(`a ? 'danger' : "success"`), ['danger', 'success']);
  assert.deepEqual(outcomes(`a ? (b ? 'x' : 'y') : null`), ['x', 'y', null]);
  assert.deepEqual(outcomes(`tone ?? 'neutral'`).slice(-1), ['neutral']);
  assert.equal(outcomes(`a && 'x'`).length, 2);
  assert.deepEqual(outcomes(`f(a, b ? 'q' : 'r')`).length, 1); // a call: unknown
  assert.deepEqual(outcomes(`a === b`), [true, false]);
});

test('Svelte: every literal a {expression} can produce is checked', () => {
  const r = checkMarkup(`<span data-tone={failed ? 'danger' : 'sucess'}>x</span>`, 'A.svelte');
  assert.deepEqual(codes(r), ['TS101']);
  assert.match(r[0].message, /data-tone="sucess" is not valid \(a value of this expression\)\. Did you mean "success"\?/);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed ? 'danger' : null}>x</span><span data-tone={tone}>x</span>`, 'A.svelte')), []);
  assert.deepEqual(codes(checkMarkup(`<span data-tone="{failed ? 'danger' : 'nope'}">x</span>`, 'A.svelte')), ['TS101']);
});

test('false renders the attribute in Svelte, JSX, Vue and Astro, but not in sinter', () => {
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'A.svelte')), ['TS111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'A.tsx')), ['TS111']);
  assert.deepEqual(codes(checkMarkup(`<span :data-tone="failed && 'danger'">x</span>`, 'A.vue')), ['TS111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'a.astro')), ['TS111']);
  assert.deepEqual(codes(checkMarkup(`<span data-sn-attr="{'data-tone': failed && 'danger'}">x</span>`, 'a.html')), []);
  // a bare boolean on a boolean attribute is the common case of this bug
  const [w] = checkMarkup(`<nav data-rail data-collapsed={collapsed}></nav>`, 'A.svelte');
  assert.equal(w.severity, 'warning');
  assert.match(w.message, /collapsed \|\| null/);
  assert.deepEqual(codes(checkMarkup(`<nav data-rail data-collapsed={collapsed || null}></nav>`, 'A.svelte')), []);
});

test('Vue bindings and sinter data-sn-attr values are checked', () => {
  assert.deepEqual(codes(checkMarkup(`<b :data-variant="x ? 'ghost' : 'danger'">x</b>`, 'A.vue')), ['TS101', 'TS108']);
  const src = `<span data-badge data-sn-attr="{'data-tone': bad ? 'danger' : 'oops', title: t}">x</span>`;
  const [d] = checkMarkup(src, 'a.html');
  assert.equal(d.code, 'TS101');
  assert.equal(d.col, src.indexOf('bad ?') + 1); // at the entry's value, not the attribute
});

test('nested braces in attributes do not hide the tag', () => {
  assert.deepEqual(codes(checkMarkup(`<button onclick={() => { open = true }} data-variant="danger">x</button>`, 'A.svelte')), ['TS101']);
});

// ───── context ─────

test('attributes on elements they do not work on', () => {
  assert.deepEqual(codes(checkMarkup('<div data-pairs></div>')), ['TS108']);
  const [d] = checkMarkup('<a href="/x" data-variant="outline">x</a>');
  assert.match(d.message, /Add role="button"/);
  assert.deepEqual(codes(checkMarkup('<a href="/x" data-variant="item">x</a><a href="/x" role="button" data-variant="ghost">x</a>')), []);
  assert.deepEqual(codes(checkMarkup('<Button data-variant="ghost">x</Button>', 'A.svelte')), []); // components pass props on
});

test('attributes that need another one on the same element', () => {
  assert.deepEqual(codes(checkMarkup('<div data-layout="stack" data-cols="3"></div>')), ['TS107']);
  assert.deepEqual(codes(checkMarkup('<div data-layout="grid" data-cols="3"></div><nav data-rail data-collapsed></nav>')), []);
});

test('parents and ancestors', () => {
  const [d] = checkMarkup('<body><div><nav data-rail></nav></div></body>');
  assert.equal(d.code, 'TS109');
  assert.match(d.message, /direct child of \[data-shell\]; here its parent is <div>/);
  assert.deepEqual(codes(checkMarkup('<body data-shell><template data-sn-if="x"><nav data-rail></nav></template><main></main></body>')), []);
  assert.deepEqual(codes(checkMarkup('<body><a data-stretch href="/">x</a></body>')), ['TS109']);
  assert.deepEqual(codes(checkMarkup('<a data-stretch href="/">x</a>', 'Card.svelte')), []); // a component: the article may be outside
  assert.deepEqual(codes(checkMarkup('<Card><a data-stretch href="/">x</a></Card>', 'A.svelte')), []);
  // grow/self: warnings, and only when the parent is plain (no class or style of its own)
  const [w] = checkMarkup('<div><input data-grow aria-label="q"></div>');
  assert.equal(w.severity, 'warning');
  assert.deepEqual(codes(checkMarkup('<div class="bar"><input data-grow aria-label="q"></div><header><span data-grow></span></header>')), []);
});

test('modules the project does not import', () => {
  const r = checkMarkup('<nav data-rail></nav><div data-menu></div><div data-menu></div>', 'a.html', { modules: new Set(['core']) });
  assert.deepEqual(codes(r), ['TS110', 'TS110']);
  assert.match(r[0].message, /data-rail needs app\.css, .*import '@tiaforge-ui\/tinystyle\/app\.css'/);
  assert.deepEqual(codes(checkMarkup('<nav data-rail></nav>', 'a.html', { modules: null })), []);
});

test('imports are found in JS, CSS and HTML; all.css counts as every module', async () => {
  const { importedModules } = await import('../lib/check.js');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/ts-mod-');
  writeFileSync(dir + '/main.ts', `import '@tiaforge-ui/tinystyle/core.css';\nimport "@tiaforge-ui/tinystyle/menu.css";`);
  assert.deepEqual([...importedModules([dir])].sort(), ['core', 'menu']);
  writeFileSync(dir + '/index.html', `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tiaforge-ui/tinystyle@0.1.0/dist/all.css">`);
  assert.ok(importedModules([dir]).has('app'));
  assert.equal(importedModules([mkdtempSync(tmpdir() + '/ts-mod-')]), null);
});

test('an empty data-tooltip needs an aria-label to show', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tooltip>Save</button>')), ['TS103']);
  assert.deepEqual(codes(checkMarkup('<button data-tooltip aria-label="Save" data-icon="check"></button><span data-tooltip="Synced">x</span>')), []);
});

test('data-layout on table parts and data-num off cells', () => {
  assert.deepEqual(codes(checkMarkup('<table><tr><td data-layout="row">x</td></tr></table>')), ['TS108']);
  assert.deepEqual(codes(checkMarkup('<span data-num>3</span>')), ['TS108']);
  assert.deepEqual(codes(checkMarkup('<table><tr><td data-num><div data-layout="row">3</div></td></tr></table>')), []);
});

// ───── fixes and deprecations ─────

const applyFixesTo = (src, diags) => applyFixes(src, diags).text;
const fixed = (src, file = 'a.html', ctx) => applyFixesTo(src, checkMarkup(src, file, ctx));

test('--fix: wrong axis, typos, boolean values, primary', () => {
  assert.equal(fixed('<button data-variant="danger">x</button>'), '<button data-tone="danger">x</button>');
  assert.equal(fixed('<div data-layout="stak"></div>'), '<div data-layout="stack"></div>');
  assert.equal(fixed('<span data-badge="true">3</span>'), '<span data-badge>3</span>');
  assert.equal(fixed('<button data-variant="primary" type="submit">x</button>'), '<button type="submit">x</button>');
  assert.equal(fixed('<button data-varient="ghost">x</button>'), '<button data-variant="ghost">x</button>');
  assert.equal(fixed('<span data-icon="maill"></span>'), '<span data-icon="mail"></span>');
  // two fixes in one tag, both applied
  assert.equal(fixed('<button data-variant="danger" data-size="smm">x</button>'), '<button data-tone="danger" data-size="sm">x</button>');
});

test('--fix leaves ambiguous and conflicting cases alone', () => {
  // data-tone is already set: moving danger there would lose a value
  const src = '<button data-variant="danger" data-tone="accent">x</button>';
  assert.equal(fixed(src), src);
  // computed values are reported, not rewritten
  const svelte = `<span data-tone={x ? 'danger' : 'sucess'}>x</span>`;
  assert.equal(fixed(svelte, 'A.svelte'), svelte);
  // equally close candidates: no guess ("ss" is one edit from both sm and xs)
  assert.equal(checkMarkup('<div data-layout="row" data-gap="ss"></div>')[0].fix, undefined);
});

test('--fix for tokens', () => {
  const css = '.x { color: var(--ts-text-mute); }';
  assert.equal(applyFixesTo(css, checkStyles(css)), '.x { color: var(--ts-text-muted); }');
});

test('deprecated names warn (TS112), keep working and get rewritten', () => {
  const vocab = structuredClone(JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8')));
  vocab.deprecated = { attributes: { 'data-kind': 'data-variant' }, values: { 'data-variant': { subtle: 'ghost' } }, tokens: { '--ts-muted': '--ts-text-muted' } };
  const r = checkMarkup('<button data-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab });
  assert.deepEqual(codes(r), ['TS112', 'TS112']);
  assert.equal(r[0].severity, 'warning');
  assert.equal(fixed('<button data-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab }),
    '<button data-variant="ghost">x</button><button data-variant="outline">y</button>');
  // the old attribute's value is still checked against the new one
  assert.deepEqual(codes(checkMarkup('<button data-kind="nope">x</button>', 'a.html', { vocab })), ['TS112', 'TS101']);
  const css = ':root { --ts-muted: red; } .x { color: var(--ts-muted); }';
  assert.equal(applyFixesTo(css, checkStyles(css, 'a.css', { vocab })), ':root { --ts-text-muted: red; } .x { color: var(--ts-text-muted); }');
});

test('the CLI fixes files and reports what is left', async () => {
  const { mkdtempSync, writeFileSync, readFileSync: read } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(tmpdir() + '/ts-fix-');
  writeFileSync(dir + '/a.html', '<button data-variant="danger">x</button>\n<div data-gap="ss"></div>\n');
  const before = spawnSync(process.execPath, [new URL('../bin/tinystyle.js', import.meta.url).pathname, 'check', dir], { encoding: 'utf8' });
  assert.match(before.stdout, /1 fixable with --fix/);
  const run = spawnSync(process.execPath, [new URL('../bin/tinystyle.js', import.meta.url).pathname, 'check', '--fix', dir], { encoding: 'utf8' });
  assert.match(run.stdout, /Fixed 1 problem\(s\) in 1 file\(s\)/);
  assert.match(run.stdout, /data-gap="ss" is not valid/);
  assert.equal(read(dir + '/a.html', 'utf8'), '<button data-tone="danger">x</button>\n<div data-gap="ss"></div>\n');
});

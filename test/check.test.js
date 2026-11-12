import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMarkup, checkStyles, check, applyFixes } from '../lib/check.js';

const codes = r => r.map(d => d.code);

test('the kitchen sink has no errors', () => {
  const errors = check([new URL('../kitchen-sink', import.meta.url).pathname]).filter(d => d.severity === 'error');
  assert.deepEqual(errors, []);
});

test('a value from another axis suggests that axis', () => {
  const [d] = checkMarkup('<button data-variant="danger">Delete</button>');
  assert.equal(d.code, 'TM101');
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
  assert.equal(d.code, 'TM101');
  assert.match(d.message, /allowed: none, xs, sm, md, lg, xl/);
});

test('boolean attributes must not have a value', () => {
  assert.deepEqual(codes(checkMarkup('<span data-badge="true">3</span>')), ['TM102']);
  assert.deepEqual(codes(checkMarkup('<span data-badge>3</span><span data-badge="">3</span>')), []);
});

test('icon buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button data-icon data-variant="ghost">×</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-icon aria-label="Close">×</button>')), []);
});

test('empty close buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close"></button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" aria-label="Close"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close">Cancel</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" data-sn-text="m.cancel()"></button>')), []);
});

test('icons: known names pass, typos get a suggestion, project icons count', () => {
  assert.deepEqual(codes(checkMarkup('<span data-icon="mail"></span><button data-icon="plus">New</button>')), []);
  const [d] = checkMarkup('<span data-icon="maill"></span>');
  assert.equal(d.code, 'TM105');
  assert.match(d.message, /Did you mean "mail"\?/);
  assert.deepEqual(codes(checkMarkup('<span data-icon="rocket"></span>', 'a', { icons: new Set(['rocket']) })), []);
});

test('icon-only buttons need a label, icon + text buttons do not', () => {
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus"></button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus" aria-label="New contact"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-icon="plus">New contact</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-icon><svg></svg></button>')), ['TM103']);
});

test('fields need a label (warning)', () => {
  assert.deepEqual(codes(checkMarkup('<input type="search" placeholder="Search">')), ['TM106']);
  assert.deepEqual(codes(checkMarkup('<label>Name <input></label><label for="e">Email</label><input id="e">')), []);
  assert.deepEqual(codes(checkMarkup('<select aria-label="Type"></select><input data-sn-attr="{\'aria-label\': m.x()}"><input type="hidden">')), []);
});

test('layout attributes need data-layout', () => {
  assert.deepEqual(codes(checkMarkup('<div data-gap="sm" data-justify="end"></div>')), ['TM107']);
  assert.deepEqual(codes(checkMarkup('<div data-layout="row" data-gap="sm"></div><dl data-pairs></dl>')), []);
  // a button is a flex row already: data-justify and data-align work on it without data-layout
  assert.deepEqual(codes(checkMarkup('<button data-justify="start" data-align="start">From</button><a role="button" data-justify="end">x</a>')), []);
  assert.deepEqual(codes(checkMarkup('<span data-justify="start">x</span>')), ['TM107']);
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
  const [d] = checkStyles('.x { color: var(--tm-text-mute); }');
  assert.equal(d.code, 'TM201');
  assert.match(d.message, /Did you mean --tm-text-muted\?/);
});

test('setting inputs is fine, setting derived or unknown tokens warns', () => {
  assert.deepEqual(checkStyles(':root { --tm-hue: 30; --tm-primary: var(--tm-accent); }'), []);
  assert.deepEqual(codes(checkStyles(':root { --tm-tone-ink: red; --tm-brand: red; }')), ['TM203', 'TM202']);
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
  assert.deepEqual(codes(r), ['TM101']);
  assert.match(r[0].message, /data-tone="sucess" is not valid \(a value of this expression\)\. Did you mean "success"\?/);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed ? 'danger' : null}>x</span><span data-tone={tone}>x</span>`, 'A.svelte')), []);
  assert.deepEqual(codes(checkMarkup(`<span data-tone="{failed ? 'danger' : 'nope'}">x</span>`, 'A.svelte')), ['TM101']);
});

test('false renders the attribute in Svelte, JSX, Vue and Astro, but not in sinter', () => {
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'A.svelte')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'A.tsx')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span :data-tone="failed && 'danger'">x</span>`, 'A.vue')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tone={failed && 'danger'}>x</span>`, 'a.astro')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-sn-attr="{'data-tone': failed && 'danger'}">x</span>`, 'a.html')), []);
  // a bare boolean on a boolean attribute is the common case of this bug
  const [w] = checkMarkup(`<nav data-rail data-collapsed={collapsed}></nav>`, 'A.svelte');
  assert.equal(w.severity, 'warning');
  assert.match(w.message, /collapsed \|\| null/);
  assert.deepEqual(codes(checkMarkup(`<nav data-rail data-collapsed={collapsed || null}></nav>`, 'A.svelte')), []);
});

test('Vue bindings and sinter data-sn-attr values are checked', () => {
  assert.deepEqual(codes(checkMarkup(`<b :data-variant="x ? 'ghost' : 'danger'">x</b>`, 'A.vue')), ['TM101', 'TM108']);
  const src = `<span data-badge data-sn-attr="{'data-tone': bad ? 'danger' : 'oops', title: t}">x</span>`;
  const [d] = checkMarkup(src, 'a.html');
  assert.equal(d.code, 'TM101');
  assert.equal(d.col, src.indexOf('bad ?') + 1); // at the entry's value, not the attribute
});

test('nested braces in attributes do not hide the tag', () => {
  assert.deepEqual(codes(checkMarkup(`<button onclick={() => { open = true }} data-variant="danger">x</button>`, 'A.svelte')), ['TM101']);
});

// ───── context ─────

test('attributes on elements they do not work on', () => {
  assert.deepEqual(codes(checkMarkup('<div data-pairs></div>')), ['TM108']);
  const [d] = checkMarkup('<a href="/x" data-variant="outline">x</a>');
  assert.match(d.message, /Add role="button"/);
  assert.deepEqual(codes(checkMarkup('<a href="/x" data-variant="item">x</a><a href="/x" role="button" data-variant="ghost">x</a>')), []);
  assert.deepEqual(codes(checkMarkup('<Button data-variant="ghost">x</Button>', 'A.svelte')), []); // components pass props on
});

test('attributes that need another one on the same element', () => {
  assert.deepEqual(codes(checkMarkup('<div data-layout="stack" data-cols="3"></div>')), ['TM107']);
  assert.deepEqual(codes(checkMarkup('<div data-layout="grid" data-cols="3"></div><nav data-rail data-collapsed></nav>')), []);
});

test('parents and ancestors', () => {
  const [d] = checkMarkup('<body><div><nav data-rail></nav></div></body>');
  assert.equal(d.code, 'TM109');
  assert.match(d.message, /direct child of \[data-shell\]; here its parent is <div>/);
  assert.deepEqual(codes(checkMarkup('<body data-shell><template data-sn-if="x"><nav data-rail></nav></template><main></main></body>')), []);
  assert.deepEqual(codes(checkMarkup('<body><a data-stretch href="/">x</a></body>')), ['TM109']);
  assert.deepEqual(codes(checkMarkup('<a data-stretch href="/">x</a>', 'Card.svelte')), []); // a component: the article may be outside
  assert.deepEqual(codes(checkMarkup('<Card><a data-stretch href="/">x</a></Card>', 'A.svelte')), []);
  // grow/self: warnings, and only when the parent is plain (no class or style of its own)
  const [w] = checkMarkup('<div><input data-grow aria-label="q"></div>');
  assert.equal(w.severity, 'warning');
  assert.deepEqual(codes(checkMarkup('<div class="bar"><input data-grow aria-label="q"></div><header><span data-grow></span></header>')), []);
});

test('modules the project does not import', () => {
  const r = checkMarkup('<nav data-rail></nav><div data-menu></div><div data-menu></div>', 'a.html', { modules: new Set(['core']) });
  assert.deepEqual(codes(r), ['TM110', 'TM110']);
  assert.match(r[0].message, /data-rail needs app\.css, .*import '@tiaforge-ui\/temper\/app\.css'/);
  assert.deepEqual(codes(checkMarkup('<nav data-rail></nav>', 'a.html', { modules: null })), []);
});

test('imports are found in JS, CSS and HTML; all.css counts as every module', async () => {
  const { importedModules } = await import('../lib/check.js');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/tm-mod-');
  writeFileSync(dir + '/main.ts', `import '@tiaforge-ui/temper/core.css';\nimport "@tiaforge-ui/temper/menu.css";`);
  assert.deepEqual([...importedModules([dir])].sort(), ['core', 'menu']);
  writeFileSync(dir + '/index.html', `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tiaforge-ui/temper@0.1.0/dist/all.css">`);
  assert.ok(importedModules([dir]).has('app'));
  assert.equal(importedModules([mkdtempSync(tmpdir() + '/tm-mod-')]), null);
});

test('an empty data-tooltip needs an aria-label to show', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tooltip>Save</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-tooltip aria-label="Save" data-icon="check"></button><span data-tooltip="Synced" tabindex="0">x</span>')), []);
});

test('data-layout on table parts and data-num off cells', () => {
  assert.deepEqual(codes(checkMarkup('<table><tr><th>h</th><td data-layout="row">x</td></tr></table>')), ['TM108']);
  assert.deepEqual(codes(checkMarkup('<span data-num>3</span>')), ['TM108']);
  assert.deepEqual(codes(checkMarkup('<table><tr><th>h</th><td data-num><div data-layout="row">3</div></td></tr></table>')), []);
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
  const css = '.x { color: var(--tm-text-mute); }';
  assert.equal(applyFixesTo(css, checkStyles(css)), '.x { color: var(--tm-text-muted); }');
});

test('deprecated names warn (TM112), keep working and get rewritten', () => {
  const vocab = structuredClone(JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8')));
  vocab.deprecated = { attributes: { 'data-kind': 'data-variant' }, values: { 'data-variant': { subtle: 'ghost' } }, tokens: { '--tm-muted': '--tm-text-muted' } };
  const r = checkMarkup('<button data-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab });
  assert.deepEqual(codes(r), ['TM112', 'TM112']);
  assert.equal(r[0].severity, 'warning');
  assert.equal(fixed('<button data-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab }),
    '<button data-variant="ghost">x</button><button data-variant="outline">y</button>');
  // the old attribute's value is still checked against the new one
  assert.deepEqual(codes(checkMarkup('<button data-kind="nope">x</button>', 'a.html', { vocab })), ['TM112', 'TM101']);
  const css = ':root { --tm-muted: red; } .x { color: var(--tm-muted); }';
  assert.equal(applyFixesTo(css, checkStyles(css, 'a.css', { vocab })), ':root { --tm-text-muted: red; } .x { color: var(--tm-text-muted); }');
});

test('the CLI fixes files and reports what is left', async () => {
  const { mkdtempSync, writeFileSync, readFileSync: read } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const dir = mkdtempSync(tmpdir() + '/tm-fix-');
  writeFileSync(dir + '/a.html', '<button data-variant="danger">x</button>\n<div data-gap="ss"></div>\n');
  const before = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', dir], { encoding: 'utf8' });
  assert.match(before.stdout, /1 fixable with --fix/);
  const run = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', '--fix', dir], { encoding: 'utf8' });
  assert.match(run.stdout, /Fixed 1 problem\(s\) in 1 file\(s\)/);
  assert.match(run.stdout, /data-gap="ss" is not valid/);
  assert.equal(read(dir + '/a.html', 'utf8'), '<button data-tone="danger">x</button>\n<div data-gap="ss"></div>\n');
});

// ───── app CSS against the library's rules (warnings) ─────

test('app CSS: !important, fixed colors, margins, scale values, restyled variants', () => {
  const css = `.card { color: #666 !important; margin-top: 1rem; padding: 16px 0.75rem; gap: 0.5rem; }
.ok { color: var(--tm-text-muted); background: color-mix(in oklab, var(--tm-accent) 10%, white); margin-inline: auto; margin: 0; padding: 0.75rem; }
:root { --brand: #e8590c; $x: red; }
button[data-variant="ghost"] { background: var(--tm-fill); padding: 0; }
[data-theme="dark"] .logo { filter: invert(1); }
.list [data-tone] { --tm-tone: var(--tm-info); }`;
  const r = checkStyles(css, 'a.css');
  assert.deepEqual(codes(r), ['TM204', 'TM205', 'TM206', 'TM207', 'TM207', 'TM208']);
  assert.match(r[1].message, /var\(--tm-text\) or var\(--tm-text-muted\)/);
  assert.equal(applyFixesTo(css, r).split('\n')[0], '.card { color: #666 !important; margin-top: 1rem; padding: var(--tm-space-md) 0.75rem; gap: var(--tm-space-sm); }');
});

test('inline styles: margins and paddings point to data-gap and data-pad; tokens are fine', () => {
  assert.deepEqual(codes(checkMarkup('<p style="margin-top: 8px; color: red">x</p>')), ['TM206', 'TM205']);
  assert.deepEqual(codes(checkMarkup('<div style="padding: 1rem">x</div>')), ['TM206']);
  assert.deepEqual(codes(checkMarkup('<div style="--tm-min: 12rem; --tm-tone: #e11">x</div>')), []);
});

test('style blocks in components are linted; markup outside them is not CSS', () => {
  const svelte = `<div style:color={c}>a: b;</div>\n<style>\n  .x { margin-bottom: 4px; }\n</style>`;
  const r = check([writeTemp('A.svelte', svelte)]);
  assert.deepEqual(codes(r), ['TM206']);
  assert.equal(r[0].line, 3);
});

test('temper-ignore silences a line', () => {
  const r = check([writeTemp('a.css', '.x { color: #333; }\n/* temper-ignore: the print logo */\n.y { color: #000; }\n')]);
  assert.deepEqual(r.map(d => d.line), [1]);
});

function writeTemp(name, text) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-lint-'));
  writeFileSync(join(dir, name), text);
  return dir;
}

test('--fix never guesses between axes that share a value', () => {
  // "sm" is a value of data-size, data-gap and data-pad: name them, apply nothing
  const [d] = checkMarkup('<button data-variant="sm">x</button>');
  assert.equal(d.code, 'TM101');
  assert.match(d.message, /"sm" is a value of data-size="sm", data-gap="sm" or data-pad="sm"/);
  assert.equal(d.fix, undefined);
  assert.equal(checkMarkup('<button data-size="center">x</button>')[0].fix, undefined);
  // one other axis: the value moves there
  assert.equal(fixed('<button data-variant="danger">x</button>'), '<button data-tone="danger">x</button>');
});

test('an icon or close button with only whitespace or a comment inside has no visible text', () => {
  assert.deepEqual(codes(checkMarkup('<button data-icon="x">\n</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close">\n  <!-- icon -->\n</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-icon="x">\n  New\n</button>')), []);
});

test('tokens in style attributes are checked in plain HTML files too', () => {
  const r = check([writeTemp('a.html', '<div style="color: var(--tm-txt)"></div>\n')]);
  assert.deepEqual(codes(r), ['TM201']);
  assert.match(r[0].message, /Did you mean --tm-text\?/);
});

// ───────────── structure and accessibility rules (TM113–TM121), fixes ─────────────

const doc = body => `<html><body>${body}</body></html>`;

test('--fix stubs a missing label, and the stub stays an error until it is replaced', () => {
  const src = '<button data-icon="x"></button>';
  const before = checkMarkup(src);
  assert.deepEqual(codes(before), ['TM103']);
  const { text } = applyFixes(src, before);
  assert.equal(text, '<button aria-label="TODO" data-icon="x"></button>');
  const after = checkMarkup(text);
  assert.deepEqual(codes(after), ['TM113']);
  assert.equal(after[0].severity, 'error');
  assert.deepEqual(checkMarkup(text.replace('TODO', 'Close')), []);
});

test('the label stub also covers close buttons, empty tooltips and requires', () => {
  assert.equal(applyFixes('<button data-tooltip>x</button>', checkMarkup('<button data-tooltip>x</button>')).text, '<button aria-label="TODO" data-tooltip>x</button>');
  const close = '<button command="close" commandfor="d"></button>';
  assert.deepEqual(codes(checkMarkup(applyFixes(close, checkMarkup(close)).text)), ['TM113']);
});

test('TM111: a bare boolean gets || null', () => {
  const src = '<script>let on;</script><div data-menu={on}></div>';
  const d = checkMarkup(src, 'a.svelte');
  const { text } = applyFixes(src, d);
  assert.match(text, /data-menu=\{on \|\| null\}/);
  assert.deepEqual(codes(checkMarkup(text, 'a.svelte')), []);
});

test('a dialog needs a name', () => {
  assert.deepEqual(codes(checkMarkup('<dialog><p>x</p></dialog>')), ['TM114']);
  assert.deepEqual(codes(checkMarkup('<dialog><h2>Title</h2></dialog>')), []);
  assert.deepEqual(codes(checkMarkup('<dialog aria-label="Title"><p>x</p></dialog>')), []);
  assert.deepEqual(codes(checkMarkup('<dialog><Header /></dialog>', 'a.svelte')), []); // a component may render the heading
  assert.deepEqual(codes(checkMarkup('<dialog>{@render children()}</dialog>', 'a.svelte')), []);
});

test('a table needs header cells', () => {
  assert.deepEqual(codes(checkMarkup('<table><tr><td>x</td></tr></table>')), ['TM115']);
  assert.deepEqual(codes(checkMarkup('<table><thead><tr><th scope="col">x</th></tr></thead></table>')), []);
  assert.deepEqual(codes(checkMarkup('<table role="presentation"><tr><td>x</td></tr></table>')), []);
});

test('a tooltip needs a focusable element', () => {
  assert.deepEqual(codes(checkMarkup('<span data-tooltip="Synced">x</span>')), ['TM116']);
  assert.deepEqual(codes(checkMarkup('<span data-tooltip="Synced" tabindex="0">x</span><a href="/" data-tooltip="x">y</a><button data-tooltip="z">z</button>')), []);
});

test('heading levels do not skip (documents only)', () => {
  assert.deepEqual(codes(checkMarkup(doc('<h1>a</h1><h2>b</h2><h4>c</h4>'))), ['TM117']);
  assert.deepEqual(codes(checkMarkup(doc('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>'))), []);
  assert.deepEqual(codes(checkMarkup('<h2>a</h2><h4>c</h4>')), []); // a fragment: the page around it is unknown
});

test('ids are unique and references point at one', () => {
  assert.deepEqual(codes(checkMarkup(doc('<p id="a"></p><p id="a"></p>'))), ['TM118']);
  const [d] = checkMarkup(doc('<button popovertarget="menu-1">x</button><div popover id="menu-l"></div>'));
  assert.equal(d.code, 'TM119');
  assert.equal(d.severity, 'error');
  assert.match(d.message, /Did you mean "menu-l"\?/);
  assert.deepEqual(codes(checkMarkup(doc('<label for="q">Q</label><input id="q"><p aria-labelledby="zz">x</p>'))), ['TM119']);
  // computed ids or components: the page is not fully known, so nothing is reported
  assert.deepEqual(codes(checkMarkup(doc('<button popovertarget="m">x</button><div id={id}></div>'), 'a.svelte')), []);
  assert.deepEqual(codes(checkMarkup(doc('<button popovertarget="m">x</button><Menu />'), 'a.svelte')), []);
});

test('a popover or dialog nothing opens', () => {
  assert.deepEqual(codes(checkMarkup(doc('<div popover id="m"></div>'))), ['TM120']);
  assert.deepEqual(codes(checkMarkup(doc('<button popovertarget="m">x</button><div popover id="m"></div>'))), []);
  assert.deepEqual(codes(checkMarkup(doc('<dialog id="d" aria-label="x"></dialog><script>d.showModal()</script>'))), []);
});

test('two solid buttons side by side', () => {
  assert.deepEqual(codes(checkMarkup('<div><button>Save</button><button>Send</button></div>')), ['TM121']);
  assert.deepEqual(codes(checkMarkup('<div><button>Save</button><button data-variant="ghost">Cancel</button></div>')), []);
  assert.deepEqual(codes(checkMarkup('<div><button role="tab">A</button><button role="tab">B</button></div>')), []);
});

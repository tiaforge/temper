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
  const [d] = checkMarkup('<button data-tm-variant="danger">Delete</button>');
  assert.equal(d.code, 'TM101');
  assert.match(d.message, /Did you mean data-tm-tone="danger"\?/);
});

test('data-tm-variant="primary" explains the default', () => {
  assert.match(checkMarkup('<button data-tm-variant="primary">Save</button>')[0].message, /Leave data-tm-variant out/);
});

test('typos in values get a suggestion', () => {
  assert.match(checkMarkup('<div data-tm-layout="stak"></div>')[0].message, /Did you mean "stack"\?/);
});

test('numeric gaps are rejected', () => {
  const [d] = checkMarkup('<div data-tm-layout="stack" data-tm-gap="4"></div>');
  assert.equal(d.code, 'TM101');
  assert.match(d.message, /allowed: none, xs, sm, md, lg, xl/);
});

test('boolean attributes must not have a value', () => {
  assert.deepEqual(codes(checkMarkup('<span data-tm-badge="true">3</span>')), ['TM102']);
  assert.deepEqual(codes(checkMarkup('<span data-tm-badge>3</span><span data-tm-badge="">3</span>')), []);
});

test('icon buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon data-tm-variant="ghost">×</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon aria-label="Close">×</button>')), []);
});

test('empty close buttons need a label', () => {
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close"></button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" aria-label="Close"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close">Cancel</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close" data-sn-text="m.cancel()"></button>')), []);
});

test('icons: known names pass, typos get a suggestion, project icons count', () => {
  assert.deepEqual(codes(checkMarkup('<span data-tm-icon="mail"></span><button data-tm-icon="plus">New</button>')), []);
  const [d] = checkMarkup('<span data-tm-icon="maill"></span>');
  assert.equal(d.code, 'TM105');
  assert.match(d.message, /Did you mean "mail"\?/);
  assert.deepEqual(codes(checkMarkup('<span data-tm-icon="rocket"></span>', 'a', { icons: new Set(['rocket']) })), []);
});

test('icon-only buttons need a label, icon + text buttons do not', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon="plus"></button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon="plus" aria-label="New contact"></button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon="plus">New contact</button>')), []);
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon><svg></svg></button>')), ['TM103']);
});

test('fields need a label (warning)', () => {
  assert.deepEqual(codes(checkMarkup('<input type="search" placeholder="Search">')), ['TM106']);
  assert.deepEqual(codes(checkMarkup('<label>Name <input></label><label for="e">Email</label><input id="e">')), []);
  assert.deepEqual(codes(checkMarkup('<select aria-label="Type"></select><input data-sn-attr="{\'aria-label\': m.x()}"><input type="hidden">')), []);
});

test('layout attributes need data-tm-layout', () => {
  assert.deepEqual(codes(checkMarkup('<div data-tm-gap="sm" data-tm-justify="end"></div>')), ['TM107']);
  assert.deepEqual(codes(checkMarkup('<div data-tm-layout="row" data-tm-gap="sm"></div><dl data-tm-pairs></dl>')), []);
  // a button is a flex row already: data-tm-justify and data-tm-align work on it without data-tm-layout
  assert.deepEqual(codes(checkMarkup('<button data-tm-justify="start" data-tm-align="start">From</button><a role="button" data-tm-justify="end">x</a>')), []);
  assert.deepEqual(codes(checkMarkup('<span data-tm-justify="start">x</span>')), ['TM107']);
});

test('data-tm-* is temper\'s namespace: an unknown name in it is an error, with a suggestion', () => {
  const [d] = checkMarkup('<button data-tm-varient="ghost">x</button>');
  assert.equal(d.code, 'TM104');
  assert.equal(d.severity, 'error');
  assert.match(d.message, /Did you mean data-tm-variant\?/);
  assert.deepEqual(codes(checkMarkup('<div data-tm-sparkle></div>')), ['TM104']);
  assert.deepEqual(codes(checkMarkup(`<p data-sn-attr="{ 'data-tm-sparkle': x }">a</p>`)), ['TM104']);
});

test('other data-* names are the app\'s: never reported, however close to a temper name', () => {
  assert.deepEqual(checkMarkup('<div data-varient="x" data-glow="1" data-shortcut="c" data-tm-src="a.html:1"></div>'), []);
});

test('temper\'s names without the prefix are an error that --fix rewrites, and their values are still checked', () => {
  const r = checkMarkup('<button data-variant="ghost" data-tone="danger">x</button><div data-layout="nope"></div>', 'a.html');
  assert.deepEqual(codes(r), ['TM104', 'TM104', 'TM104', 'TM101']);
  assert.match(r[0].message, /data-variant is data-tm-variant now/);
  const { text } = applyFixes('<button data-variant="ghost" data-tone="danger">x</button>', checkMarkup('<button data-variant="ghost" data-tone="danger">x</button>'));
  assert.equal(text, '<button data-tm-variant="ghost" data-tm-tone="danger">x</button>');
});

test('dynamic values and sinter attributes are skipped', () => {
  assert.deepEqual(checkMarkup('<button data-tm-variant={v} data-tm-tone="{tone}" data-sn-attr="{x: 1}">x</button>'), []);
});

test('positions are reported', () => {
  const [d] = checkMarkup('<p>ok</p>\n  <button data-tm-tone="red">x</button>', 'a.html');
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
  const r = checkMarkup(`<span data-tm-tone={failed ? 'danger' : 'sucess'}>x</span>`, 'A.svelte');
  assert.deepEqual(codes(r), ['TM101']);
  assert.match(r[0].message, /data-tm-tone="sucess" is not valid \(a value of this expression\)\. Did you mean "success"\?/);
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone={failed ? 'danger' : null}>x</span><span data-tm-tone={tone}>x</span>`, 'A.svelte')), []);
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone="{failed ? 'danger' : 'nope'}">x</span>`, 'A.svelte')), ['TM101']);
});

test('false renders the attribute in Svelte, JSX, Vue and Astro, but not in sinter', () => {
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone={failed && 'danger'}>x</span>`, 'A.svelte')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone={failed && 'danger'}>x</span>`, 'A.tsx')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span :data-tm-tone="failed && 'danger'">x</span>`, 'A.vue')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone={failed && 'danger'}>x</span>`, 'a.astro')), ['TM111']);
  assert.deepEqual(codes(checkMarkup(`<span data-sn-attr="{'data-tm-tone': failed && 'danger'}">x</span>`, 'a.html')), []);
  // a bare boolean on a boolean attribute is the common case of this bug
  const [w] = checkMarkup(`<nav data-tm-rail data-tm-collapsed={collapsed}></nav>`, 'A.svelte');
  assert.equal(w.severity, 'warning');
  assert.match(w.message, /collapsed \|\| null/);
  assert.deepEqual(codes(checkMarkup(`<nav data-tm-rail data-tm-collapsed={collapsed || null}></nav>`, 'A.svelte')), []);
});

test('Vue bindings and sinter data-sn-attr values are checked', () => {
  assert.deepEqual(codes(checkMarkup(`<b :data-tm-variant="x ? 'ghost' : 'danger'">x</b>`, 'A.vue')), ['TM101', 'TM108']);
  const src = `<span data-tm-badge data-sn-attr="{'data-tm-tone': bad ? 'danger' : 'oops', title: t}">x</span>`;
  const [d] = checkMarkup(src, 'a.html');
  assert.equal(d.code, 'TM101');
  assert.equal(d.col, src.indexOf('bad ?') + 1); // at the entry's value, not the attribute
});

test('nested braces in attributes do not hide the tag', () => {
  assert.deepEqual(codes(checkMarkup(`<button onclick={() => { open = true }} data-tm-variant="danger">x</button>`, 'A.svelte')), ['TM101']);
});

// ───── context ─────

test('attributes on elements they do not work on', () => {
  assert.deepEqual(codes(checkMarkup('<div data-tm-pairs></div>')), ['TM108']);
  const [d] = checkMarkup('<a href="/x" data-tm-variant="outline">x</a>');
  assert.match(d.message, /Add role="button"/);
  assert.deepEqual(codes(checkMarkup('<a href="/x" data-tm-variant="item">x</a><a href="/x" role="button" data-tm-variant="ghost">x</a>')), []);
  assert.deepEqual(codes(checkMarkup('<Button data-tm-variant="ghost">x</Button>', 'A.svelte')), []); // components pass props on
});

test('attributes that need another one on the same element', () => {
  assert.deepEqual(codes(checkMarkup('<div data-tm-layout="stack" data-tm-cols="3"></div>')), ['TM107']);
  assert.deepEqual(codes(checkMarkup('<div data-tm-layout="grid" data-tm-cols="3"></div><nav data-tm-rail data-tm-collapsed></nav>')), []);
});

test('parents and ancestors', () => {
  const [d] = checkMarkup('<body><div><nav data-tm-rail></nav></div></body>');
  assert.equal(d.code, 'TM109');
  assert.match(d.message, /direct child of \[data-tm-shell\]; here its parent is <div>/);
  assert.deepEqual(codes(checkMarkup('<body data-tm-shell><template data-sn-if="x"><nav data-tm-rail></nav></template><main></main></body>')), []);
  assert.deepEqual(codes(checkMarkup('<body><a data-tm-stretch href="/">x</a></body>')), ['TM109']);
  assert.deepEqual(codes(checkMarkup('<a data-tm-stretch href="/">x</a>', 'Card.svelte')), []); // a component: the article may be outside
  assert.deepEqual(codes(checkMarkup('<Card><a data-tm-stretch href="/">x</a></Card>', 'A.svelte')), []);
  // grow/self: warnings, and only when the parent is plain (no class or style of its own)
  const [w] = checkMarkup('<div><input data-tm-grow aria-label="q"></div>');
  assert.equal(w.severity, 'warning');
  assert.deepEqual(codes(checkMarkup('<div class="bar"><input data-tm-grow aria-label="q"></div><header><span data-tm-grow></span></header>')), []);
});

test('modules the project does not import', () => {
  const r = checkMarkup('<nav data-tm-rail></nav><div data-tm-menu></div><div data-tm-menu></div>', 'a.html', { modules: new Set(['core']) });
  assert.deepEqual(codes(r), ['TM110', 'TM110']);
  assert.match(r[0].message, /data-tm-rail needs app\.css, .*import '@tiaforge-ui\/temper\/app\.css'/);
  assert.deepEqual(codes(checkMarkup('<nav data-tm-rail></nav>', 'a.html', { modules: null })), []);
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

test('an empty data-tm-tooltip needs an aria-label to show', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tm-tooltip>Save</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-tm-tooltip aria-label="Save" data-tm-icon="check"></button><span data-tm-tooltip="Synced" tabindex="0">x</span>')), []);
});

test('data-tm-layout on table parts and data-tm-num off cells', () => {
  assert.deepEqual(codes(checkMarkup('<table><tr><th>h</th><td data-tm-layout="row">x</td></tr></table>')), ['TM108']);
  assert.deepEqual(codes(checkMarkup('<span data-tm-num>3</span>')), ['TM108']);
  assert.deepEqual(codes(checkMarkup('<table><tr><th>h</th><td data-tm-num><div data-tm-layout="row">3</div></td></tr></table>')), []);
});

// ───── fixes and deprecations ─────

const applyFixesTo = (src, diags) => applyFixes(src, diags).text;
const fixed = (src, file = 'a.html', ctx) => applyFixesTo(src, checkMarkup(src, file, ctx));

test('--fix: wrong axis, typos, boolean values, primary', () => {
  assert.equal(fixed('<button data-tm-variant="danger">x</button>'), '<button data-tm-tone="danger">x</button>');
  assert.equal(fixed('<div data-tm-layout="stak"></div>'), '<div data-tm-layout="stack"></div>');
  assert.equal(fixed('<span data-tm-badge="true">3</span>'), '<span data-tm-badge>3</span>');
  assert.equal(fixed('<button data-tm-variant="primary" type="submit">x</button>'), '<button type="submit">x</button>');
  assert.equal(fixed('<button data-tm-varient="ghost">x</button>'), '<button data-tm-variant="ghost">x</button>');
  assert.equal(fixed('<span data-tm-icon="maill"></span>'), '<span data-tm-icon="mail"></span>');
  // two fixes in one tag, both applied
  assert.equal(fixed('<button data-tm-variant="danger" data-tm-size="smm">x</button>'), '<button data-tm-tone="danger" data-tm-size="sm">x</button>');
});

test('--fix leaves ambiguous and conflicting cases alone', () => {
  // data-tm-tone is already set: moving danger there would lose a value
  const src = '<button data-tm-variant="danger" data-tm-tone="accent">x</button>';
  assert.equal(fixed(src), src);
  // computed values are reported, not rewritten
  const svelte = `<span data-tm-tone={x ? 'danger' : 'sucess'}>x</span>`;
  assert.equal(fixed(svelte, 'A.svelte'), svelte);
  // equally close candidates: no guess ("ss" is one edit from both sm and xs)
  assert.equal(checkMarkup('<div data-tm-layout="row" data-tm-gap="ss"></div>')[0].fix, undefined);
});

test('--fix for tokens', () => {
  const css = '.x { color: var(--tm-text-mute); }';
  assert.equal(applyFixesTo(css, checkStyles(css)), '.x { color: var(--tm-text-muted); }');
});

test('deprecated names warn (TM112), keep working and get rewritten', () => {
  const vocab = structuredClone(JSON.parse(readFileSync(new URL('../vocab.json', import.meta.url), 'utf8')));
  vocab.deprecated = { attributes: { 'data-kind': 'data-tm-variant' }, values: { 'data-tm-variant': { subtle: 'ghost' } }, tokens: { '--tm-muted': '--tm-text-muted' } };
  const r = checkMarkup('<button data-tm-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab });
  assert.deepEqual(codes(r), ['TM112', 'TM112']);
  assert.equal(r[0].severity, 'warning');
  assert.equal(fixed('<button data-tm-variant="subtle">x</button><button data-kind="outline">y</button>', 'a.html', { vocab }),
    '<button data-tm-variant="ghost">x</button><button data-tm-variant="outline">y</button>');
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
  writeFileSync(dir + '/a.html', '<button data-tm-variant="danger">x</button>\n<div data-tm-gap="ss"></div>\n');
  const before = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', dir], { encoding: 'utf8' });
  assert.match(before.stdout, /1 fixable with --fix/);
  const run = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', '--fix', dir], { encoding: 'utf8' });
  assert.match(run.stdout, /Fixed 1 problem\(s\) in 1 file\(s\)/);
  assert.match(run.stdout, /data-tm-gap="ss" is not valid/);
  assert.equal(read(dir + '/a.html', 'utf8'), '<button data-tm-tone="danger">x</button>\n<div data-tm-gap="ss"></div>\n');
});

test('the CLI: --help and --version exit 0, unknown options and commands exit 2 with a suggestion', async () => {
  const { spawnSync } = await import('node:child_process');
  const cli = (...args) => spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  for (const args of [['--help'], ['-h'], ['check', '--help'], []]) {
    const r = cli(...args);
    assert.equal(r.status, 0, args.join(' '));
    assert.match(r.stdout, /^Usage: temper check \[options\] \[paths\.\.\.\]/);
  }
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const flag of ['--version', '-v']) assert.equal(cli(flag).stdout.trim(), version);
  const fixx = cli('check', '--fixx', 'kitchen-sink');
  assert.equal(fixx.status, 2);
  assert.match(fixx.stderr, /unknown option --fixx\. Did you mean --fix\?/);
  const format = cli('check', 'kitchen-sink', '--format', 'json');
  assert.equal(format.status, 2);
  assert.match(format.stderr, /unknown option --format\./);
  assert.doesNotMatch(format.stderr, /json does not exist/);
  assert.match(cli('chek').stderr, /unknown command chek\. Did you mean check\?/);
  assert.equal(cli('chek').status, 2);
  assert.equal(cli('check', '--icons').status, 2);
  assert.equal(cli('check', '--fix=yes').status, 2);
  assert.equal(cli('check', 'nope-not-here').status, 2);
  // every existing option still works, and -- ends the options
  assert.equal(cli('check', '--warnings-as-errors', '--lucide', '--icons', 'kitchen-sink', '--', 'kitchen-sink').status, 0);
});

test('the CLI with --lucide says where data-tm-icon names cannot be seen, without failing', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = writeTemp('a.svelte', '<span data-tm-icon={item.icon}></span>\n<span data-tm-icon={on ? "sunrise" : "moon-star"}></span>\n');
  const run = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', '--lucide', dir], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /a\.svelte:1:\d+ {2}item\.icon/);
  assert.match(run.stdout, /icons\.include/);
  const without = spawnSync(process.execPath, [new URL('../bin/temper.js', import.meta.url).pathname, 'check', dir], { encoding: 'utf8' });
  assert.doesNotMatch(without.stdout, /item\.icon/); // the prebuilt icons.css has every default icon: nothing to say
});

// ───── app CSS against the library's rules (warnings) ─────

test('app CSS: !important, fixed colors, margins, scale values, restyled variants', () => {
  const css = `.card { color: #666 !important; margin-top: 1rem; padding: 16px 0.75rem; gap: 0.5rem; }
.ok { color: var(--tm-text-muted); background: color-mix(in oklab, var(--tm-accent) 10%, white); margin-inline: auto; margin: 0; padding: 0.75rem; }
:root { --brand: #e8590c; $x: red; }
button[data-tm-variant="ghost"] { background: var(--tm-fill); padding: 0; }
[data-tm-theme="dark"] .logo { filter: invert(1); }
.list [data-tm-tone] { --tm-tone: var(--tm-info); }`;
  const r = checkStyles(css, 'a.css');
  assert.deepEqual(codes(r), ['TM204', 'TM205', 'TM206', 'TM207', 'TM207', 'TM208']);
  assert.match(r[1].message, /var\(--tm-text\) or var\(--tm-text-muted\)/);
  assert.equal(applyFixesTo(css, r).split('\n')[0], '.card { color: #666 !important; margin-top: 1rem; padding: var(--tm-space-md) 0.75rem; gap: var(--tm-space-sm); }');
});

test('inline styles: margins and paddings point to data-tm-gap and data-tm-pad; tokens are fine', () => {
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
  // "sm" is a value of data-tm-size, data-tm-gap and data-tm-pad: name them, apply nothing
  const [d] = checkMarkup('<button data-tm-variant="sm">x</button>');
  assert.equal(d.code, 'TM101');
  assert.match(d.message, /"sm" is a value of data-tm-size="sm", data-tm-gap="sm" or data-tm-pad="sm"/);
  assert.equal(d.fix, undefined);
  assert.equal(checkMarkup('<button data-tm-size="center">x</button>')[0].fix, undefined);
  // one other axis: the value moves there
  assert.equal(fixed('<button data-tm-variant="danger">x</button>'), '<button data-tm-tone="danger">x</button>');
});

test('an icon or close button with only whitespace or a comment inside has no visible text', () => {
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon="x">\n</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button commandfor="d" command="close">\n  <!-- icon -->\n</button>')), ['TM103']);
  assert.deepEqual(codes(checkMarkup('<button data-tm-icon="x">\n  New\n</button>')), []);
});

test('tokens in style attributes are checked in plain HTML files too', () => {
  const r = check([writeTemp('a.html', '<div style="color: var(--tm-txt)"></div>\n')]);
  assert.deepEqual(codes(r), ['TM201']);
  assert.match(r[0].message, /Did you mean --tm-text\?/);
});

// ───────────── structure and accessibility rules (TM113–TM123), fixes ─────────────

const doc = body => `<html><body>${body}</body></html>`;

test('--fix stubs a missing label, and the stub stays an error until it is replaced', () => {
  const src = '<button data-tm-icon="x"></button>';
  const before = checkMarkup(src);
  assert.deepEqual(codes(before), ['TM103']);
  const { text } = applyFixes(src, before);
  assert.equal(text, '<button aria-label="TODO" data-tm-icon="x"></button>');
  const after = checkMarkup(text);
  assert.deepEqual(codes(after), ['TM113']);
  assert.equal(after[0].severity, 'error');
  assert.deepEqual(checkMarkup(text.replace('TODO', 'Close')), []);
});

test('the label stub also covers close buttons, empty tooltips and requires', () => {
  assert.equal(applyFixes('<button data-tm-tooltip>x</button>', checkMarkup('<button data-tm-tooltip>x</button>')).text, '<button aria-label="TODO" data-tm-tooltip>x</button>');
  const close = '<button command="close" commandfor="d"></button>';
  assert.deepEqual(codes(checkMarkup(applyFixes(close, checkMarkup(close)).text)), ['TM113']);
});

test('TM111: a bare boolean gets || null', () => {
  const src = '<script>let on;</script><div data-tm-menu={on}></div>';
  const d = checkMarkup(src, 'a.svelte');
  const { text } = applyFixes(src, d);
  assert.match(text, /data-tm-menu=\{on \|\| null\}/);
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
  assert.deepEqual(codes(checkMarkup('<span data-tm-tooltip="Synced">x</span>')), ['TM116']);
  assert.deepEqual(codes(checkMarkup('<span data-tm-tooltip="Synced" tabindex="0">x</span><a href="/" data-tm-tooltip="x">y</a><button data-tm-tooltip="z">z</button>')), []);
  // a link whose href is bound: sinter data-sn-href, data-sn-attr, Vue :href
  assert.deepEqual(codes(checkMarkup('<a download role="button" data-tm-variant="ghost" data-tm-icon="download" aria-label="Export" data-tm-tooltip data-sn-href="/api/export?id={a.id}"></a>')), []);
  assert.deepEqual(codes(checkMarkup(`<a data-tm-tooltip="x" data-sn-attr="{href: a.url}">y</a><a data-tm-tooltip="x" :href="a.url">y</a>`)), []);
  assert.deepEqual(codes(checkMarkup('<a data-tm-tooltip="x">y</a>')), ['TM116']);
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
  assert.deepEqual(codes(checkMarkup('<div><button>Save</button><button data-tm-variant="ghost">Cancel</button></div>')), []);
  assert.deepEqual(codes(checkMarkup('<div><button role="tab">A</button><button role="tab">B</button></div>')), []);
});

test('two solid buttons: alternatives are not side by side (Svelte blocks)', () => {
  const tm = (src, file = 'A.svelte') => codes(checkMarkup(src, file)).filter(c => c === 'TM121');
  assert.deepEqual(tm('<div>{#if a}<button>Save</button>{:else}<button>Create</button>{/if}</div>'), []);
  assert.deepEqual(tm('<div>{#if a}<button>A</button>{:else if b}<button>B</button>{:else}<button>C</button>{/if}</div>'), []);
  assert.deepEqual(tm('<div>{#await p}<button>A</button>{:then v}<button>B</button>{:catch e}<button>C</button>{/await}</div>'), []);
  assert.deepEqual(tm('<div>{#snippet s()}<button>A</button>{/snippet}<button>B</button></div>'), []);
  assert.deepEqual(tm('<div>{#each xs as x}<button>{x}</button>{/each}</div>'), []); // repeated: maybe once
  assert.deepEqual(tm('<div><button>A</button>{#if a}<button>B</button>{/if}</div>'), []); // together only sometimes
  // in the same branch they do render together
  assert.deepEqual(tm('<div>{#if a}<button>Save</button><button>Create</button>{/if}</div>'), ['TM121']);
  assert.deepEqual(tm('<div>{#if a}<p>x</p>{/if}<button>Save</button><button>Create</button></div>'), ['TM121']);
  assert.deepEqual(tm('{#if a}<div><button>Save</button><button>Create</button></div>{:else}<button>X</button>{/if}'), ['TM121']);
});

test('two solid buttons: alternatives in JSX, Astro, Vue and sinter', () => {
  const tm = (src, file) => codes(checkMarkup(src, file)).filter(c => c === 'TM121');
  assert.deepEqual(tm('<div>{open ? <button>Close</button> : <button>Open</button>}</div>', 'A.tsx'), []);
  assert.deepEqual(tm('<div>{open && <button>Close</button>}<button>Open</button></div>', 'A.jsx'), []);
  assert.deepEqual(tm('<div>{items.map(i => <button>{i}</button>)}</div>', 'A.jsx'), []);
  assert.deepEqual(tm('<div>{a ? <button>A</button> : <button>B</button>}</div>', 'a.astro'), []);
  assert.deepEqual(tm('<div><button v-if="a">A</button><button v-else-if="b">B</button><button v-else>C</button></div>', 'A.vue'), []);
  assert.deepEqual(tm('<div><template v-if="a"><button>A</button></template><template v-else><button>B</button></template></div>', 'A.vue'), []);
  assert.deepEqual(tm('<div><button v-show="a">A</button><button>B</button></div>', 'A.vue'), []);
  assert.deepEqual(tm('<div><template data-sn-if="a"><button>A</button></template><button>B</button></div>', 'a.html'), []);
  assert.deepEqual(tm('<div><button x-show="a">A</button><button>B</button><button hidden>C</button></div>', 'a.html'), []);
  // certainly together: one branch of an expression, a fragment, a template's content, plain markup
  assert.deepEqual(tm('<div>{open && <><button>Close</button><button>Open</button></>}</div>', 'A.tsx'), ['TM121']);
  assert.deepEqual(tm('const x = <div><button>Close</button><button>Open</button></div>;', 'A.tsx'), ['TM121']);
  assert.deepEqual(tm('<div>{a && <p><button>A</button><button>B</button></p>}</div>', 'a.astro'), ['TM121']);
  assert.deepEqual(tm('<div><template v-if="a"><button>A</button><button>B</button></template></div>', 'A.vue'), ['TM121']);
});

test('TM122: a button in a data-tm-field inside a wrapping label', () => {
  const tm = (src, file = 'a.html') => codes(checkMarkup(src, file)).filter(c => c === 'TM122');
  const copy = '<button type="button" data-tm-variant="ghost" data-tm-icon="copy" aria-label="Copy"></button>';
  const [d] = checkMarkup(`<label>API key <span data-tm-field><input name="key">${copy}</span></label>`);
  assert.equal(d.code, 'TM122');
  assert.equal(d.severity, 'warning');
  assert.match(d.message, /label for=/);
  assert.deepEqual(tm(`<label>API key <span><span data-tm-field><input>${copy}</span></span></label>`), ['TM122']);
  assert.deepEqual(tm(`<label>API key <span data-tm-field><input>${copy}</span></label>`, 'A.svelte'), ['TM122']);
  // silent: label for with the field outside it, no button, an icon span, the button outside the field
  assert.deepEqual(tm(`<label for="k">API key</label><div data-tm-field><input id="k">${copy}</div>`), []);
  assert.deepEqual(tm('<label>Amount <span data-tm-field><span>€</span><input><span>EUR</span></span></label>'), []);
  assert.deepEqual(tm('<label>Search <span data-tm-field><span data-tm-icon="search"></span><input></span></label>'), []);
  assert.deepEqual(tm(`<label>API key <span data-tm-field><input></span></label>${copy}`), []);
  assert.deepEqual(tm(`<div data-tm-field><input aria-label="API key">${copy}</div>`), []);
  // not judged: a component or custom element between them, or a component instead of a button
  assert.deepEqual(tm(`<label>API key <Field><span data-tm-field><input>${copy}</span></Field></label>`, 'A.svelte'), []);
  assert.deepEqual(tm(`<label>API key <span data-tm-field><my-copy>${copy}</my-copy><input></span></label>`), []);
  assert.deepEqual(tm('<label>API key <span data-tm-field><input><CopyButton /></span></label>', 'A.svelte'), []);
  // temper-ignore
  const r = check([writeTemp('a.html', `<label>API key <span data-tm-field><input>\n<!-- temper-ignore -->\n${copy}</span></label>\n`)]);
  assert.deepEqual(codes(r).filter(c => c === 'TM122'), []);
});

// feedback.css: the tooltip is the ::after and gives way where that is taken. Each case here was checked against the
// computed ::after content in Chrome (all.css): the warned ones never show the tooltip, the silent ones do.
test('TM123: data-tm-tooltip where it never shows (dropdown caret, data-tm-stretch overlay, sort arrow)', () => {
  const tm = (src, file = 'a.html') => codes(checkMarkup(src, file)).filter(c => c === 'TM123');
  const [d] = checkMarkup('<button popovertarget="m" data-tm-tooltip="More actions">Options</button>').filter(d => d.code === 'TM123');
  assert.equal(d.severity, 'warning');
  assert.match(d.message, /never shows: it opens a popover, so its ::after is the dropdown caret/);
  assert.match(d.message, /hint in the button's label, or make it an icon button/);
  // a text button that opens a popover: popovertarget (without action="hide"), command toggle- or show-popover; a
  // data-tm-icon button with text is a text button too
  for (const b of ['popovertarget="m"', 'popovertarget="m" popovertargetaction="toggle"', 'popovertarget="m" popovertargetaction="show"',
    'commandfor="m" command="toggle-popover"', 'commandfor="m" command="show-popover"', 'popovertarget="m" data-tm-icon="filter"'])
    assert.deepEqual(tm(`<button ${b} data-tm-tooltip="x">Filter</button>`), ['TM123'], b);
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon="x" data-tm-tooltip="x"><span>Menu</span></button>'), ['TM123']);
  assert.deepEqual(tm('<button popovertarget="m" aria-label="Menu" data-tm-tooltip></button>'), ['TM123']); // no data-tm-icon: the caret
  assert.deepEqual(tm('<button popovertarget="menu-{id}" data-tm-tooltip="x"><Icon /> Menu</button>', 'A.svelte'), ['TM123']);
  // the data-tm-stretch overlay, the sort arrow of an aria-sort header
  assert.deepEqual(tm('<article><a href="#" data-tm-stretch data-tm-tooltip="x">Open</a></article>'), ['TM123']);
  assert.deepEqual(tm('<table><tr><th aria-sort="none"><button data-tm-tooltip="Sort">Name</button></th></tr></table>'), ['TM123']);
  // silent: an icon button (data-tm-icon="" or no content), a close button, another command, no popover, the tooltip not
  // directly in the aria-sort header
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon="ellipsis" aria-label="More" data-tm-tooltip></button>'), []);
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon aria-label="More" data-tm-tooltip>⋯</button>'), []);
  assert.deepEqual(tm('<button popovertarget="m" popovertargetaction="hide" data-tm-tooltip="x">Close</button>'), []);
  assert.deepEqual(tm('<button commandfor="d" command="show-modal" data-tm-tooltip="x">Open</button>'), []);
  assert.deepEqual(tm('<button data-tm-tooltip="x">Save</button><a href="#" popovertarget="m" data-tm-tooltip="x">Link</a>'), []);
  assert.deepEqual(tm('<table><tr><th aria-sort="none"><button>Name <span data-tm-tooltip="x" tabindex="0">?</span></button></th></tr></table>'), []);
  // not judged: what decides it is an expression (the attribute may not render), or the content may be empty
  assert.deepEqual(tm('<button popovertarget={id} data-tm-tooltip="x">Menu</button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button popovertarget="m" popovertargetaction={a} data-tm-tooltip="x">Menu</button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button commandfor="m" command={c} data-tm-tooltip="x">Menu</button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon={i} data-tm-tooltip="x">Menu</button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon="x" aria-label="o" data-tm-tooltip>{label}</button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button popovertarget="m" data-tm-icon="x" aria-label="o" data-tm-tooltip><Label /></button>', 'A.svelte'), []);
  assert.deepEqual(tm('<button :popovertarget="id" data-tm-tooltip="x">Menu</button>', 'A.vue'), []);
  assert.deepEqual(tm('<table><tr><th aria-sort={s}><button data-tm-tooltip="Sort">Name</button></th></tr></table>', 'A.svelte'), []);
});

test('fixed colors: light-dark() handles both schemes', () => {
  assert.deepEqual(codes(checkStyles('.x { color: light-dark(#333, #eee); background: light-dark(white, black); border: 1px solid light-dark(rgb(0 0 0 / 10%), #fff3); }', 'a.css')), []);
  assert.deepEqual(codes(checkStyles('.x { background: light-dark(white, black), #333; }', 'a.css')), ['TM205']);
  assert.deepEqual(codes(checkMarkup('<p style="color: light-dark(#333, #eee)">x</p>')), []);
});

test('a number outside a numeric range names the range instead of guessing', () => {
  const [d] = checkMarkup('<div data-tm-layout="grid" data-tm-cols="8"></div>');
  assert.match(d.message, /data-tm-cols="8" is not valid\. It takes a whole number from 2 to 7\./);
  assert.doesNotMatch(d.message, /Did you mean/);
  assert.equal(d.fix, undefined);
  assert.match(checkMarkup('<div data-tm-layout="grid" data-tm-cols={9}></div>', 'A.tsx')[0].message, /from 2 to 7/);
});

// ───── what is markup in JSX, Svelte and Astro files ─────

test('JSX: markup in comments, strings, template literals and regular expressions is not checked', () => {
  const src = [
    `import { useState } from 'react';`,
    `// a comment with <button data-tm-variant="danger">x</button>`,
    `const help = '<button data-tm-variant="primary">';`,
    `const twice = "<span data-tm-tone='nope'>";`,
    'const tpl = `<b data-tm-tone="x">${user ? `<i data-tm-tone="${\'y\'}">` : \'\'}</b>`;',
    `const re = /<b data-tm-tone="y">/g, half = total / 2 / count;`,
    `/* <div data-tm-layout="stak"></div> */`,
    `export function List<T extends object>({ items }: { items: Array<T> }) {`,
    `  const [open, setOpen] = useState<boolean>(false);`,
    `  const id = <T,>(x: T) => x;`,
    `  if (a < b && c > d) return null;`,
    `  return <div data-tm-layout="row">{/* <b data-tm-tone="q"> */}{"<i data-tm-tone='z'>"}don't // not a comment</div>;`,
    `}`,
  ].join('\n');
  assert.deepEqual(checkMarkup(src, 'A.tsx'), []);
});

test('JSX: attribute values, text and nested elements are still checked', () => {
  const count = (src, file = 'A.tsx') => codes(checkMarkup(src, file)).filter(c => c === 'TM101').length;
  const src1 = 'const f = <T,>(x: T) => <b data-tm-tone="nope">{x}</b>;';
  assert.equal(checkMarkup(src1, 'A.tsx')[0].col, src1.indexOf('data-tm-tone') + 1);
  assert.equal(count('const [o] = useState<boolean>(false); const e = <b data-tm-tone={o ? "danger" : "nope"}>x</b>;'), 1);
  assert.equal(count('const s = a ? <b data-tm-tone="nope" /> : null; const q = x / 2;', 'a.jsx'), 1);
  assert.equal(count('x = a.filter(i => i < 3).map(i => <li data-tm-tone="nope">{i}</li>)', 'a.jsx'), 1);
  assert.deepEqual(codes(checkMarkup('const el = <Select<string> data-tm-tone="nope" />;', 'A.tsx')), ['TM101']); // a component, not a <select> field
  assert.equal(count('<div onClick={() => /\'/.test(s)} data-tm-tone="nope">x</div>', 'a.jsx'), 1);
  assert.equal(count('const s = `a ${`b ${"c"}`} d`; const e = <b data-tm-tone="nope" />;', 'a.jsx'), 1);
  assert.equal(count('return <ul>{items.map(i => <li key={i}><span data-tm-tone="nope">{i}</span></li>)}</ul>'), 1);
});

test('Svelte and Astro: strings and comments in expressions are not markup; script and frontmatter are not either', () => {
  assert.deepEqual(checkMarkup(`<script lang="ts">const a = '<b data-tm-tone="x">'; let b: Array<string> = [];</script>
<p>{"<b data-tm-tone='x'>"}{/* <i data-tm-tone="q"> */}</p>{#if a < b}<span data-tm-tone="danger">x</span>{/if}`, 'A.svelte'), []);
  const astro = `---\nconst a = "<b data-tm-tone='x'>";\nconst b = 1 < 2;\n---\n<p>{"<i data-tm-tone='z'>"}{/* <b data-tm-tone="w"> */}</p>\n<span data-tm-tone="bad">x</span>`;
  assert.deepEqual(checkMarkup(astro, 'a.astro').map(d => `${d.code}:${d.line}`), ['TM101:6']);
  // attribute expressions keep their strings: their values are checked
  assert.deepEqual(codes(checkMarkup(`<span data-tm-tone={a ? 'danger' : 'nope'}>{'x'}</span>`, 'a.astro')), ['TM101']);
});

test('a <script> whose attributes contain > (Svelte generics) is still blanked, and the markup after it checked', () => {
  const src = `<script lang="ts" generics="T extends Record<string, unknown>">\n  const t = '<b data-tm-tone="x">';\n</script>\n<p>"quoted"</p>\n{@html '<i data-tm-tone="y">'}\n<span data-tm-tone="nope">x</span>`;
  assert.deepEqual(checkMarkup(src, 'A.svelte').map(d => `${d.code}:${d.line}`), ['TM101:6']);
});

test('Vue: strings in {{ }} are not markup, a single { in text is text, bindings are still checked', () => {
  const src = `<script setup lang="ts">const html = '<b data-tm-tone="x">';</script>
<template>
  <p>{{ "<b data-tm-tone='x'>" }} { it's text } <span data-tm-tone="nope">x</span></p>
  <span :data-tm-tone="bad ? 'danger' : 'oops'">y</span>
</template>`;
  assert.deepEqual(checkMarkup(src, 'A.vue').map(d => `${d.code}:${d.line}`), ['TM101:3', 'TM101:4']);
});

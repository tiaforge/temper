import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMarkup, checkStyles, check } from '../lib/check.js';

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

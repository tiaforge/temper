import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { required, pruneCss, projectUsage } from '../lib/prune.js';

const usage = obj => new Map(Object.entries(obj).map(([k, v]) => [k, v === 'any' ? 'any' : new Set(v)]));

test('required attributes: :not() and alternatives never count', () => {
  assert.deepEqual(required(':where(:is(button, a)[data-variant=item]) > :where([data-cols="2"])'),
    [{ name: 'data-variant', value: 'item' }, { name: 'data-cols', value: '2' }]);
  assert.deepEqual(required(':where([data-tone=neutral], [data-variant=secondary]):not([data-tone])'), []);
  assert.deepEqual(required('[data-rail]:has([data-rail-collapse]:checked) a'), [{ name: 'data-rail', value: undefined }, { name: 'data-rail-collapse', value: undefined }]);
});

test('pruneCss drops selectors, then empty rules and groups; keeps the rest as is', () => {
  const css = '@layer a,b;@layer a{:where([data-tone=danger]),:where([data-tone=info]){color:red}@media (width<4rem){[data-fab]{inset:0}}}@keyframes s{to{rotate:1turn}}button{color:blue}[data-example]{x:y}';
  assert.equal(pruneCss(css, usage({ 'data-tone': ['info'] })),
    '@layer a,b;@layer a{:where([data-tone=info]){color:red}}@keyframes s{to{rotate:1turn}}button{color:blue}[data-example]{x:y}');
  assert.equal(pruneCss(css, usage({ 'data-tone': 'any', 'data-fab': [''] })).length, css.length);
});

test('projectUsage: literals, computed values, sinter entries and scripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tm-prune-'));
  writeFileSync(join(dir, 'A.svelte'), `<span data-tone={x ? 'danger' : 'success'} data-size="sm" data-icon={icon}></span>`);
  writeFileSync(join(dir, 'b.html'), `<p data-sn-attr="{'data-variant': on ? 'ghost' : null}"></p><nav data-rail></nav>`);
  writeFileSync(join(dir, 'c.js'), `t.dataset.toast = ''; el.setAttribute('data-callout', '');`);
  const u = projectUsage([dir]);
  assert.deepEqual([...u.get('data-tone')].sort(), ['danger', 'success']);
  assert.deepEqual([...u.get('data-variant')], ['ghost']);
  assert.deepEqual([...u.get('data-rail')], ['']);
  assert.equal(u.get('data-icon'), 'any');
  assert.equal(u.get('data-toast'), 'any');
  assert.equal(u.get('data-callout'), 'any');
});

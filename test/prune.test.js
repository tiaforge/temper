import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { required, pruneCss, projectUsage } from '../lib/prune.js';

const usage = obj => new Map(Object.entries(obj).map(([k, v]) => [k, v === 'any' ? 'any' : new Set(v)]));

test('required attributes: :not() and alternatives never count', () => {
  assert.deepEqual(required(':where(:is(button, a)[data-tm-variant=item]) > :where([data-tm-cols="2"])'),
    [{ name: 'data-tm-variant', value: 'item' }, { name: 'data-tm-cols', value: '2' }]);
  assert.deepEqual(required(':where([data-tm-tone=neutral], [data-tm-variant=secondary]):not([data-tm-tone])'), []);
  assert.deepEqual(required('[data-tm-rail]:has([data-tm-rail-collapse]:checked) a'), [{ name: 'data-tm-rail', value: undefined }, { name: 'data-tm-rail-collapse', value: undefined }]);
});

test('pruneCss drops selectors, then empty rules and groups; keeps the rest as is', () => {
  const css = '@layer a,b;@layer a{:where([data-tm-tone=danger]),:where([data-tm-tone=info]){color:red}@media (width<4rem){[data-tm-fab]{inset:0}}}@keyframes s{to{rotate:1turn}}button{color:blue}[data-example]{x:y}';
  assert.equal(pruneCss(css, usage({ 'data-tm-tone': ['info'] })),
    '@layer a,b;@layer a{:where([data-tm-tone=info]){color:red}}@keyframes s{to{rotate:1turn}}button{color:blue}[data-example]{x:y}');
  assert.equal(pruneCss(css, usage({ 'data-tm-tone': 'any', 'data-tm-fab': [''] })).length, css.length);
});

test('projectUsage: literals, computed values, sinter entries and scripts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tm-prune-'));
  writeFileSync(join(dir, 'A.svelte'), `<span data-tm-tone={x ? 'danger' : 'success'} data-tm-size="sm" data-tm-icon={icon}></span>`);
  writeFileSync(join(dir, 'b.html'), `<p data-sn-attr="{'data-tm-variant': on ? 'ghost' : null}"></p><nav data-tm-rail></nav>`);
  writeFileSync(join(dir, 'c.js'), `t.dataset.tmToast = ''; el.setAttribute('data-tm-callout', '');`);
  const u = projectUsage([dir]);
  assert.deepEqual([...u.get('data-tm-tone')].sort(), ['danger', 'success']);
  assert.deepEqual([...u.get('data-tm-variant')], ['ghost']);
  assert.deepEqual([...u.get('data-tm-rail')], ['']);
  assert.equal(u.get('data-tm-icon'), 'any');
  assert.equal(u.get('data-tm-toast'), 'any');
  assert.equal(u.get('data-tm-callout'), 'any');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampSources } from '../lib/source.js';

test('plain HTML elements get their line; components, custom elements and svelte: tags do not', () => {
  const out = stampSources('<h1>a</h1>\n<Card />\n<my-el></my-el>\n<svelte:head></svelte:head>\n  <button\n  data-tone="x">b</button>', 'a.svelte', 'src/a.svelte');
  assert.equal(out, '<h1 data-tm-src="src/a.svelte:1">a</h1>\n<Card />\n<my-el></my-el>\n<svelte:head></svelte:head>\n  <button data-tm-src="src/a.svelte:5"\n  data-tone="x">b</button>');
});

test('script and style contents, comments and TypeScript generics are left alone', () => {
  const src = '<script>const a = "<div>"; let b: Array<string>;</script>\n<!-- <p>x</p> -->\n<style>a > b {}</style>\n<p>x</p>';
  assert.equal(stampSources(src, 'a.svelte', 'a.svelte'), src.replace('<p>x</p>\n<style', '<p>x</p>\n<style').replace(/<p>x<\/p>$/, '<p data-tm-src="a.svelte:4">x</p>'));
  const tsx = 'const a: Array<string> = [];\nconst b = <div><T /></div>;';
  assert.equal(stampSources(tsx, 'a.tsx', 'a.tsx'), 'const a: Array<string> = [];\nconst b = <div data-tm-src="a.tsx:2"><T /></div>;');
});

test('a Vue file is stamped in its template only', () => {
  const src = '<script setup>const html = "<div>";</script>\n<template>\n  <div><span /></div>\n</template>';
  assert.equal(stampSources(src, 'a.vue', 'a.vue'), src.replace('<div><span />', '<div data-tm-src="a.vue:3"><span data-tm-src="a.vue:3" />'));
});

test('an element that already has data-tm-src is left as it is', () => {
  const src = '<p data-tm-src="x:1">a</p>';
  assert.equal(stampSources(src, 'a.html', 'a.html'), src);
});

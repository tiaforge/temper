// The generated types (types/*.d.ts) catch bad computed values in each framework's own checker.
// Every fixture line marked "expect" must get an error, and no other line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = name => root + 'node_modules/.bin/' + name;
const fixtures = {
  svelte: [bin('svelte-check'), '--tsconfig', './tsconfig.json', '--output', 'machine'],
  react: [bin('tsc'), '-p', '.', '--pretty', 'false'],
  vue: [bin('vue-tsc'), '-p', '.', '--pretty', 'false'],
  astro: [bin('tsc'), '-p', '.', '--pretty', 'false'],
  sinter: [bin('tsc'), '-p', '.', '--pretty', 'false'],
};

for (const [name, [cmd, ...args]] of Object.entries(fixtures)) {
  test(`${name}: bad computed values are type errors`, () => {
    const dir = root + 'test/types/' + name;
    const run = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
    const out = run.stdout + run.stderr;
    // "App.tsx(6,6): error" (tsc, vue-tsc) or `ERROR "App.svelte" 8:8` (svelte-check)
    const errors = [...out.matchAll(/^([\w.-]+)\((\d+),\d+\): error|ERROR "([\w.-]+)" (\d+):/gm)].map(m => `${m[1] ?? m[3]}:${m[2] ?? m[4]}`);
    const expected = readdirSync(dir).filter(f => /\.(svelte|tsx|vue|ts)$/.test(f)).flatMap(f =>
      readFileSync(dir + '/' + f, 'utf8').split('\n').flatMap((l, i) => /expect/.test(l) && !/^\s*(\/\/|<!-- svelte-check)/.test(l) ? [`${f}:${i + 1}`] : []));
    assert.deepEqual([...new Set(errors)].sort(), expected.sort(), out);
  });
}

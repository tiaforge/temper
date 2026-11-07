// Bumps @tiaforge-ui/temper and @tiaforge-ui/temper-inspect to the same version (they release in lockstep,
// one vX.Y.Z tag for both). It only edits files; committing, tagging and publishing stay manual.
// Usage: node scripts/release.mjs <patch|minor|major|X.Y.Z>
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifests = ['package.json', 'packages/inspect/package.json'];
const lock = 'package-lock.json';

const fail = msg => { console.error(`release: ${msg}`); process.exit(1); };
const read = f => JSON.parse(readFileSync(root + f, 'utf8'));
const write = (f, json) => writeFileSync(root + f, JSON.stringify(json, null, 2) + '\n');

const arg = process.argv[2];
if (!arg) fail('usage: npm run release -- <patch|minor|major|X.Y.Z>');

if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
  fail('the working tree has uncommitted changes, commit or stash them first');

const current = manifests.map(f => read(f).version);
if (new Set(current).size !== 1)
  fail(`versions are out of sync (${manifests.map((f, i) => `${f}: ${current[i]}`).join(', ')}), fix them by hand first`);
const from = current[0];

const semver = /^(\d+)\.(\d+)\.(\d+)$/;
const [, maj, min, pat] = (from.match(semver) ?? fail(`can't parse current version ${from}`)).map(Number);
const to = { major: `${maj + 1}.0.0`, minor: `${maj}.${min + 1}.0`, patch: `${maj}.${min}.${pat + 1}` }[arg] ?? arg;
if (!semver.test(to)) fail(`${to} is not patch, minor, major or an X.Y.Z version`);
const cmp = to.split('.').map(Number).map((n, i) => n - [maj, min, pat][i]).find(d => d !== 0);
if (!(cmp > 0)) fail(`${to} is not newer than ${from}`);

for (const f of manifests) write(f, { ...read(f), version: to });
const l = read(lock);
l.version = to;
l.packages[''].version = to;
write(lock, l);

console.log(`${from} -> ${to}: ${[...manifests, lock].join(', ')}`);
if (!readFileSync(root + 'CHANGELOG.md', 'utf8').includes(`\n## ${to} `))
  console.warn(`warning: CHANGELOG.md has no "## ${to} (date)" section yet`);
console.log(`
next:
  git commit -am "Release v${to}"
  git tag -a v${to} -m "temper ${to}"
  git push origin main v${to} && git push github main v${to}
  npm publish && (cd packages/inspect && npm publish)`);

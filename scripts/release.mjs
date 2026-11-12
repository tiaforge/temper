// Releases @tiaforge-ui/temper and @tiaforge-ui/temper-inspect together (one vX.Y.Z tag for both). It bumps both
// versions, the lockfile and the peer range temper declares on temper-inspect (>= this version, because the Vite
// plugin needs the matching audit), turns the changelog's "Unreleased" heading into this version, commits
// "Release vX.Y.Z" and tags it. Pushing and publishing stay manual: it prints the commands.
// Usage: node scripts/release.mjs <patch|minor|major|X.Y.Z> [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifests = ['package.json', 'packages/inspect/package.json'];
const lock = 'package-lock.json';
const changelog = 'CHANGELOG.md';
const PEER = '@tiaforge-ui/temper-inspect';

const fail = msg => { console.error(`release: ${msg}`); process.exit(1); };
const read = f => JSON.parse(readFileSync(root + f, 'utf8'));
const write = (f, json) => writeFileSync(root + f, JSON.stringify(json, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const arg = args.find(a => !a.startsWith('--'));
if (!arg) fail('usage: npm run release -- <patch|minor|major|X.Y.Z> [--dry-run]');

if (git('status', '--porcelain')) fail('the working tree has uncommitted changes, commit or stash them first');

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
if (git('tag', '--list', `v${to}`)) fail(`the tag v${to} exists already`);

const log = readFileSync(root + changelog, 'utf8');
const date = new Date().toISOString().slice(0, 10);
let newLog = log;
if (/^## Unreleased[ \t]*$/m.test(log)) newLog = log.replace(/^## Unreleased[ \t]*$/m, `## ${to} (${date})`);
else if (!log.includes(`\n## ${to} `)) fail(`${changelog} has no "## Unreleased" section to release (or "## ${to} (date)")`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const remotes = git('remote').split('\n').filter(Boolean);
const files = [...manifests, lock, changelog];
console.log(`${from} -> ${to}${dry ? ' (dry run, nothing written)' : ''}: ${files.join(', ')}; ${PEER} peer range >=${to}`);

if (!dry) {
  for (const f of manifests) {
    const json = { ...read(f), version: to };
    if (json.peerDependencies?.[PEER]) json.peerDependencies[PEER] = `>=${to}`;
    write(f, json);
  }
  const l = read(lock);
  l.version = to;
  l.packages[''].version = to;
  if (l.packages[''].peerDependencies?.[PEER]) l.packages[''].peerDependencies[PEER] = `>=${to}`;
  write(lock, l);
  writeFileSync(root + changelog, newLog);
  git('add', ...files);
  git('commit', '-m', `Release v${to}`);
  git('tag', '-a', `v${to}`, '-m', `temper ${to}`);
  console.log(`committed "Release v${to}" and tagged v${to}`);
}

console.log(`
next (not run):
  git push ${remotes.map(r => `${r} ${branch} v${to}`).join(' && git push ') || `origin ${branch} v${to}`}
  npm publish && (cd packages/inspect && npm publish)${dry ? '' : `

to undo before pushing: git tag -d v${to} && git reset --hard HEAD~1`}`);

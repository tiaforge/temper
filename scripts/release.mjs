// Releases @tiaforge-ui/temper and @tiaforge-ui/temper-inspect together (one vX.Y.Z tag for both). It bumps both
// versions, the lockfile and the peer range temper declares on temper-inspect (>= this version, because the Vite
// plugin needs the matching audit), turns the changelog's "Unreleased" heading into this version (a pre-release
// leaves it), commits "Release vX.Y.Z" and tags it. Nothing is pushed or published: it prints the commands.
// Usage: node scripts/release.mjs <patch|minor|major|X.Y.Z[-pre]> [--dry-run]
//
// The Release workflow (.github/workflows/release.yml, Actions → Release → Run workflow) runs this on main, pushes
// the commit to a branch of its own, runs CI on it, and only then pushes the tag and publishes both packages.
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
if (!arg) fail('usage: npm run release -- <patch|minor|major|X.Y.Z[-pre]> [--dry-run]');

if (git('status', '--porcelain')) fail('the working tree has uncommitted changes, commit or stash them first');

const current = manifests.map(f => read(f).version);
if (new Set(current).size !== 1)
  fail(`versions are out of sync (${manifests.map((f, i) => `${f}: ${current[i]}`).join(', ')}), fix them by hand first`);
const from = current[0];

// X.Y.Z, or X.Y.Z-pre for a pre-release (0.4.0-rc.1), which the Release workflow publishes under npm's `next` tag
const semver = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const parse = v => (v.match(semver) ?? fail(`can't parse version ${v}`)).slice(1);
const [maj, min, pat] = parse(from).slice(0, 3).map(Number);
// from a pre-release, as `npm version`: 0.4.0-rc.1 goes to 0.4.0 for minor and patch, 1.0.0-rc.1 to 1.0.0 for major
const core = parse(from)[3] === undefined ? null : `${maj}.${min}.${pat}`;
const to = {
  major: core && !min && !pat ? core : `${maj + 1}.0.0`,
  minor: core && !pat ? core : `${maj}.${min + 1}.0`,
  patch: core ?? `${maj}.${min}.${pat + 1}`,
}[arg] ?? arg.replace(/^v/, '');
if (!semver.test(to)) fail(`${to} is not patch, minor, major or an X.Y.Z version`);
// semver order: the numbers, then a pre-release before its release; pre-releases by their dot-separated parts
const pre = (a, b) => {
  const x = a.split('.'), y = b.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    const d = nx && ny ? Number(x[i]) - Number(y[i]) : nx ? -1 : ny ? 1 : x[i] < y[i] ? -1 : x[i] > y[i] ? 1 : 0;
    if (d) return d;
  }
  return 0;
};
const cmp = (a, b) => {
  const [pa, pb] = [parse(a), parse(b)];
  const d = pa.slice(0, 3).map(Number).map((n, i) => n - Number(pb[i])).find(n => n !== 0);
  if (d) return d;
  if (pa[3] === undefined || pb[3] === undefined) return (pa[3] === undefined) - (pb[3] === undefined);
  return pre(pa[3], pb[3]);
};
if (!(cmp(to, from) > 0)) fail(`${to} is not newer than ${from}`);
if (git('tag', '--list', `v${to}`)) fail(`the tag v${to} exists already`);

const log = readFileSync(root + changelog, 'utf8');
const date = new Date().toISOString().slice(0, 10);
let newLog = log;
// a pre-release keeps the "Unreleased" section (its GitHub release shows it), so the release after it dates it
const prerelease = to.includes('-');
if (!/^## Unreleased[ \t]*$/m.test(log) && (prerelease || !log.includes(`\n## ${to} `)))
  fail(`${changelog} has no "## Unreleased" section to release${prerelease ? '' : ` (or "## ${to} (date)")`}`);
if (!prerelease) newLog = log.replace(/^## Unreleased[ \t]*$/m, `## ${to} (${date})`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const remotes = git('remote').split('\n').filter(Boolean);
const files = [...manifests, lock, ...(prerelease ? [] : [changelog])];
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
  if (newLog !== log) writeFileSync(root + changelog, newLog);
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

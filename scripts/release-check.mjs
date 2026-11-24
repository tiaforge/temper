// Run by the Release workflow before anything is tagged or published: the tag (v0.4.0) must be the version both
// packages are at, with temper's peer range on temper-inspect starting there, which `npm run release -- 0.4.0`
// wrote (or the Release workflow, run from the Actions tab). A GitHub release made in the UI for a new tag, without
// that commit, stops here.
// `node scripts/release-check.mjs v0.4.0` prints the npm dist-tag for the version: latest, or next for a
// pre-release such as 0.4.0-rc.1. With `--notes` it prints the version's CHANGELOG.md section instead, for the
// GitHub release (for a pre-release, the "Unreleased" section, which release.mjs leaves undated).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = f => readFileSync(root + f, 'utf8');
const json = f => JSON.parse(read(f));
const fail = msg => { console.error(`release-check: ${msg}`); process.exit(1); };

const tag = process.argv.slice(2).find(a => !a.startsWith('--')) ?? '';
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) fail(`"${tag}" is not a release tag (vX.Y.Z)`);
const version = tag.slice(1);
const prerelease = version.includes('-');

const found = {
  'package.json': json('package.json').version,
  'packages/inspect/package.json': json('packages/inspect/package.json').version,
  'package.json peerDependencies["@tiaforge-ui/temper-inspect"]':
    json('package.json').peerDependencies?.['@tiaforge-ui/temper-inspect']?.replace(/^>=/, ''),
};
const wrong = Object.entries(found).filter(([, v]) => v !== version);
if (wrong.length) {
  fail(`the tag is ${tag}, but these are not at ${version}:\n${wrong.map(([f, v]) => `  ${f}: ${v ?? '(none)'}`).join('\n')}\n` +
    `Run the Release workflow with ${version} (Actions → Release → Run workflow), which bumps and tags; or ` +
    `\`npm run release -- ${version}\`, push its commit and tag, and make the GitHub release for that tag.`);
}

if (process.argv.includes('--notes')) {
  const log = read('CHANGELOG.md');
  const heading = prerelease ? /^## Unreleased[ \t]*$/m : new RegExp(`^## ${version.replace(/\./g, '\\.')} \\(`, 'm');
  const start = log.search(heading);
  if (start < 0) fail(`CHANGELOG.md has no "## ${prerelease ? 'Unreleased' : `${version} (…)`}" section`);
  const body = log.slice(log.indexOf('\n', start) + 1);
  const end = body.search(/^## /m);
  console.log((end < 0 ? body : body.slice(0, end)).trim());
} else {
  console.log(prerelease ? 'next' : 'latest');
}

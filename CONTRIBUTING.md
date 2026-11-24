# Contributing

## Releasing

`@tiaforge-ui/temper` and `@tiaforge-ui/temper-inspect` are released together, at one version and one tag. Changes
go into [CHANGELOG.md](CHANGELOG.md) under "Unreleased" as they are made.

From GitHub's UI: Actions → Release → Run workflow (on `main`) → `patch`, `minor`, `major` or the version, such as
`0.4.0` (`0.4.0-rc.1` for a pre-release, published to npm under `next` instead of `latest`). The workflow runs
`npm run release -- <version>` (both versions and temper's peer range on temper-inspect bumped, the changelog's
"Unreleased" heading dated, commit "Release v0.4.0") and pushes the commit to a temporary branch, `release/v0.4.0`;
runs CI on it; tags it `v0.4.0` only once CI passed; publishes temper-inspect, then temper, with npm provenance;
then moves `main` to the release commit (merging it, if `main` moved on meanwhile), makes the GitHub release, its
notes the changelog's section, and deletes the branch. A pre-release leaves "Unreleased" undated, so the release
after it dates it; its GitHub release shows that section and is marked as a pre-release.

Or locally: `npm run release -- 0.4.0` (`--dry-run` shows what it would do), `git push origin main v0.4.0`, then on
GitHub publish a release for the tag `v0.4.0`.

Either way, the [Release workflow](.github/workflows/release.yml) checks that the tag is both packages' version
(`scripts/release-check.mjs`), runs CI on the release commit, and publishes. It holds no token: npm trusts the
workflow through GitHub's OIDC token. A run that fails before the tag leaves nothing behind (its branch is
deleted), so it can simply be run again. Once tagged, a failed publish is retried with "Re-run failed jobs", which
skips a package that is already published.

Set up once:

- npm: for each of `@tiaforge-ui/temper` and `@tiaforge-ui/temper-inspect`, Settings → Trusted publishing →
  GitHub Actions: `tiaforge/temper`, workflow `release.yml`, environment `release`, allowed to publish.
- GitHub: the `release` environment (Settings → Environments; the first run makes it), with required reviewers if
  a release should wait for an approval.

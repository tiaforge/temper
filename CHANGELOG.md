# Changelog

All notable changes to `@tiaforge-ui/temper` and `@tiaforge-ui/temper-inspect`. Versions follow
[semver](https://semver.org); while they are 0.x, a minor version may rename attributes or values. Renames go
through `deprecated` in `vocab.json` first: the old name keeps working, `temper check` warns (TM112) and
`temper check --fix` rewrites it.

## Unreleased

### `@tiaforge-ui/temper-inspect`

- No more runs that hang forever. When the inspected tab's renderer went away (seen with a Vite dev server whose HMR
  socket drops: the page reloads itself and Chrome reports "Render process gone"), every later command to the tab
  waited for an answer that never came. Now a lost tab fails its pending commands at once, every command has a
  timeout (`--timeout`, default 30000 ms; `timeout` in the API), and the step (one URL at one width and scheme) is
  run again in a new tab, twice at most (`retries`, `onRetry` in the API).
- A Flatpak Chrome is really stopped: it runs in a process group of its own that is killed as a whole, also on
  SIGINT, SIGTERM and SIGHUP. Before, killing `flatpak run` left the sandboxed Chrome (13 to 18 processes, about
  240 MB) running as an orphan after every hung or interrupted run.
- A Flatpak Chrome gets TMPDIR (`flatpak run` drops it), so it no longer leaves a `com.google.Chrome.*` folder in the
  app's private /tmp, and the empty mount point of the profile there is removed too.
- JavaScript dialogs (`alert`, `confirm`, `beforeunload`) are answered instead of blocking the tab.
- Tests: `packages/inspect/test/recover.test.js`.

### CSS

- Page transitions: navigations within the site cross-fade (`@view-transition { navigation: auto; }` in
  `core.css`, the browser's default cross-fade), not with `prefers-reduced-motion: reduce`. Browsers
  without cross-document view transitions just navigate. Turn it off with `@view-transition { navigation: none; }`
  in your own CSS (checked in Chromium: it wins over temper's layered rule).

- An item row inside a `data-list` keeps its `data-bar`: the list's row reset (`border: 0`) came later in the cascade
  and removed the colored bar.
- A pressed toggle in a `data-rail` (`aria-pressed="true"`, e.g. notifications on/off) shows its pressed state with the
  soft accent background. The rail item rule's `:not()` outweighed the general pressed styles, so it looked unpressed.
- An `<img>`, `<video>` or `<canvas>` with `width` and `height` keeps its ratio when `max-inline-size: 100%` narrows
  it in a smaller column: `block-size: auto` in the reset. Before, the `height` attribute kept its full height and the
  image was squashed.
- Tests: `test/render.test.js` covers all three.

## 0.1.3 (2026-11-07)

### `@tiaforge-ui/temper-inspect`

- `--cookie name=value` and `--header "Name: value"` (both repeatable; `cookies` and `headers` in the API) for pages
  behind a login: the cookie is set for each page's origin before it loads, the header goes with every request.
  temper-inspect does not log in itself; pass the session cookie or token from your dev login.
- A native (non-Flatpak) Chrome no longer leaves a `com.google.Chrome.*` folder in the temp directory on every run:
  its temp files now live in the throwaway profile, and the browser gets time to exit before it is killed.

## 0.1.2 (2026-11-07)

### CSS

- `data-justify` also aligns the text of a label that wraps: `data-justify="start"` on a button put the first line at the
  start but kept the text centered.
- A `data-variant="item"` button with `data-layout="stack"` (or `row`) keeps its children at the start edge; before, the
  button's own `align-items: center` centered them until you added `data-align="stretch"`.
- A busy item (`data-variant="item"`, rail and menu entries with `aria-busy="true"`) stays clickable and a drop target,
  for example a mailbox that syncs. Busy buttons still ignore clicks.
- A `[popover][data-menu]` that has no room next to its button keeps a gap to the screen edge: it tries the other side,
  then centers under its button and shifts inside the screen (`@position-try --tm-menu-fit`). Before, it could sit flush
  against the edge on phones.
- Tests: `test/render.test.js` checks these in a real browser (skipped without Chrome).

### Checker (`temper check`, Vite plugin)

- `data-justify` and `data-align` on a button (or `a role="button"`) no longer warn that they need `data-layout`
  (TM107): a button is a flex row already, so they take effect.

## 0.1.1 (2026-11-07)

### Checker (`temper check`, Vite plugin)

- `--fix` no longer moves a value to another axis when several axes share it (`sm` is a value of `data-size`,
  `data-gap` and `data-pad`; `center` of `data-layout`, `data-align`, `data-justify` and `data-self`). The
  message names the candidates instead; the fix is only applied when exactly one axis has the value.
- The Vite plugin checks hot updates with the same context as the build: icons the project defines in its own CSS
  (`--tm-icon-*`) no longer fail TM105 in dev, and a missing module import (TM110) is reported in dev too.
- Tokens in `style` attributes are checked in plain HTML files that have no `<style>` block (TM201).
- An icon-only or close button whose content is only whitespace or a comment is reported (TM103).
- `temper check <path>` reports a path that does not exist instead of crashing.

### `@tiaforge-ui/temper-inspect`

- **Fixed a disk leak with a Flatpak Chrome.** The sandbox's /tmp is not the host's, so the profile dir landed inside
  the sandbox (a private tmpfs under `$XDG_RUNTIME_DIR`) and the cleanup removed an empty host directory: every run
  left 70 MB and more behind until the runtime dir was full and the browser no longer started (bwrap: "No space left
  on device"), which looked like a hang. The profile dir is now shared into the sandbox with `--filesystem`, and the
  directories of `file://` pages too, so those work with a Flatpak browser as well. Profiles are also much smaller
  (about 2 MB instead of 75 MB): Chrome no longer downloads components (Safe Browsing lists, dictionaries, models) or
  writes crash reports during a run.
- The browser is killed and its profile removed when the process ends without `close()` (an exception, `process.exit`);
  before, an orphaned headless Chrome kept running.
- A browser that crashes mid-run, or one that does not start, fails with a message (and Chrome's stderr) instead of ending
  the process with "unsettled top-level await".
- `scripts/shoot.sh` (and the eval scripts) give headless Chrome a throwaway profile too: without `--user-data-dir`,
  each run left a 100+ MB `scoped_dir` profile in `~/.var/app/com.google.Chrome/config/google-chrome-headless`.
- Tests: the inspector runs against its fixtures (`packages/inspect/test/`) as part of `npm test`.

## 0.1.0 (2026-11-07)

The first release.

### CSS

- `core.css` (5.5 KB brotli): tokens, reset, typography, layout primitives (`data-layout`, `data-gap`,
  `data-pad`, `data-grow`, `data-self`, `data-cols`, …), buttons (`data-variant`, `data-tone`, `data-size`),
  form controls including switches, `meter`, color inputs and multi-row selects, dialog, popover, details,
  tables, cards (with `data-stretch` for clickable ones), badge, callout, avatar, list, divider, tabs
  (`role="tablist"`). Light and dark mode from the OS, or `data-theme` on any element; the palette comes
  from `--tm-hue` and `--tm-chroma`. Nothing has an outer margin. Everything lives in `@layer tm.*` and
  `:where()`, so app CSS always wins.
- `app.css`: app shell with a navigation rail (collapsible without script, a popover drawer on phones),
  floating action button, `data-show`.
- `menu.css`: dropdown menus anchored to their button, checklists, combobox.
- `feedback.css`: toasts (`data-toasts`, `data-toast`) and tooltips (`data-tooltip`, from its text or the
  `aria-label`; anchor-positioned, so a scroll container cannot clip it).
- `table.css`: data tables: sortable headers (`aria-sort` on a `th` with a button), row selection, number
  columns (`data-num`), sticky header.
- `icons.css`: 56 Lucide icons via `data-icon`; the Vite plugin adds any other Lucide icon on demand.
- `pico-compat.css`: `--pico-*` aliases for gradual migrations from Pico CSS.
- `enhance/customizable-select.css`: opt-in `appearance: base-select` styling (Chromium 135+).
- Baseline 2024 browsers: Chrome/Edge 123+, Firefox 120+, Safari 17.5+.

### Checker (`temper check`, Vite plugin)

- Closed vocabulary: unknown values (TM101), values on boolean attributes (TM102), misspelled attributes
  (TM104), unknown icons (TM105) and tokens (TM201), each with a suggestion, often the right axis
  (`data-variant="danger"` → `data-tone="danger"`).
- Accessibility: icon-only and close buttons without a label (TM103), fields without a label (TM106).
- Context from vocab.json: attributes that need another one (TM107), the wrong element (TM108, e.g.
  `data-pairs` off a `dl`, `data-layout` on a `td`), the wrong parent or a missing ancestor (TM109, e.g.
  `data-rail` outside `[data-shell]`), a module the project never imports (TM110).
- Computed values in Svelte, JSX, Vue, Astro and sinter's `data-sn-attr` are reduced to the literals they
  can produce and checked like static ones; `cond && 'x'` and bare booleans, which render `data-x="false"`,
  are flagged (TM111).
- App CSS warnings: `!important` (TM204), fixed colors (TM205), outer margins and margin/padding in `style`
  (TM206), spacing written out instead of the scale (TM207), restyled temper variants (TM208).
  `temper-ignore` silences a line.
- `--fix` applies the safe fixes; deprecations (TM112) are rewritten.
- Reads HTML, Svelte, Astro, Vue, JSX/TSX and CSS/SCSS/Less. The Vite plugin runs it in every build
  (errors fail it), serves icons (`virtual:temper-icons.css`), appends enhancements (`enhance`) and can
  drop unused rules in builds (`prune`).

### Types

- `@tiaforge-ui/temper/react`, `/vue`, `/astro`, `/svelte` (component props) and `/sinter`
  (`data-sn-attr`, needs sinter's `SinterAttributes`): every attribute with its allowed values, generated
  from vocab.json, so the framework's own type checker rejects bad computed values. `false` is a type
  error where it renders the attribute.

### For agents

- `llms.txt` (short) and `llms-full.txt` (every attribute, token and recipe), and `html-custom-data.json`
  for editor completion, all generated from `vocab.json`; tests keep them, the CSS and the checker in sync.

### `@tiaforge-ui/temper-inspect` 0.1.0

- A text report for a running page in headless Chrome: overflow, misplaced overlays, contrast, unlabeled
  controls, covered click targets and cut-off text, with every dialog and popover opened the way a user
  opens it, at several widths and in both color schemes. `--sheet` writes one contact-sheet image per page.

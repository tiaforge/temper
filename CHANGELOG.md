# Changelog

All notable changes to `@tiaforge-ui/temper` and `@tiaforge-ui/temper-inspect`. Versions follow
[semver](https://semver.org); while they are 0.x, a minor version may rename attributes or values. Renames go
through `deprecated` in `vocab.json` first: the old name keeps working, `temper check` warns (TM112) and
`temper check --fix` rewrites it.

## 0.4.1 (2026-11-25)

### Core

- An open dialog or popover no longer traps its `position: fixed` children: its resting scale is `none` instead of
  `1`. Any `scale` other than `none` makes an element the containing block of its fixed descendants, so a fixed
  close button in a full-screen menu sat in the menu's box instead of the viewport's corner. The fade and scale
  in and out look the same.
- Popover backdrops fade in and out with their popover, as dialog backdrops do. A scrim set on a popover (the rail
  drawer's, a site's mobile menu) vanished in one frame on close, while the popover itself still faded.

### Vite plugin

- `icons: { strokeWidth: 1.5 }` draws the Lucide icons the plugin emits with that stroke width (0.5 to 3; Lucide's
  own is 2), for type lighter than Lucide's default weight. Icons are masks, so CSS cannot change the stroke
  afterwards, and copying each SVG into the icon folder defeated Lucide on demand. Folder icons stay as they are;
  a value outside the range fails when the plugin starts.
- `icons`, `enhance` and `prune` work when a CSS file imports temper. `@import 'virtual:temper-icons.css'` failed
  with ENOENT, and an `@import '@tiaforge-ui/temper/core.css'` silently got no enhancements and no pruning (a
  static site: 56 KB with or without `prune`, 45 KB once the import moved to JS). Vite resolves and reads a CSS
  `@import` itself, past every plugin, so the plugin now writes what the `@import` should get into Vite's cache
  folder and points it there. Icon changes in dev update CSS files that import the icons this way. In Sass, Less
  and Stylus, whose imports the plugin cannot reach, it warns instead.
- A build warns about a `data-icon` in its built pages that no icon rule in its built CSS draws, with page and line
  (`warningsFail` makes it fail the build). A name bound from data, such as sinter's `data-sn-attr` over a JSON
  file, is not in the source, so `temper check` could not see it: a card whose SVG had been deleted shipped
  without its icon and nothing said so.

## 0.4.0 (2026-11-24)

### Core

- A closing dialog keeps its layout until it is gone. It is no longer `[open]` while it fades or slides out, and the
  gap, the grid column, a stack wrapper's column and a side sheet's column were set on `dialog[open]`: they dropped
  as the close started, so the dialog's parts closed up or lined up in a row during the fade (a 306px contact
  dialog shrank to 258px). Only `display` depends on `[open]` now.
- `data-gutter` (boolean): reserves the scrollbar's space on a scroll container (`scrollbar-gutter: stable`), so its
  content does not shift sideways when it starts or stops overflowing. With classic scrollbars (Chrome and Edge on
  Linux and Windows) a centered column moved by half the scrollbar width whenever a tab, a filter or loading data
  made `<main>` of a `data-shell="fixed"` page shorter or taller than the screen. Opt-in, like Tailwind's
  `scrollbar-gutter-stable`: the space stays reserved when nothing overflows, so it belongs on the element that
  scrolls (that `<main>`, a pane, `<html>`), not on a `<main>` that only holds panes.

- **Default look.** Font weights are only 400 and 600: buttons, labels, summary, table headers and the file button are
  600 (were 550, which static system fonts render as medium on one system and bold on another); menu items, rail items
  and tooltips are 400. In light mode the page is off-white (`--tm-bg` L 0.985) so white cards, fields and overlays lift
  off it; `--tm-fill` is L 0.955; print stays white. `--tm-shadow-lg` has two layers (a contact shadow and the ambient
  one). `data-bar` and toned toasts draw a straight bar. A multi-row `<select>` has padded, rounded option rows with a
  hover fill. The rail, menus, `data-scroll` panes, dialogs, list-box selects and textareas have thin scrollbars in the
  theme's colors, the thumb a mix of the muted text color and `--tm-border-strong` (65/35): at least 3.4:1 on every
  surface in light and 4.3:1 in dark, every hue (a `--tm-border-strong` thumb was 1.5:1; `npm run contrast` now checks
  it); in forced colors the browser draws it in system colors. A sticky table header paints the surface it sits on (page, card or dialog).
- **Right-to-left** (`dir="rtl"`): switch, select arrow, vertical tabs, drawer, toasts, menus and the rail chevron
  mirror. **Forced colors** (Windows high contrast): icons, switches, selected, pressed and current items, progress,
  meter and menu focus stay visible. **Print**: no rail, floating action button, toasts, tooltips or shadows; fixed
  shells and scroll areas print in full, in the light scheme. **Safe areas**: the rail, drawer, floating action button
  and toasts keep clear of notches and the home indicator with `viewport-fit=cover`.
- **Dialogs.** The page behind an open modal dialog no longer scrolls; with classic scrollbars its scrollbar space stays
  reserved, so nothing shifts (browsers without scroll-driven animations reserve it whenever a dialog is open). A dialog
  taller than the screen keeps its header and footer in view and scrolls the content between them (`dialog >
  header/footer`, also through one `form`, `div` or `article` wrapper). Popovers and `data-menu` popovers fade and scale
  in and out like dialogs; the rail drawer and the toast region keep their own motion.
- `data-sticky="top|bottom"`: header, toolbar and save bars stay at the edge of the nearest scroll container, opaque in
  the color of the surface they sit on, above the sticky table header, clear of the home indicator, not sticky in print.
- `data-join` (boolean): buttons, inputs, selects and `data-field` drawn as one unit (toolbar groups, split buttons,
  pagers, search field + button), for every variant, size and density, in RTL, with the focus ring in front.
- Cards: an `img`, `picture` or `video` as the first child of an `article` runs edge to edge under the card's rounded top
  corners, also with `data-pad` and in clickable cards.
- A focused `data-sr-only` element is shown, so a skip link works (recipe in llms-full.txt).
- Fixed: a tooltip no longer moves a positioned element (the floating action button fell into the page flow), and no
  longer hides a busy button's spinner, a `data-stretch` card overlay, a sort arrow or the caret of a text button that
  opens a menu; it gives way there.
- Fixed: an open dialog printed only the part that fits the screen (one page, clipped: it kept `position: fixed`, its
  screen-height limit and its scrolling in print). It now prints all of its content from the top of the first page,
  with its header and footer once, in place; sheets share the rule, so `sheet.css` is 15 B smaller (brotli) and core
  28 B larger.
- Fixed: in a `data-layout="stack"` dialog, the `data-grow data-scroll="y"` part stayed 8rem tall (`--tm-grow-basis`)
  however much it held, so a dialog with a long list was 274px tall with the list scrolling in 128px. The part now
  starts from its content: the dialog grows with it up to the screen's height and the part scrolls from there, and a
  short one stays small. Only in stack dialogs: in a row or split dialog `data-grow` keeps its 8rem start (a first
  version applied it to every dialog, and a search field next to its button wrapped onto its own line). It also works
  through a wrapper: in `<dialog><form data-layout="stack">header, part, footer</form></dialog>` (or a `div` or
  `article`) the dialog becomes a column and the wrapper shrinks to the dialog's limit; the part stayed 8rem tall there
  too. The wrapper is the stack that holds the header or footer, so `hidden` helpers, `<template>`s and custom elements
  beside it (and the dialog's own header outside it) do not matter; a content stack between the dialog's own header
  and footer stays as it was. Core +52 B (brotli) for both (requiring the wrapper to be the only child was 6 B less,
  and fell back to the 8rem part with any sibling).
- Fixed: an invalid field keeps its danger border on hover (an invalid checkbox shows it too); disabled buttons no longer
  change on hover or move when pressed, and disabled fields have no hover border; checkbox and radio marks contrast with
  their fill inside a toned container (a warning callout) and when invalid.
- Fixed: in a focused list-box `<select multiple>` (or `size` > 1) the checked options' text was unreadable in Chrome
  and Firefox (contrast 1.4): the browsers force the selection's text color over temper's accent tint while the list has
  focus. A focused list now shows the browser's own selection colors; the tint stays for an unfocused one. Core +1 B.
- Fixed: in forced colors (Windows high contrast) a `<select>` had no arrow and the checked options of a list-box select
  were unreadable or looked unchecked: browsers drop gradient backgrounds in that mode, and both were gradients (seen in
  Chrome and Firefox). Selects now get the native arrow (`appearance: auto`) and checked options the system's selection
  colors there; the customizable-select enhancement keeps its own picker. Core +27 B.
- Fixed: `::selection` and `::placeholder` styles never applied (pseudo-elements are not allowed inside `:where()`); for
  the same reason reduced motion did not reach `::before`, `::after` and `::backdrop` (details chevron, check marks,
  switch knob, dialog backdrop). iOS Safari did not get `-webkit-text-size-adjust`. `data-size="md"` inside a `sm` or
  `lg` container kept the container's font size.
- Performance: `data-layout="split"` no longer makes every container on the page restyle all its children when one child
  is added or removed (Chrome, a 3,000-row list: 13–17 ms per append, now 0.3 ms). `test/perf.test.js` counts restyled
  elements so it cannot come back.
- Size: `icons.css` is 211 B smaller (brotli): each icon's image is the fallback in its `[data-icon]` rule
  (`--_icon: var(--tm-icon-<name>, url(…))`) instead of a `:root` property. A byte-minimization pass over `core.css`
  and the modules removed what could go without changing a pixel; the build strips a `-webkit-text-decoration-color`
  copy the minifier adds needlessly.

### New modules

- **`forms.css`** (`@tiaforge-ui/temper/forms.css`, also in `all.css`): `data-field` puts an icon, prefix or suffix
  text, or a button inside a field (search field, amount with unit, password with reveal button); focus, hover, invalid,
  read-only and disabled show on the whole field. Also: `readonly` fields look read-only, the label of a `required`
  field gets an asterisk that screen readers do not read twice, whether it wraps the field or is a `<label for>` just
  before it (the markup for a field with a button; off: `label::after { content: none }`), autofilled
  fields get a tint from the theme, `<input type="range">` is styled with a filled track, and a `<progress>` without a
  value shows a sweeping segment.
- **`prose.css`**: `data-prose` for long-form text (rendered Markdown, CMS HTML, mail bodies): spacing between blocks
  that collapses through `div` and `section` wrappers, a 65ch reading width (`--tm-measure`, `none` for full width),
  fluid `h1`/`h2`, images in running text stay inline, layout tables (`role="presentation"` or no `th`) lose the
  data-table look, temper components inside keep their own spacing, and `<article data-prose>` is a post, not a card.
- **`sheet.css`**: `<dialog data-sheet="end|start|bottom|narrow">` is a side panel or a bottom sheet that slides in from
  its edge; `narrow` is a bottom sheet below 48rem and a centered dialog above. The edges a sheet touches add the
  safe-area inset (notch, home indicator) to its padding, also with `data-pad` (which replaced it at first, so a padded
  bottom sheet's content sat under the home indicator).
- `app.css`: `data-container`: inside one, `data-show` follows the width of the nearest container instead of the screen
  (panes of multi-pane apps).
- `menu.css`: `<span data-caption>` labels a group of items, and a `<kbd>` at the end of an item shows its shortcut.

### Behavior changes to check in your app

- CSS that reads `var(--tm-icon-<name>)` of a default icon gets nothing unless you set it; setting it to replace or add
  an icon works as before. Use `data-icon` to draw a default icon.
- A card whose first child is an `img`, `picture` or `video` now runs it edge to edge.
- A closed `[popover]` is transparent so it can fade out: CSS that shows a closed popover statically must also set
  `opacity: 1`.
- `article` is not styled as a card when it has `data-prose`.
- With `forms.css`, labels of `required` fields show an asterisk; remove one written in the label text.
- `temper check --icons <dir>` with a folder that does not exist is an error (exit 2), and unknown options are errors.

### Checker and CLI

- Markup inside `//` comments, strings, template literals and regular expressions in .jsx/.tsx, and inside strings and
  comments of Svelte/Astro `{…}` and Vue `{{ }}` expressions, is no longer checked (it could fail the build). TypeScript
  generics are handled. A `<script>` or `<style>` tag with a `>` in a quoted attribute (Svelte `generics="…"`) no longer
  hides the rest of the file from the check.
- TM116 (a tooltip on something that cannot take focus) counts a link whose `href` is bound by sinter's
  `data-sn-href`, as it did one bound by `data-sn-attr` or `:href`.
- New warning TM122: a `<button>` in a `data-field` inside a wrapping `<label>`. The label's text then includes the
  button's name, so the input is announced as "API key Copy" (measured in Chrome's accessibility tree); use
  `<label for="…">` with the field outside the label. Not judged through a component or custom element. The kitchen
  sink's API key and disabled fields had this markup and now use `<label for>`.
- New warning TM123: a `data-tooltip` that never shows. The tooltip is the `::after` and gives way where that is
  taken: on a text button that opens a popover (`popovertarget` without `popovertargetaction="hide"`, or `commandfor`
  with `command="toggle-popover"` or `"show-popover"`; its `::after` is the dropdown caret), on a `data-stretch`
  element (the overlay) and on a direct child of an `aria-sort` header (the sort arrow). The message says to put the
  hint in the label or use an icon button (`data-icon` with `aria-label` and no text), which keeps its tooltip. Not
  judged where an expression decides the attribute or the button's content.
- TM121 reports only solid buttons that certainly render side by side: not alternatives (`{#if}`/`{:else}`, `{#await}`
  branches, `a ? <x/> : <y/>`, `v-if`/`v-else`), and not conditional, repeated or hidden ones.
- TM205 no longer reports colors inside `light-dark()`. TM101 names the range for a number outside it ("from 2 to 7")
  instead of guessing. TM106: a component named `<Select>` is no longer treated as a `<select>` field.
- CLI: `--help`/`-h` exit 0, new `--version`/`-v`, unknown options and commands are errors (exit 2) with a suggestion,
  `--` ends the options.
- Type declarations for `@tiaforge-ui/temper/vite` and `@tiaforge-ui/temper/check`; they need no `vite` types.
- The README size table is generated from a real build (`npm run gen`) and checked by `npm test`.

### Docs and tooling

- `--tm-shadow-sm` is described as what it is (a faint `0 1px 2px` resting shadow on cards, the selected segment and
  tooltips), not "none in the default look".
- `npm run visual` also covers `forms.html`, `layout.html`, `prose.html` and `overlays.html` (light, dark, phone; a tall
  dialog scrolled, a side sheet, a bottom sheet on a phone, an open menu with captions and shortcuts): 37 states. A case
  without a baseline is reported as new, with its shot in `shots/visual/`, instead of silently becoming its own
  baseline; `--update --only <name>` makes it one. Shots take no width for a reserved scrollbar gutter (as in
  temper-inspect); the existing 20 states are unchanged by that.

- `data-shell` and the App shell recipe: panes that each scroll by themselves in a `data-shell="fixed"` app need
  `<main data-layout="split" data-wrap="none">`; with the default wrapping the panes grow to their content and the
  whole `<main>` scrolls. The panes recipe shows the phone case (`data-show="wide"` on the reader, the ☰ button in a
  pane that is not a container). A render test pins that markup (`test/fixtures/shell-split.html`).

### Vite plugin

- On-demand icons include every name a `data-icon` expression can produce (`dark ? 'sun' : 'moon'`). New option
  `icons: { include: [...] }` for names the source does not show; a notice with file and line points to such places
  (silenced by `temper-ignore`), and `temper check --lucide` prints it too.

### temper-inspect

- An overlay's button must be on the page to be clicked, not only rendered: one moved past the edge (an app's own
  off-canvas drawer, closed on phones) or outside an ancestor that clips does not count, so the overlay is opened
  directly and the report says its button is hidden or off-screen at this width. Before, the click opened a popover
  anchored to that off-screen button, and the inspector reported it as extending outside the viewport.
- `--sheet <dir>` also writes every state at full size (1 CSS pixel = 1 pixel), to
  `<dir>/<page>/<state>-<width>-<scheme>.png`, and the report lists that directory. The contact sheet scales a
  1280px page down to 480px, too small to read its text or judge an icon. `--json` lists the files under `shots`.
- On a signal or exit, the browser's profile directory is removed only once its processes have stopped (Linux: none
  of its process group runs any more; at most 2 s), and the removal is repeated while the directory is still there.
  SIGKILL is not instantaneous: under CPU and disk load a quarter of the runs still had browser processes running when
  the removal started, and a write from one of them left the profile behind (seen once in 720 signal runs under load,
  and as a rare failure of the recover test).
- The DevTools page object has `on(method, fn)` for protocol events (used by the restyle-count tests).
- A reserved scrollbar gutter takes no width any more. The browser hides its scrollbars, but `scrollbar-gutter:
  stable` still reserved 15px: while a modal dialog was open on a page that scrolls (temper's scroll lock), the page
  and every dialog were laid out 15px narrower than on any screen, so a dialog whose content just fits a phone was
  reported as overflowing, rows in it as wrapped (one in the kitchen sink's details sheet), and the shots showed a
  bottom sheet stopping short of the right edge and an end sheet with a strip of unshaded page beside it. The dev-page
  audit of the Vite plugin runs in your own browser, where the gutter is the real scrollbar's, and is unchanged.

## 0.3.0 (2026-11-12)

### Core

- `aria-busy` shows after `--tm-busy-delay` (new token, default 200ms), so a request faster than that shows
  nothing: a busy button keeps its label until its spinner fades in, an item's spinner fades in, a busy form, list,
  section or `data-layout` dims after the delay. Pointer input is still blocked at once (no double submit).
- A container that was dimmed while busy fades back when `aria-busy` is removed; one whose request ended within the
  delay was never dimmed and does not move.
- A busy text line (`<p aria-busy="true">Loading…</p>`, the line sinter shows with `data-sn-show` while a resource
  loads; also `span`, `small`, `output`) has a spinner and appears after the delay. It had only a progress cursor.
- With reduced motion a busy spinner pulses slowly (1.4s) instead of turning. The reduced-motion rule forces every
  animation to 1ms, so the infinite spinner turned 1000 times a second: a flickering ring.
- Render tests (`test/fixtures/busy.html`): the state within the delay, after it, the fade back, and the
  reduced-motion spinner. The busy test sets normal motion itself: the test browser emulates reduced motion.

## 0.2.0 (2026-11-12)

### Core

- `data-lazy`: on the container of a long list, its rows far off screen skip layout and paint (`content-visibility: auto`).
  Restyle and layout of 500 rows in Chrome went from 80 ms to 1 ms; no change in Firefox. `--tm-lazy-h` sets the
  row height until a row has been shown.

### Vite plugin

- `inspect: true` runs the `@tiaforge-ui/temper-inspect` audit inside the dev page (after load, hot updates, page
  changes, and when a dialog or popover is opened, which is then checked as its own state) and prints its findings in
  the dev terminal, once per change. Dev server only.
- In dev, plain HTML elements in pages and components (Svelte, Vue, Astro, JSX) get `data-tm-src="file:line"`, so a
  finding is printed as `src/App.svelte:12 error contrast: …`. `inspect: { source: false }` turns it off.
- `@tiaforge-ui/temper-inspect` is an optional peer dependency (`>=0.1.10`). A missing, too old (no `./audit` export, or an
  audit that cannot check open dialogs) or mismatched one is reported by name and version, and the option stays off.
- `temper-inspect`: exports `./audit`; findings carry `src` when the page has `data-tm-src`; `__tsi.checkOpen()` checks
  the overlays that are open.

### Check

- New rules, all driven by the element's whole content or the whole page, and silent when that is not known (a
  component, slot or rendered expression inside, computed ids): TM113 `aria-label="TODO"`, TM114 dialog without a
  name, TM115 table without `<th>`, TM116 `data-tooltip` on an element that cannot take focus, TM117 skipped
  heading level, TM118 duplicate id, TM119 `popovertarget`/`commandfor`/`for`/`list`/`aria-*` pointing to an id
  that is not on the page, TM120 a popover or dialog nothing opens, TM121 two solid buttons in one parent.
- `temper check --fix` stubs a missing label (TM103) with `aria-label="TODO"`, and rewrites a bare boolean
  (`data-menu={on}`) to `{on || null}` (TM111). The stub is itself an error (TM113), so the build keeps failing until
  someone writes the real label.

### CSS

- `data-segmented`: a `role="radiogroup"` of `<label><input type="radio">text</label>` drawn as a segmented control
  (the checked option a raised chip on a track; the radios stay in place and invisible, so keyboard and screen
  readers work as for any radio group). `data-size` and the density set its height. Moved here from Caley's
  week/month switch. In the kitchen sink next to the tabs.

## 0.1.9 (2026-11-10)

### CSS

- Dark theme: `--tm-fill` 0.235 → 0.27 lightness. A neutral secondary button nearly vanished on a dialog (0.035
  above the raised surface) and looked smaller than the primary next to it; now 0.07 on dialogs, 0.1 on cards,
  0.125 on the page, still below `--tm-border`. Also code, pre, meter/progress tracks, tab and item hovers.
- A menu with more items than fit (`[data-menu]` is capped at `min(24rem, 80dvh)` and scrolls) no longer squashes
  its rows onto each other: its items do not shrink (`flex-shrink: 0`). Render test with a long checklist menu.
- No browser tap highlight (`-webkit-tap-highlight-color: transparent` on `html`, inherited): Chromium on Android
  drew a fading rectangle over a tapped button, which showed through a nav drawer opening over it (Caley's ☰ on a
  phone). Buttons, links and items keep their own hover, press and focus states.

### Docs and tooling

- The dialog example's dismiss button is ghost, like Cancel in the kitchen sink and the variant vocabulary (it was
  secondary).
- Contrast check: a background is composited over the surface it sits on (was always white), and the fill is
  checked on bg, surface and raised.

## 0.1.8 (2026-11-09)

### CSS

- A link with an icon and text (`<a href="/" data-icon="arrow-left">All tasks</a>`) keeps 0.375em between icon
  and text; the icon sat against the first letter. Links that lay out with a gap already (rail and menu items,
  `role="button"`, `data-variant`, `data-layout`) and icon-only links are unchanged.

## 0.1.7 (2026-11-09)

### CSS

- A clickable card whose `data-stretch` element is a button (`<button data-stretch data-variant="link" commandfor=…>`,
  as the docs suggest for opening a dialog) or an `a[role="button"]` is clickable anywhere again. Buttons are
  `position: relative` (for the busy spinner), so the card-wide overlay was placed against the button and only its
  text took clicks; and the press transform made the button the overlay's containing block again, so a press
  elsewhere on the card shrank the overlay and the click went to the card, not the button. A stretch element is now
  `position: static` and not moved when pressed. A busy one (`aria-busy="true"`) stays `position: relative`, so its
  spinner shows on the button; the card is not clickable while it is busy. Test: `test/render.test.js` (real mouse
  presses in Chromium, `test/fixtures/stretch.html`).

### Build

- Size budgets sit about 5-10 % above the current sizes, so a fix fits and growth means raising one on purpose:
  `core.css` 5.5 -> 6 KB (it was 3 bytes under its budget, so the fix above needed a raise), `all.css` 16 -> 11.5 KB,
  `icons.css` 6 -> 3.5 KB (brotli). The README lists them.

## 0.1.6 (2026-11-09)

### CSS

- Page transitions: navigations within the site cross-fade (`@view-transition { navigation: auto; }` in `core.css`,
  `tm.base` layer), not with `prefers-reduced-motion: reduce`. An app turns it off with
  `@view-transition { navigation: none; }` in its own CSS.
- Reset: `block-size: auto` on `img`, `video` and `canvas`, so one with `width` and `height` attributes keeps its
  ratio when `max-inline-size` narrows it (the height attribute used to squash it).

## 0.1.5 (2026-11-08)

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

## 0.1.4 (2026-11-07)

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

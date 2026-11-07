# tinystyle — spec (v0)

Status, 2026-11-07: core look decided, `src/core.css` prototyped. See §8 for what is built and what
is missing.
First consumer: caley (replacing Pico CSS). Second: tia.vision (Astro marketing/portfolio site).

## 0. What we learned from caley + Pico

- Pico is 83 KB minified. Caley still has about 2,900 lines of app SCSS on top of it.
- Caley's `main.scss` has a comment about landing "just above Pico in specificity but below component
  scoped / #id overrides". Agents ended up fighting specificity.
- The app code has 48 `margin-*: 0` overrides. Pico puts outer margins on inputs, buttons and
  headings, so every layout has to cancel them.
- Pico's spacing tokens overlap and are easy to mix up: `--pico-spacing`,
  `--pico-form-element-spacing-vertical`, `--pico-typography-spacing-vertical`,
  `--pico-block-spacing-*`. This is where agents mixed up margin and padding.
- Pico's modifier classes mix two separate ideas: `.secondary`/`.contrast` choose a color,
  `.outline` chooses a style. They look like Bootstrap/Tailwind classes but mean different things.
- Gaps in Pico led caley to write its own versions of the same things: `icon-btn`, `close-btn`,
  `nav-btn`, `page-btn`, `link-btn`, `delete-btn` (button variants); `form-error`, `error-msg`,
  `pgp-error`, `form-success` (status text); `detail-row`/`detail-label`, `compose-row`,
  `rrule-row` (label/value rows); attachment chips (badges).
- Caley already uses modern HTML: `<dialog>`, `popover`, `commandfor`/`command`, `<template>`.
  sinter sets `aria-busy` while requests are running.

## 1. Design principles (in priority order)

### 1.1 AI-first: a small vocabulary that is enforced

1. **Semantic HTML first.** `button`, `input`, `select`, `textarea`, `dialog`, `details`, `table`,
   `article`, `nav`, `dl`, `progress` and `[popover]` look finished with no attributes at all.
2. **Use ARIA/HTML state before inventing anything.** `disabled`, `aria-busy`, `aria-invalid`,
   `aria-current`, `aria-pressed`, `aria-expanded`, `:user-invalid`, `[open]`, `:popover-open`.
3. **Variants are enumerated `data-*` attributes, not classes.** Each attribute is one axis with a
   closed set of values:
   - Values on one axis are mutually exclusive (`data-variant` can't be both outline and ghost).
     Classes can't guarantee that (`.secondary.outline.contrast`).
   - Editors can autocomplete attribute values from `html-custom-data.json`. There is no standard
     way to do that for classes.
   - A checker can validate them exactly (see 1.1.6).
   - Names unlike any other framework's mean agents don't pull in Bootstrap/Tailwind habits.
   - They bind directly with sinter's `data-sn-attr`.
4. **No spacing utilities, and components never set an outer margin.** This is the one rule that
   stops the margin/padding mixups:
   > Components own their padding (set by density). Parents own the space between children
   > (`data-gap`). Nothing has an outer margin.

   Prose content (`data-prose`) is the only exception, where the rhythm comes from the text flow.
5. **One size scale everywhere:** `xs sm md lg xl`, used the same way in `data-gap`, `data-size`,
   `--ts-space-*`, `--ts-radius-*` and `--ts-text-*`. No numeric scales, because agents would
   read `4` as Tailwind's 1rem.
6. **The vocabulary comes from one machine-readable source.** `vocab.json` generates:
   - `llms.txt`: rules, the full vocabulary, copy-paste recipes and anti-patterns (sinter does the same).
   - `html-custom-data.json` for VS Code and other editors.
   - `tinystyle check`, a CLI and Vite plugin that fails the build on unknown attribute values or
     unknown `--ts-*` tokens, with a "did you mean" suggestion. It warns on hard-coded colors and on
     margins set on library elements. It is standalone, with no sinter dependency.
   - A test that asserts every vocab entry has a CSS selector, and every selector has a vocab entry.
7. **App CSS always wins.** All library CSS lives in `@layer ts.reset, ts.base, ts.layout, ts.components`,
   with selectors wrapped in `:where()`. Unlayered app CSS beats it without `!important` or tricks.
8. **Recipes over components.** `llms.txt` ships about 15 exact HTML recipes: app shell, toolbar,
   form, settings section, list + detail split, empty state, confirm dialog, menu, tabs, and so on.
   Agents copy recipes. They don't make up markup.
9. **Measure it.** An agent eval suite of about 30 tasks ("add a danger outline button under the
   form", "make this list denser"). The score is the number of checker errors and visual diffs per
   task. Rerun it whenever the vocabulary changes.

### 1.2 Tiny

| Bundle | Budget (brotli) |
|---|---|
| `core.css` | **≤ 5 KB** (Pico is about 11 KB gzipped) |
| each module | ≤ 1.5 KB |
| `all.css` | ≤ 12 KB |

How we stay under budget:
- Each color is declared once with `light-dark()`. Pico declares its palette about 3 times.
- The palette is derived from 2–3 input variables with relative color syntax. No palette tables.
- No vendor prefixes and no legacy fallbacks.
- `:where()`, so no repeated high-specificity selectors.
- Plain CSS source, bundled and minified with Lightning CSS. No Sass.

CI enforces the budgets (`size-limit`).

### 1.3 Light/dark, switched automatically

- `:root { color-scheme: light dark }`. Every token uses `light-dark()`, so the OS setting switches
  the theme with no JS.
- `data-theme="light|dark"` overrides the theme on **any element**, not just `<html>`, because it
  only sets `color-scheme`. That makes it possible to have a dark hero on a light page (tia.vision),
  or to force an email-reader iframe to light (caley).
- Recommend `<meta name="color-scheme" content="light dark">` to avoid a flash on load. An optional
  5-line snippet stores a user override.
- Dark mode is designed, not inverted: higher surfaces get *lighter* instead of using shadows, and
  accent chroma is lower.
- Also covered: `prefers-reduced-motion`, `prefers-contrast: more` (stronger borders), and
  `forced-colors` (system colors, visible focus).

### 1.4 Consistent, modern look: "Graphite" (decided)

- Pure grey neutrals (`--ts-neutral-tint: 0`), white surfaces in light mode, graphite (L 0.145)
  in dark mode. Structure comes from 1px borders; there are no resting shadows. Only overlays
  (dialog, popover) get a shadow.
- **Main buttons are monochrome:** black in light mode, white in dark mode
  (`--ts-primary: var(--ts-neutral)`). The accent is reserved for selection, focus, links and checked
  controls. So black means "do this" and blue means "this is selected or interactive".
- Default radius `--ts-radius` = 0.375rem. Everything else is derived from it (`sm` = 0.6×,
  `lg` = 1.5×, badges 0.67×, `full`).
- Headings: weight 600, tracking −0.025em.
- **One control height.** Button, input, select and icon-button are all `--ts-control-h`
  (comfortable 2.5rem, compact 2rem), so toolbars line up without extra work.
- `data-density="compact|comfortable"` can go on any subtree and scales control padding and height.
  Caley sets `compact` on `<html>`. tia.vision keeps the default.
- Focus: `outline: 2px solid var(--ts-accent); outline-offset: 2px` on `:focus-visible` only.
- Motion: 150 ms ease-out. Dialogs and popovers animate in and out with `@starting-style` and
  `transition-behavior: allow-discrete`.
- Type: system font stack (zero bytes) through `--ts-font-sans` / `--ts-font-mono`. App UI uses a
  fixed rem scale. Only the `prose` module uses fluid `clamp()`. `text-wrap: balance` on headings,
  `pretty` on paragraphs, `tabular-nums` in tables and `<time>`.

### 1.5 Modern CSS and HTML

Baseline target: **Baseline 2024** (Chrome/Edge 123+, Firefox 120+, Safari 17.5+). This is set by
`light-dark()`.

| Required (in baseline) | Progressive enhancement only |
|---|---|
| `light-dark()`, `oklch()`, relative color syntax, `color-mix()` | `appearance: base-select` (customizable `<select>`) |
| `@layer`, `:where()`, `:has()`, CSS nesting | `field-sizing: content` (auto-growing textarea) |
| container queries | `interpolate-size` (animated `<details>`) |
| `:user-invalid`, `accent-color` | anchor positioning (menus placed next to their trigger) |
| `<dialog>`, `popover`, `@starting-style` | `contrast-color()` |

Each enhancement must look fine without it, and there are no JS polyfills.

**Decided 2026-11-07: enhancements are a build-time choice.** The default build contains only
features that work in all three engines (Chromium, Firefox, WebKit). Each enhancement is its own
source partial, keyed by its `web-features` id (for example `customizable-select`), and is included
only when you opt in:

```js
// vite.config.js
tinystyle({ enhance: ['customizable-select', 'field-sizing'] })  // or enhance: 'all'
```

The partials live in `src/enhance/<id>.css` and build to `dist/enhance/<id>.css`. The Vite plugin
appends the chosen ones to `core.css`/`all.css` wherever the app imports them; without the plugin, import
`@tiaforge-ui/tinystyle/enhance/<id>.css` after `core.css`. Unknown ids fail with a suggestion.
Implemented: `customizable-select` (2026-11-07).

The precompiled `dist/*.css` files are the default (all-engine) build, so a build step is optional.
Once an enhancement becomes Baseline in all engines, it moves into the default build in a minor
release.

### 1.6 Easy palette swap, with good defaults

The palette is driven by a few inputs (defaults shown):

```css
:root {
  --ts-hue: 255;            /* accent hue, OKLCH degrees ("Vivid" blue) */
  --ts-chroma: 0.19;        /* accent saturation */
  --ts-neutral-tint: 0;     /* how much the greys lean toward --ts-neutral-hue; 0 = pure grey */
  --ts-primary: var(--ts-neutral); /* main buttons; var(--ts-accent) for colored ones */
}
```

`kitchen-sink/theme-examples.css` shows two complete alternative looks (Ink, Fjord), each a single
block of token overrides.

Every role token is derived from those inputs at **fixed OKLCH lightness**. OKLCH lightness tracks
perceived brightness, so contrast stays about the same for any hue. `npm run contrast`
(`scripts/contrast.mjs`) sweeps hues 0–360 (with neutral tint 0 and 0.02) in light and dark mode,
lets headless Chrome resolve the tokens, and checks WCAG AA for each text/background pair: 4.5:1 for
text and solid buttons, 3:1 for the accent as a UI color (focus ring, checked box). For each hue it
also reports the highest chroma that still passes. `--own` checks a palette at its own hue, chroma and
tint; `--css`/`--root` load a theme block (for example `--css kitchen-sink/theme-examples.css --root
data-example-theme=ink`). `npm test` runs the `--own` check for the default look, Ink and Fjord
(skipped without Chrome).

Result, 2026-11-07: with the light-mode accent at L 0.53, green to cyan hues (155–225) were too light
once clipped to sRGB, and the accent solid button and accent text on the accent soft fill dropped to
4.1:1. The light-mode accent is now L 0.47, the lightest value at which every hue passes at the
default chroma 0.19 (dark mode passed already). Above the default, hues 170–205 need a cap: at chroma
0.215 they reach 4.4:1, so keep teal accents at 0.20 or less. Yellow needs no cap: tone ink is
capped at L 0.5 and the text on solid yellow switches to black.

Role tokens (the only colors components use):

```
--ts-bg  --ts-surface  --ts-surface-raised  --ts-fill  --ts-field  --ts-field-border
--ts-text  --ts-text-muted  --ts-border  --ts-border-strong
--ts-accent  --ts-neutral  --ts-danger  --ts-success  --ts-warning  --ts-info
--ts-primary   (the tone of default buttons: accent, or neutral for a monochrome look)
--ts-tone      (current tone; derived per element: --ts-tone-ink, --ts-tone-soft, --ts-tone-on)
```

Any role can also be set directly with a literal color (brand colors). Caley's old `#2563eb` is
`--ts-hue: 263; --ts-chroma: 0.215`.

## 2. Vocabulary (complete list for core)

| Attribute | Values | Applies to | Notes |
|---|---|---|---|
| `data-variant` | `secondary outline ghost link` (default = primary/solid) | button, `a[role=button]`, input[type=submit] | Same names as shadcn, which models have seen a lot. |
| `data-tone` | `accent neutral danger success warning info` | button, badge, callout, text, progress | Sets `--ts-tone`. It works with every variant. A custom color can be set via `style="--ts-tone: …"` (calendar colors through sinter `data-sn-style`). |
| `data-size` | `sm md lg` | button, input, select, badge | |
| `data-icon` | boolean | button | Square, `--ts-control-h` wide. Requires an `aria-label` (the checker enforces this). Replaces icon-btn, close-btn and nav-btn. |
| `data-layout` | `stack row grid split center` | any container | stack = vertical flow, row = horizontal wrapping cluster, grid = auto-fit columns (`--ts-min` sets the column minimum), split = sidebar + content, center = max-width container |
| `data-gap` | `none xs sm md lg xl` | any `data-layout` | **The only spacing control.** |
| `data-align` / `data-justify` | `start center end stretch` / `start center end between` | any `data-layout` | |
| `data-density` | `compact comfortable` | any subtree | |
| `data-theme` | `light dark` | any subtree | |
| `data-badge` | boolean | span | Uses tone. Replaces attachment and type chips. |
| `data-callout` | boolean | div, `[role=alert]`, `[role=status]` | Uses tone. Replaces form-error, pgp-error and similar. |
| `data-muted` | boolean | any text | |
| `data-truncate` | boolean | any | Single-line ellipsis. |
| `data-sr-only` | boolean | any | Visible to screen readers only. |
| `data-pairs` | boolean | `dl` | dt/dd shown as a label/value grid using subgrid. Replaces detail-row and compose-row. |

That is about 15 attributes. The goal is that the whole core vocabulary plus its rules fit in an
`llms.txt` of about 200 lines.

### Things styled without any attributes

Buttons, every input type, `role="switch"` checkboxes, `select`, `textarea`, `label > input`
stacking, `fieldset/legend`, `dialog` (with header, body and footer from `header/footer` children),
`[popover]`, `details/summary`, `table`, `article` (card), `nav ul`, `progress`, `meter`, `code/pre/kbd`,
`hr`, `mark`. `[aria-busy=true]` shows an inline spinner and blocks pointer input. `[aria-invalid]`
and `:user-invalid` get the danger border and message styling.

## 3. Feature split

```
tinystyle/core.css       tokens, reset, typography, layout primitives, buttons, forms, dialog,
                         popover, details, table, card, badge, callout, aria-busy
tinystyle/app.css        full-height app shell: nav rail/sidebar, collapsible rail, scroll containers (caley)
tinystyle/menu.css       popover menus and dropdowns, anchor positioning, menu separators
tinystyle/nav.css        tabs, segmented control, breadcrumbs, pagination
tinystyle/data.css       dense list rows (mail list), selection states, sticky headers, resize handle
tinystyle/feedback.css   toast stack, skeleton, empty state
tinystyle/prose.css      long-form text (`data-prose`), fluid type: email reader, blog, tia.vision
tinystyle/site.css       marketing: hero, section, feature grid, timeline, nav bar (tia.vision)
tinystyle/all.css        everything
```

Every module uses only core tokens and adds to the same `vocab.json`. The checker only accepts
attributes from modules that are actually imported.

## 4. Integration with sinter

**Decided 2026-11-07: no coupling.** tinystyle knows nothing about sinter and the reverse. They
meet only through web standards: ARIA attributes and plain custom properties.

- Style `aria-busy`, which sinter sets on elements while their request runs.
- `tinystyle check` is a standalone CLI/Vite plugin. Editors can load both `html-custom-data.json`
  files side by side.
- Later, not now: a marker for rows pending an optimistic update.
- Tokens are plain custom properties, so `data-sn-style="{'--ts-tone': cal.color}"` colors
  badges, dots and event chips.
- Verify that sinter's own elements (`sn-resource`, `sn-sync`, `sn-event`) never take up layout space.
  Use `display: contents` or `none`, in sinter itself, not in tinystyle.

## 5. Engineering

- Repo: plain CSS in `src/`, plus `vocab.json`, plus `scripts/` (build, generate docs and custom
  data, contrast validator, size check).
- Tests: Playwright screenshots of a kitchen-sink page in {light, dark} × {compact, comfortable} ×
  3 hues. Also the vocab ↔ selector consistency test, contrast sweep, size budgets and agent evals.
- Package: `@tiaforge-ui/tinystyle` (to be confirmed), ESM-free CSS exports per module, MIT.
- Version the vocabulary with semver. Removing or renaming an attribute value is a major version.

## 6. Caley migration plan

1. Map the Pico tokens caley uses to tinystyle roles (`--pico-muted-color` → `--ts-text-muted`, …).
   A codemod can do most of this.
2. Replace `.secondary/.outline/.contrast/.small` with `data-variant`/`data-tone`/`data-size`.
3. Delete the local reinventions listed in §0.
4. Delete the `margin: 0` overrides. They should become unnecessary.
5. Run `tinystyle check` in CI. Then, page by page, move layouts to `data-layout` + `data-gap`.

Expected result: Pico (83 KB) plus a large share of the 2,900 lines of SCSS goes away.

## 7. Decisions log

All 2026-11-07.

1. Attributes are unprefixed (`data-variant`, `data-tone`, …). Tokens use the `--ts-*` prefix. Apps
   must not use these attribute names for their own purposes; the checker flags it.
2. Name `tinystyle`, package `@tiaforge-ui/tinystyle` (agreed in principle).
3. Look: Graphite, accent "Vivid" (hue 255, chroma 0.19), black/white main buttons, badges as small
   rounded rectangles (`--ts-badge-radius`).
4. `role="switch"` checkboxes and `dl[data-pairs]` are in core.
5. Progressive enhancements (customizable `<select>` and so on) are opt-in at build time (§1.5).
6. tinystyle and sinter stay decoupled (§4). A pending-row marker is deferred.

## 8. Status

Built:
- `src/core.css`: tokens, reset, base typography, layout primitives, buttons, fields, checkbox,
  radio, switch, progress, card, dialog, popover, details, table, label/value pairs, badge, callout.
  About 4.5 KB gzipped with naive minification.
- `kitchen-sink/`: caley-like screens plus a reference sheet, with switchers for theme example,
  light/dark and density. `scripts/shoot.sh` screenshots each combination with headless Chrome.
- Verified in Chrome and Firefox: relative color syntax with `light-dark()` origins and calc-based
  black/white text selection.

Lessons:
- Mix colors `in oklab`, not `in oklch`: mixing with white swings the hue through pink.
- Derived tone tokens are declared on `*`, so a tone set on a parent reaches its children.
- `light-dark()` only accepts colors, so shadows put it around the color, not the whole shadow.

- Package `@tiaforge-ui/tinystyle`: `npm run build` bundles `src/*.css` to `dist/` with Lightning
  CSS (targets Chrome 123, Firefox 120, Safari 17.5, so nothing modern is lowered) and fails above
  the size budgets. Core: 3,955 B brotli, 4,499 B gzip.
- `vocab.json` is the single source. `npm run gen` writes `llms.txt` (from
  `docs/llms.template.md`) and `html-custom-data.json`. `npm test` fails when they are stale or when
  vocab and CSS disagree.
- `tinystyle check [paths]` (`lib/check.js`): TS101 invalid value (suggests the right axis, e.g.
  `data-variant="danger"` → `data-tone="danger"`), TS102 boolean with value, TS103 icon button
  without label, TS104 misspelled attribute, TS201 unknown token, TS202 reserved `--ts-` prefix,
  TS203 derived token set. Dynamic values (`{…}`) and `data-sn-*` are skipped. No findings on
  caley's current frontend.

Missing, roughly in order:
1. Vite plugin for the checker, and enhancement partials with the build option for them.
2. Trim `llms.txt` (322 lines now; goal about 200).
3. ~~Contrast validator (hue sweep, WCAG AA).~~ Done: `npm run contrast`, see §1.6.
4. Modules for caley: `app`, `menu`, `data`, `nav`, `feedback`, `prose`. Later `site` for tia.vision.
5. Visual regression tests, agent evals (tinystyle vs. daisyUI and Pico on the same caley tasks), README.

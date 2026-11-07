# Changelog

All notable changes to `@tiaforge-ui/temper` and `@tiaforge-ui/temper-inspect`. Versions follow
[semver](https://semver.org); while they are 0.x, a minor version may rename attributes or values. Renames go
through `deprecated` in `vocab.json` first: the old name keeps working, `temper check` warns (TM112) and
`temper check --fix` rewrites it.

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

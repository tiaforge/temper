# tinystyle

Tiny CSS for plain, semantic HTML, designed so coding agents get it right the first time.

- Elements look finished without classes: `button`, `input`, `select`, `dialog`, `[popover]`,
  `table`, `article`, `dl`, `progress` and the rest.
- Variants are `data-*` attributes with a **closed, checked set of values**. A typo fails the build
  and the error suggests the fix.
- Light and dark mode switch with the OS, with no JS. The whole palette comes from two numbers.
- About 5.4 KB brotli for the core. No build step required, no JS runtime, no dependencies.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/app-dark.png">
  <img alt="An app shell built with tinystyle and no CSS of its own: navigation rail, contact cards with avatars, a toolbar with a filter field and an open dropdown checklist" src="docs/screenshots/app-light.png">
</picture>

The app shell demo ([`kitchen-sink/app.html`](kitchen-sink/app.html)) has no CSS of its own. The
screenshots follow your GitHub theme: switch between light and dark to see the other mode.

```html
<form data-layout="stack" data-gap="md">
  <label>Title <input name="title" required></label>
  <label>Email
    <input type="email" aria-invalid="true">
    <small data-tone="danger">Enter a full address, like name@example.com.</small>
  </label>
  <div data-layout="row" data-gap="sm" data-justify="end">
    <button type="button" data-variant="ghost">Cancel</button>
    <button>Save</button>
  </div>
</form>
```

No classes, no margins, no utility soup. Every attribute on that form is one of a few dozen listed
in [`llms.txt`](llms.txt).

## Screenshots

Every variant against every tone, plus badges, callouts and form controls:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/reference-dark.png">
  <img alt="Reference sheet: a matrix of button variants (primary, secondary, outline, ghost, link) against tones (default, accent, danger, success, warning), then button sizes, badges and callouts" src="docs/screenshots/reference-light.png">
</picture>

A mail client from the kitchen sink ([`kitchen-sink/index.html`](kitchen-sink/index.html); the
three-pane layout and the message list use a few lines of demo CSS):

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/mail-dark.png">
  <img alt="Mail client: folder list with unread counts, message list with the selected message highlighted, and a reader with label/value pairs and Reply, Forward and Delete buttons" src="docs/screenshots/mail-light.png">
</picture>

`npm run readme-shots` regenerates them (2560×1440).

## What it does differently

**1. The vocabulary is closed and enforced.** Each attribute is one independent axis with a fixed
list of values: `data-variant` is the style, `data-tone` the color, `data-size` the size. You can't
write `data-variant="danger"` and get something half-working; `tinystyle check` rejects it and tells
you which axis you meant:

```text
$ npx tinystyle check src
t.html:1:9  error TS101 data-variant="danger" is not valid. Did you mean data-tone="danger"? (allowed: secondary, outline, ghost, link)
t.html:2:1  error TS103 <button data-icon="x"> has no visible text. Add aria-label.
t.html:3:26 error TS101 data-gap="16px" is not valid. (allowed: none, xs, sm, md, lg, xl)
t.html:5:7  error TS102 data-badge is a boolean attribute. Write it without a value: data-badge
a.css:1:10  error TS201 --ts-text-mute is not a tinystyle token. Did you mean --ts-text-muted?
```

It also warns about inputs, selects and textareas that have no label (a placeholder doesn't count).
It reads HTML, Svelte, Astro, Vue and JSX files, plus `--ts-*` tokens in CSS. The Vite plugin runs it
in every build (errors fail the build, the dev server warns). With classes this isn't possible:
nothing knows that `.secondary.outline.contrast` is a contradiction.

**2. Nothing has an outer margin.** The parent owns all space: `data-gap` between children,
`data-pad` inside. There is one size scale, `xs sm md lg xl`, used the same way everywhere. This
removes the most common failure we saw with other libraries: agents stacking margin overrides
against built-in margins, or mixing up four overlapping spacing variables.

**3. State is HTML and ARIA, not extra classes.** `disabled`, `aria-invalid="true"` (error border),
`aria-busy="true"` (spinner, blocks input), `aria-pressed`, `aria-current`, `:user-invalid`,
`[open]`, `:popover-open`. Correct accessibility markup is also the styling, so it doesn't get left out.

**4. Modern HTML works as-is.** `<dialog>` with `commandfor`/`command` invokers, `[popover]` with
light dismiss, `role="switch"` checkboxes, `details`, `dl` as label/value pairs. Dialogs and
popovers animate in and out with `@starting-style`. No JS components to wire up.

**5. Your CSS always wins.** All of tinystyle lives in `@layer ts.*` with `:where()` selectors, so
any plain selector in your app beats it. There is no specificity fight and never a reason for
`!important`.

**6. Theming from two numbers, contrast stays sane.** Every color is derived in OKLCH from
`--ts-hue` and `--ts-chroma` at fixed lightness, and declared once with `light-dark()`. Dark mode
is designed, not inverted (raised surfaces get lighter, accents get less saturated).
`data-theme="dark"` works on **any element**, not just `<html>`, so a dark hero on a light page is
one attribute.

```css
:root { --ts-hue: 180; --ts-chroma: 0.12; --ts-primary: var(--ts-accent); }  /* teal, colored main buttons */
```

## Does it work as expected?

These are the things we measured instead of assuming.

**Agent eval, same tasks, three libraries.** Ten UI tasks from a real calendar/mail app (event form,
delete confirmation, outline danger button, invalid field, toolbar, status badges, settings
switches, dark mode, brand color, exact spacing). An agent wrote each one with only the library's
docs as context, two runs per library. A grader then measured the result in headless Chrome at
1024×768, in light and dark mode: colors, contrast, alignment, sizes, gaps, accessible names.

| Library | Tasks fully correct | Checks passed | Classes used |
|---|---|---|---|
| **tinystyle** | **20 / 20** | **142 / 142** | 3 |
| tinystyle, without running the checker | 20 / 20 | 142 / 142 | 2 |
| Pico CSS | 11 / 20 | 131 / 142 | 58 |
| daisyUI | 10 / 20 | 130 / 142 | 243 |

The misses for the others were things a reader won't spot in code review: button text below WCAG
contrast in dark mode, an "outline danger" button that came out blue because there was no way to
combine those two, badges with unreadable text, an icon button that wasn't square. The row without
the checker shows that the vocabulary itself carries most of the weight; the checker is the safety
net. (It's a small sample: 10 tasks × 2 runs. The task list is in the eval harness.)

**A real migration.** The contacts page of caley (a calendar and mail app) was moved from Pico CSS
to tinystyle. The page's 494-line `contacts.scss` was deleted, and the page no longer loads Pico or
the shared SCSS. What's left is inline custom properties like `style="--ts-min: 13rem"`. The avatar,
card grid, clickable cards, dropdown checklist, label/value rows, dialogs, navigation rail with
collapse and mobile drawer, and the floating action button all come from the library. A Pico rewrite
of the same page, for comparison, still needed 134 lines of custom CSS. Gaps found during migration
went back into the library and its docs.

**Tests keep the docs honest.** `npm test` asserts that every attribute and value in `vocab.json`
has a CSS selector and every selector has a vocab entry, that every documented token is declared,
and that `llms.txt`, `llms-full.txt` and `html-custom-data.json` are regenerated from `vocab.json`
and not stale. Docs, editor autocomplete and the checker can't drift apart from the CSS.

**Contrast is checked for every hue.** `npm run contrast` sweeps the accent hue 0–360 in light and
dark mode, lets headless Chrome resolve the real tokens, and checks WCAG AA for every text and
background pair (4.5:1 for text and solid buttons, 3:1 for the focus ring). All hues pass at the
default chroma. `npm test` runs the same check for the default look and the two theme examples.

**Visual regression tests.** `npm run visual` screenshots the kitchen sink and the app shell demo in
17 states (light and dark, compact density, phone width, both theme examples, open menu, dialog and
drawer) and compares them pixel by pixel with baselines in `test/visual/`. A change writes a diff
image with the changed pixels in red. Baselines depend on fonts and the Chrome version, so they are
compared on the machine that made them; `npm run visual -- --update` accepts an intended change.

**Size budgets are enforced.** `npm run build` fails above budget.

| File | brotli | What's in it |
|---|---|---|
| `core.css` | 5.4 KB | tokens, reset, type, layout, buttons, forms, dialog, popover, details, table, card, badge, callout, avatar |
| `app.css` | 1.4 KB | app shell, navigation rail (collapsible, drawer on phones), floating action button |
| `menu.css` | 0.9 KB | dropdown menus |
| `icons.css` | 3.0 KB | 56 default [Lucide](https://lucide.dev) icons via `data-icon` |
| `all.css` | 8.6 KB | everything |
| `enhance/customizable-select.css` | 0.9 KB | opt-in: the open `<select>` list styled like a menu (see below) |

## Built for LLMs and coding agents

- **[`llms.txt`](llms.txt)** (~140 lines): rules, every attribute and value, tokens, icons and an
  anti-pattern table ("don't / do"). Enough for small edits.
- **[`llms-full.txt`](llms-full.txt)**: every attribute in detail plus copy-paste recipes: form,
  card, dialog, toolbar, status, settings rows, app shell, dropdown, card grid, label/value pairs,
  page layout. Agents copy recipes instead of inventing markup.
- **Names that don't collide with habits.** No numeric spacing (agents read `4` as Tailwind's 1rem),
  no `.btn-primary`. Values like `secondary outline ghost link` follow shadcn, which models have seen
  a lot.
- **`tinystyle check`** gives the agent a precise, fixable error instead of a silently wrong page.
- **[`tinystyle-inspect`](packages/inspect/README.md)** replaces the screenshot loop. It loads a running
  page in headless Chrome at a wide and a narrow width, in light and dark mode, opens every dialog and
  popover through its real button, and reports horizontal overflow, misplaced overlays, low contrast,
  unlabeled controls and covered click targets as text, with a selector for each. `--sheet` writes
  one contact-sheet image per page when you do want to look.
- **`html-custom-data.json`** gives VS Code (and other editors) autocomplete and hover docs for every
  attribute value.

Point your agent at the docs, for example in `CLAUDE.md` or `AGENTS.md`:

```md
UI uses tinystyle. Read node_modules/@tiaforge-ui/tinystyle/llms.txt before editing markup
(llms-full.txt before building whole pages). Run `npx tinystyle check src` after editing.
```

## Install

```sh
npm install @tiaforge-ui/tinystyle
```

```js
import '@tiaforge-ui/tinystyle/core.css';   // always
import '@tiaforge-ui/tinystyle/app.css';    // app shell, navigation rail, floating action button
import '@tiaforge-ui/tinystyle/menu.css';   // dropdown menus
import '@tiaforge-ui/tinystyle/icons.css';  // the default icon set
// or everything: import '@tiaforge-ui/tinystyle/all.css';
```

Add `<meta name="color-scheme" content="light dark">` to avoid a flash of the wrong theme on load.

### Vite plugin

```js
// vite.config.js
import tinystyle from '@tiaforge-ui/tinystyle/vite';

export default {
  plugins: [
    tinystyle(),
    // every Lucide icon by name, only the used ones emitted, plus your own SVG folder:
    // tinystyle({ icons: { dir: 'src/icons' } })   and   import 'virtual:tinystyle-icons.css';
    // migrating step by step? check only the migrated parts:
    // tinystyle({ paths: ['src/contacts'] })
    // opt-in enhancements, appended to core.css / all.css (see Browser support):
    // tinystyle({ enhance: ['customizable-select'] })   or   enhance: 'all'
  ],
};
```

Icons from the plugin need `lucide-static` installed (optional peer dependency).

### Without a bundler

The files in `dist/` are plain CSS. Link them directly and run `npx tinystyle check` in CI.
Enhancements are separate files: link `dist/enhance/<id>.css` after `core.css`.

## Browser support

Chrome / Edge 123+, Firefox 120+, Safari 17.5+ (Baseline 2024, set by `light-dark()`). No vendor
prefixes and no fallbacks for older browsers; that is part of how it stays small.

Newer features that not every engine has yet are **opt-in enhancements**, one file each, named by
their [web-features](https://github.com/web-platform-dx/web-features) id. Without them everything
still looks finished. Turn them on with the Vite plugin's `enhance` option, or import
`@tiaforge-ui/tinystyle/enhance/<id>.css` after `core.css`.

| Enhancement | What it does | Where it works |
|---|---|---|
| `customizable-select` | `appearance: base-select`: the open list of a single `<select>` gets the menu look, an accent checkmark, styled `optgroup`/`hr`, and rich options via `<selectedcontent>` | Chromium 135+; other browsers keep the native picker |

## More

- [`llms-full.txt`](llms-full.txt): the complete reference (it's written for agents, and it's the
  best human reference too).
- [`kitchen-sink/`](kitchen-sink/): every component, app-like screens, and two alternative themes
  in [`theme-examples.css`](kitchen-sink/theme-examples.css).
- [`SPEC.md`](SPEC.md): design principles and the reasoning behind them.

## License

MIT. The default icons are from [Lucide](https://lucide.dev) (ISC, see `LICENSE-lucide`).

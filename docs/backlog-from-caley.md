# Backlog from the caley contacts migration (2026-11-07)

Three Sonnet agents migrated caley's contacts page (sinter, about 500 lines of SCSS) in separate
worktrees: to tinystyle, to Tailwind v4 + daisyUI 5, and as a fresh Pico rewrite. Each kept a
`MIGRATION-NOTES.md` listing every place its library fell short. This file merges those notes into a
ranked backlog for tinystyle. "Hit by" says which of the three migrations needed custom work for it.

## Results

| | Baseline (Pico) | tinystyle | daisyUI | Pico rewrite |
|---|---|---|---|---|
| Custom CSS for page + nav | 494 + 213 + main.scss 219 | 34 + 50 = **84** | **13** (+ utilities in markup) | 67 + 67 = 134 |
| Class tokens in page + nav markup | 150 | **4** | 509 | 34 |
| CSS shipped to the page (gzip) | ~15.8 KB | **5.9 KB** | 13.1 KB | 13.1 KB |
| Inline `style` attributes | 0 | 4 | 2 | 0 |
| Agent tokens / tool calls / minutes | – | **126k / 32 / 7.2** | 147k / 36 / 10.1 | 134k / 37 / 9.3 |

Notes: daisyUI moved its styling into 509 utility and component classes in the markup, so "13 lines of CSS" is not
comparable 1:1. daisyUI's Vite build failed on daisyUI's own CSS (`@scope (.join)`), and the
workaround drops its `join` focus rules. The Pico rewrite replaced the floating "+" button with a toolbar
button and needed 3 lines of JS for dialog light dismiss, because Pico's modal is a full-screen
overlay. The tinystyle version duplicated the nav partial, because Pico pages still use the old one.
Baseline CSS was measured from the main worktree's last build (6 Nov), so it is approximate.

## Backlog, ranked by savings × frequency

### Core quick wins (small, do first)

1. **`data-layout="grid"` should not stretch lone items.** It uses `auto-fit`, so a group with one card
   stretched across the full width. Switch to `auto-fill` (columns stay at least `--ts-min`, empty
   tracks are kept). Hit by: tinystyle, Pico.
2. **`data-grow`**: boolean on a child of a row or stack (`flex: 1 1 0; min-inline-size: 0`). Use it for search
   fields in toolbars, and for input + select + remove rows. daisyUI needed `w-full` about 30 times for the
   same thing. Hit by: tinystyle, daisyUI.
3. **`data-wrap="none"`** on rows (icon + label in nav items must not wrap). Also document that `row`
   wraps by default. Hit by: tinystyle.
4. **Style `aria-current`** on links and buttons like `aria-pressed` (soft accent fill), so nav items only
   set the ARIA state. daisyUI's `aria-current` style was near-black and needed a `!` override. Hit by: all three.
5. **`dl[data-pairs]` accepts `div` wrappers** around `dt` + `dd` (via `display: contents`), so one
   `data-sn-show` can hide a pair. Hit by: tinystyle.
6. **Dialog/card header and footer through one wrapper.** sinter renders a `for` row as a wrapper
   `div`, so `dialog > header` misses. Also match `dialog > :is(div, form) > header|footer`. Hit by: tinystyle.
7. **Checker: understand bound labels.** TS103 should accept `aria-label` set via `data-sn-attr`,
   Svelte/Vue bindings, and so on. The agent added fake `aria-label="…"` attributes to silence it. Hit by: tinystyle.

### Modules (larger, biggest savings)

8. **`app.css`: app shell + navigation rail.** This was the largest custom block in all three migrations:
   tinystyle 50 lines, Pico rewrite about 100 lines, and daisyUI needed a custom variant on about 12 elements.
   About 6k agent tokens each. It needs:
   - a rail + content shell,
   - a fixed rail with a width token,
   - a collapsed icon-only state, driven by an attribute such as `data-collapsed`, so JS or sinter state can
     control it (daisyUI's drawer needs a hidden checkbox and could not be used),
   - a mobile drawer with a backdrop below a breakpoint,
   - active items via `aria-current`.

   Hit by: all three.
9. **`menu.css`: popover menus and dropdowns anchored to their trigger.** By default a `[popover]` is
   centered in the viewport. tinystyle needed one `position-area` rule. The Pico rewrite needed about 15 lines
   (its most expensive item, about 2k tokens). daisyUI needed inline `anchor-name`/`position-anchor` styles.
   Needs:
   - `[popover][data-menu]` placed under its invoker, using the implicit anchor from `popovertarget`
     (progressive enhancement where anchor positioning is missing),
   - checklist rows,
   - separators.

   Hit by: all three.
10. **`data-avatar`**: a round container for initials or a photo, with `data-size`, colored by tone, and
    `object-fit` for an `img` child. tinystyle and Pico needed 11–14 lines each; daisyUI has it built in. Hit by: tinystyle, Pico.
11. **Clickable card** (`article[data-interactive]` or `data-stretch` on its main button or link): the whole
    card is clickable, inner links stay clickable, with hover border and focus ring. 7–9 lines each, and agents had to
    rediscover the z-order trick. Hit by: all three.
12. **Floating action button**: fixed in the bottom-right corner, round, with a shadow. All three wrote
    custom code or a workaround (daisyUI has `fab`; the Pico rewrite dropped it). Probably part of `app.css`. Hit by: tinystyle, Pico.

### Smaller / documentation

13. **Caption style for small labels** (`dt`, field captions, type chips): small, muted, optionally uppercase.
    daisyUI needed 4 utilities × 6 places; Pico needed a custom rule. Consider `data-caption`.
14. **Docs in `llms.txt`:**
    - that rows wrap,
    - how grid columns behave,
    - how popovers are positioned,
    - that custom properties in `style` (`--ts-min`, `--ts-tone`, `--ts-dialog-width`, …) are the sanctioned way to size things,
    - that `rem` is 16px (Pico scales the root to 125%, so 1:1 copied sizes look smaller after migrating),
    - a recipe for a `<template>`-rendered list (`:first-child` traps).
15. **Migration guide from Pico**: a token map (`--pico-muted-color` → `--ts-text-muted`, …) and a class map
    (`.secondary` → `data-variant="secondary"`, …). The tinystyle agent had to add `var(--ts-x, var(--pico-x))`
    fallbacks to shared Svelte components.

## Already strong (keep)

- **Dialogs.** The tinystyle `<dialog>` is the box itself, so `closedby="any"` light dismiss keeps working. In Pico
  it broke, because Pico's modal is a full-screen overlay.
- **Automatic dark mode.** It needed zero code in tinystyle and daisyUI.
- **Nav items.** They worked with no CSS as `a[role=button]` + `data-variant` toggled by sinter.
- **Size.** The smallest shipped CSS (5.9 KB gzip) and the fewest classes, with the fewest tokens and the
  shortest time spent by the agent.

## Rerun with app.css and menu.css (v2)

The same Sonnet brief, run again from the same baseline after the core fixes and the two modules landed.

| | tinystyle v1 | tinystyle v2 |
|---|---|---|
| Custom CSS (page + nav) | 34 + 50 = 84 lines | **14 + 0** lines (8 of the 14 map `--pico-*` to `--ts-*` for the shared Svelte ShareMenu) |
| Custom classes in markup | 4 | **0** |
| Nav partial | 59 lines | 40 lines |
| Nav script | unchanged nav.ts | nav-ts.ts: 85 → 91 lines, about 20 changed (collapse, drawer, localStorage) |
| CSS shipped to the page (gzip) | 5.9 KB | 6.5 KB (adds app + menu) |
| Agent tokens / tool calls / minutes | 126k / 32 / 7.2 | **107k / 25 / 3.6** |

The rerun found a real bug: modal dialogs sat in the top-left corner, because the reset removed the
browser's `margin: auto`. The kitchen sink only showed a static dialog preview, so it never showed up. Fixed in core.

### New findings (v2)

16. **Rail behavior without script.** *Done (CSS only): the drawer is a native popover (`<nav data-rail popover>` opened by a `popovertarget` button), and collapse is a `data-rail-collapse` checkbox read with `:has()`. Still not possible in CSS: remembering "collapsed" across page loads (render `checked`/`data-collapsed` from the server, or 3 lines of script), and automatic `aria-current`, because no browser supports `:local-link`.* Originally: Collapse toggle, mobile drawer toggle, remembering the collapsed state
    and a mobile top bar (hamburger + brand) still took about 15 lines of TS and 7 of markup. Options:
    - a tiny optional `app.js` (or custom `command="--ts-toggle-rail"` invoker commands),
    - automatic `aria-current` for the rail link that matches `location.pathname`,
    - a documented mobile bar recipe.
17. **Pico coexistence during a gradual migration.** A `pico-compat.css` alias file (`--pico-*` → `--ts-*`)
    for shared components, plus a docs note that one page cannot load both. This cost a second nav partial and an 8-line bridge.
18. **Dropdown caret** for `button[popovertarget]` (the agent wrote a `▾` span).
19. **Dialog close button**: a recipe or default for the header `×` (every dialog repeats it).
20. **Docs**: `data-size` also works on icon buttons; the search field in a toolbar wants `data-grow` (exists, but the agent did not find it). *Done: toolbar recipe uses `data-grow`, and `data-grow` now wraps onto its own line below `--ts-grow-basis` (10rem).*

## Rerun v3 (CSS-only rail)

| | v1 | v2 | v3 |
|---|---|---|---|
| Custom CSS (page + nav) | 84 | 14 | **0** |
| Custom script for the rail | – | ~20 lines | ~8 lines (saving the collapsed state only) |
| Nav markup | 59 | 40 | 25 lines |
| Agent tokens / tool calls / minutes | 126k / 32 / 7.2 | 107k / 25 / 3.6 | 117k / 28 / 6.0 (also verified dialogs, menu, drawer) |

Findings and what happened to them:
- Saving the collapsed state needs script: documented as a 3-line snippet in the app shell recipe.
- Drawer button needed on every page: the recipe puts it in the shared nav partial.
- `data-shell` broke with sinter's custom elements next to the rail: the shell is now flex, so other children take no space.
- Rail links and buttons had different font sizes under compact density, and the user name was not aligned with the icons: fixed in app.css.
- An empty helper element inside a dialog adds a grid gap row: documented (use `hidden`).
- `dialog > div > header` and `data-stretch` on a link button were undocumented: now in the recipes.

Also added after v3 (fewer attributes to write):
- An empty close button in a dialog or card header (`command="close"`, `hide-popover`, `popovertargetaction="hide"`) is drawn as a quiet × icon button; the checker requires an aria-label on it.
- Buttons that open a popover get a dropdown caret (menu.css).
- Vite plugin (`@tiaforge-ui/tinystyle/vite`) runs the checker in every build.

## Rerun v4 (tinystyle-inspect installed, not mentioned in the brief)

| | v3 | v4 |
|---|---|---|
| Custom CSS (page + nav) | 0 | 0 |
| Script | ~8 lines in nav.ts | ~4 lines (collapse) in contacts.ts; nav split into nav-core.ts + nav.ts |
| Inspector findings (errors / warnings) | 3 / 0 (unlabeled form fields) | **0 / 0** |
| Agent tokens / tool calls / minutes | 117k / 28 / 6.0 | 142k / 60 / 7.2 |
| Screenshots taken by the agent | several | ~16 (2 shoot.sh + ~14 of dialogs, menus, narrow views) + 2 inspector runs |

The agent found the inspector through llms.txt rule 10 and used it. Its first run reported 3 unlabeled
controls in the form dialog that the checker and the screenshots had missed. It still took about 16
screenshots, because the inspector reports problems but cannot answer "does it look right". Quality
went up (0 findings), token use went up 21%.

### New findings (v4)

21. **Drawer trigger recipe is wrong.** The fixed-position ☰ from the recipe overlapped the page title. The
    trigger belongs in the page's top row (or a dedicated mobile bar). Fix the recipe.
22. **Icons dominate nav markup.** Seven inline SVGs (the gear alone about 1 KB) were about 4k tokens. Option: an
    optional icon module (CSS mask icons such as `data-icon-name="mail"`) for the 15 or so standard app icons.
23. **Checker false positive.** TS103 flags close or cancel buttons whose text comes from `data-sn-text`
    (empty in source, filled at runtime). The agent added static text only to silence it. Treat
    bound-content attributes (`data-sn-text`, `data-sn-html`) as content.
24. **Narrow form rows.** An input (`data-grow`) + select + remove button row overflowed a phone-width
    dialog until it wrapped. Check the select's intrinsic width in rows.
25. **Static `data-menu` has no background.** It only gets surface, border and shadow as a `[popover]`. The share
    menu (a Svelte component positioned by its own code) looked transparent, so the agent dropped `data-menu`.
26. **FAB with a text "+"** renders small; only an `svg` inside it is enlarged. Give the FAB a larger font size too.

### Inspector improvements found while checking v4

- Tap-target info should use the effective target: a `data-stretch` element's covering pseudo-element, and a
  checkbox's label.
- To cut screenshot loops further: optionally write one contact-sheet image of all states (page, each
  dialog and popover, both widths and schemes) instead of 10–16 separate screenshots.

## Rerun v5 (named icons, contact sheet, short llms.txt; same brief as v4)

| | v4 | v5 |
|---|---|---|
| Custom CSS (page + nav) | 0 | 0 |
| Inline `<svg>` in page + nav | 8 | **0** (18 `data-icon` uses) |
| Nav partial | 5,173 bytes | **2,301 bytes** (−55%) |
| Agent tokens / tool calls / minutes | 142k / 60 / 7.2 | 144k / 50 / 6.6 |
| Used tinystyle-inspect | yes (2 runs) | **no** |
| Screenshots | ~16 | ~30 |
| Inspector findings on the result | 0 / 0 | 0 / 0 after the dialog fix (before it: 1 error, see below) |

Did the changes deliver?
- **Named icons: yes.** No inline SVG left, and the nav markup halved.
- **Contact sheet: not used.** The agent never ran the inspector, so it took about 30 screenshots. v4 used the inspector under the same brief, so adoption is not reliable from llms.txt alone. Added: `tinystyle check` now prints the inspector command when the inspector is installed.
- **Short llms.txt: no visible harm.** Token use was flat (+1%) despite twice the screenshots. Whether it read llms-full.txt is unknown.
- **v4 fixes: held.** Drawer button in the top row, narrow form rows wrap correctly, FAB round.

Found by v5 or by inspecting v5:
- **Dialog content wider than a phone dialog** (92px at 390px): the open dialog is a grid whose column grew to the content. Fixed (`grid-template-columns: minmax(0, 1fr)`). The inspector missed it because the page itself did not overflow; it now reports content wider than its dialog or popover. Found by looking at the contact sheet.
- `icons.css` was missing from the package exports. Fixed.
- The quiet × close button only matched direct children of the header. Fixed (any depth in the header).
- The Vite plugin's `paths` option (check only migrated parts) was undocumented. Now in llms.txt.
- Open: dialogs whose content depends on app state (the detail dialog with no contact selected) render empty in the inspector. A way to run a setup step before opening would help.

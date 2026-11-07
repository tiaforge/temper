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

## Rerun v6 (opener-based inspector, checker hint, all v5 fixes; same brief as v4/v5)

| | v4 | v5 | v6 |
|---|---|---|---|
| Custom CSS (page + nav) | 0 | 0 | 0 |
| Inline `<svg>` | 8 | 0 | 0 |
| Agent tokens / tool calls / minutes | 142k / 60 / 7.2 | 144k / 50 / 6.6 | **126k / 35 / 5.3** |
| Used tinystyle-inspect / contact sheet | yes / – | no / no | **yes / yes** (2 runs) |
| Screenshots | ~16 | ~30 | **11** |
| Inspector findings on the result | 0 / 0 | 1 error before the dialog fix | **0 / 0** |

The changes delivered this time. The checker's hint got the agent to the inspector and the contact
sheet without the brief mentioning them. Its first inspector run found 3 unlabeled controls that the
checker misses. Screenshots dropped from ~30 to 11, and tokens fell 13% against v5. It also added
`tinystyle({ paths })` to the Vite config on its own, so the build checks the migrated parts only.
One run per version, so treat the differences as indications, not measurements.

### New findings (v6)

27. **Collapsed rail header.** The logo link and the collapse toggle sit side by side and do not fit one
    icon's width, so the logo is clipped. Stack them vertically when collapsed. (The "chevron points up"
    report was a mid-transition screenshot; at rest it points right.)
28. **Static label check.** `tinystyle check` could flag inputs and selects with no `<label>`,
    `aria-label`, `aria-labelledby` or `title` as a warning. Today only the inspector catches them
    (3 times now, in v4, v5 and v6).
29. **Per-child alignment.** `data-self="start|center|end|stretch"` on a child of a stack or row. The agent wrapped
    an "add" button in a bare `div` three times to stop it stretching.
30. **Docs:** `[data-rail]` must be a direct child of `[data-shell]`. Say so in the attribute description, and
    give a two-partial recipe for apps migrating page by page.
31. **Share actions inside a menu** (download vCard, mail, system share) still need about 45 lines of
    script. That is app behaviour, not styling; out of scope for tinystyle.

## Mail page (second page, built on v6's contacts migration)

Scope: the mail page, the standalone message view and their shared reader partial. Same model and brief
structure as v6.

| | Pico | tinystyle |
|---|---|---|
| Mail page SCSS | 1,203 lines | 55 |
| Reader SCSS (shared) | 729 lines | 51 (15 of them bridge `--pico-*` for unmigrated Svelte dialogs) |
| Markup (mail + reader + view) | 991 lines | 829 |
| Inline `<svg>` | ~45 | 0 (75 `data-icon`) |
| Custom script (mail islands) | 515 lines | 479 (two custom elements removed; 34 lines remain for the pane resize handle) |
| CSS shipped to the mail page (gzip) | 22.7 KB | 17.6 KB (incl. icons.css imported needlessly next to the plugin's icons) |
| Agent tokens / tool calls / minutes | | 352k / 124 / 24 (about 55 screenshots, plus 7 contact sheets) |
| Inspector on the result | | 3 errors, all in the unmigrated Svelte compose dialog (pre-existing) |

Not migrated: five Svelte dialogs (compose 1,051 lines, thread, thread event, event detail, ICS import)
still use Pico-era scoped CSS through a 15-line variable bridge. Event detail and ICS import are shared
with the calendar page.

Deliberate UI changes: a second rail for the folders (a drawer on phones), one "…" menu per account and
virtual folder instead of three icons, and an icon-only reader toolbar. Sender and recipients sit in
`<details>`, and the unread marker is an accent bar plus bold.

### Findings (mail)

32. **Resizable panes:** `data-resize` on a pane with a keyboard-operable separator writing a width
    variable (optionally persisted). That would replace 34 lines of script and 7 of CSS, about 6–8k tokens.
    It needs script, so it would be an optional behaviour, not CSS.
33. **Nested shells and a second rail** work but are undocumented. A fixed-height shell
    (`data-shell="fixed"`, panes scroll inside the viewport) is missing.
34. **`data-grow` in a column** needs `min-block-size: 0` to shrink. A vertical scroll container
    (`data-scroll="y"`) is missing too.
35. **`pico-compat.css`:** shared Svelte components still read `--pico-*`. The 15-line bridge was written
    for the second time (contacts and mail). Ship it.
36. **List-row buttons:** there is no variant for full-width selectable rows (the message list). Ghost buttons
    tint grey on `aria-current` unless `data-tone="accent"` is set.
37. **`aria-busy`:** on a rail item it hides the label under the spinner; on forms (sinter sets it there)
    it has no style.
38. **Submit buttons ignore `commandfor`/`popovertarget`** (platform behaviour). Document it: use
    `type="button"`, or close the popover in the submit handler.
39. **Icons, fixed:** the checker CLI did not know the plugin's on-demand icons (19 false errors). It now has
    `--lucide` and `--icons <dir>`. The docs now say to import only `virtual:tinystyle-icons.css` with the plugin.
40. **Inspector, fixed:** false positives for dialogs inside panes hidden at a width (now reported as
    not rendered), popovers opened without their button (no position check), and `data-sr-only` text
    (not "clipped").

## Calendar page + the remaining Svelte dialogs (third step, built on the mail step)

The calendar is a Svelte app (not sinter), so this step also tested tinystyle attributes and the checker inside
Svelte components.

| | before | after |
|---|---|---|
| Scoped CSS in calendar components + the 5 dialogs | 1,114 lines | 106 |
| `--pico-*` in CSS loaded by calendar, mail, message view, contacts | bridge + Pico | **0** (bridge deleted) |
| Inspector on calendar, mail, contacts | compose had 3 label errors | **0 errors** (6 warnings: dialogs opened from script) |
| Agent tokens / tool calls / minutes | | 255k / 105 / 20 |

New shared components: `EventChip` (a `data-variant="item"` button; it replaced three copies of the chip
markup) and `Combo` (the autocomplete list that was duplicated in the event form and in compose).
`SelectDropdown` was removed; compose's "From" is now a native `<select>`. On phones the week view is a
day-by-day agenda list.

Still on Pico: the search and settings pages. `ImportDialog` keeps an `<article>` wrapper and its
`.close-btn` for the Pico settings page; on tinystyle pages one rule makes the article transparent.

Mock: the stock mock had no month-grid endpoint (`/api/calendar?month=`), so the agent wrote its own copy.
The mock now has it.

### Findings (calendar)

41. **Fixed-column grids:** `data-layout="grid"` cannot say "exactly 7 columns". Proposed: `--ts-cols`
    (with a narrow-screen fallback). About 30 lines across the week, month and picker grids.
42. **`aria-current="date"`** (today in a calendar) has no styling.
43. **Autocomplete list under an input** (combobox): an anchored, non-popover `data-menu` with
    `aria-selected` styling would replace the 25-line component + 8 lines of CSS, used 6 times.
44. **Event chip:** a `data-variant="item"` with a `--ts-tone` start bar, a compact size and `data-clamp="2"`
    (multi-line truncation). 18 lines today.
45. **`data-truncate` on a grid child** does not work (grid items need `min-inline-size: 0`).
46. **Checker:** it does not flag `data-justify`/`data-align`/`data-gap` without `data-layout`.
47. **Dialogs:**
    - `dialog > article` (Pico-style markup) shows a double card. Treat it as transparent.
    - Document that the open dialog is a grid (a wrapper element loses the gap) and how to let one row fill
      the rest (compose needed 5 rules).
    - A resizable dialog option.
48. **Docs:** a `data-menu` popover can hold arbitrary widgets (the month picker worked as one); say so.

## Search, settings, login: Pico removed from caley (fourth step)

| | before | after |
|---|---|---|
| Search (`SearchPage.svelte`) | 204 lines scoped CSS | 0 |
| Settings (`SettingsForm` 171, `EncryptionSettings` 290, `CreateCalendarDialog` 7, `ImportDialog` 55) | 523 | 9 |
| Login (`LoginPage.svelte`) | 52 | 0 |
| Deleted | `main.scss` (219), `nav.scss` (213), the old nav partial, Pico branches in `nav.ts`, `UiIcon.svelte`, unused `CalendarList.svelte` and `index.ts` | |
| Pico in sources / built output | everywhere | **none** (`@picocss/pico` is only still listed in package.json; needs `npm uninstall`) |
| Inspector, all six pages | | **0 errors** (10 warnings: dialogs opened from script) |
| Agent tokens / tool calls / minutes | | 208k / 72 / 12 |

### Whole migration (contacts, mail, calendar, search, settings, login)

| | Pico | tinystyle |
|---|---|---|
| App CSS (SCSS + scoped styles) | about 4,750 lines | about 210 lines |
| Agent effort for the whole app | | about 940k tokens over four steps |

Also found: the CalDAV account dialog uses the email-account heading ("E-Mail-Konto hinzufügen"). That was
already the case before the migration.

### Findings (settings, search, login)

49. **Regression (fixed in 0ca5e67):** since c0300ec, `dialog > header` and `article > header` were not
    rows. The agent put `data-layout="row"` on 14 headers to compensate; those attributes are now
    redundant. A test now guards the rule.
50. *Done: `role="tablist"`/`role="tab"` are styled (underline on `aria-selected="true"`, `aria-orientation="vertical"` stacks them), no attributes needed.* **Tabs:** there is no tabs primitive (`role="tablist"` / `role="tab"` with `aria-selected`). The agent
    switched `data-variant` between secondary and ghost.
51. *Done: button labels wrap (and break long words) only when the button cannot fit; buttons now have a minimum height instead of a fixed one.* **Long button labels on phones:** buttons never wrap, so a long German label overflows (9 lines of CSS).
    Allow wrapping (`white-space: normal`) for buttons in narrow containers, or add `data-wrap` on buttons.
52. *Done: `data-list` (one bordered box, rows separated by lines, article card styling removed); recipe in llms.txt.* **Bordered list rows:** `article role="listitem"` with 5 attributes, 9 times. A bordered variant of the
    item row, or a `data-list` container that separates its children.
53. *Done: `--ts-measure` is now the content width, `data-divider` draws a line with text, `closedby="any"` is in the dialog docs.* **Smaller items:**
    - `--ts-measure` includes the side padding,
    - a divider with text ("or") is missing,
    - document `closedby="any"` (it replaces backdrop-click handlers; seven of them in caley).

## Checker and build (from a review of the compile step, 2026-11-07)

Done in the same pass: types for computed values (`types/*.d.ts`; sinter's `SinterAttributes`), computed
values reduced to their literals in `tinystyle check`, context rules from vocab.json (TS107–TS109) and
missing module imports (TS110). Still open, in this order:

54. *Done: `--fix` (CLI), fixes on diagnostics, `deprecated` in vocab.json with TS112, types and a test that deprecated names stay styled.* **`tinystyle check --fix` and deprecations.** The checker already computes "did you mean"; apply the
    unambiguous ones (wrong axis `data-variant="danger"` → `data-tone="danger"`, value typos, `data-badge="true"`).
    A closed vocabulary turns every rename into a breaking change, so add `deprecated: { use: … }` entries to
    vocab.json: the checker warns (TS112), `--fix` rewrites, and the types keep accepting the old value until the
    next major. Needed before 1.0, so caley and tia.vision can follow renames mechanically.
55. *Done: TS204–TS208 in CSS files, `<style>` blocks and `style` attributes; `tinystyle-ignore` comments. On caley's migrated frontend: one finding (a 0.25rem gap).* **Lint app CSS against the library's rules (warnings).** caley went from about 4,750 lines of app CSS to
    about 210; keep it from growing back: `margin` on children of `[data-layout]` (or on anything, outside
    `@layer`), raw colors and `px` spacing where a token exists (`#666` → `var(--ts-text-muted)`,
    `padding: 16px` → `data-pad="md"`), `!important`, and rules that restyle tinystyle selectors
    (`[data-variant=…]`) instead of setting tokens. checkStyles already parses `--ts-*`; this needs a small
    declaration scanner, still no dependency.
56. **Ship only the CSS a project uses (lowest priority).** The Vite plugin knows every static value in use,
    so it could drop unused rules (most of `data-cols`, unused tones and variants, icons it already handles).
    Core is about 5.4 KB brotli, so the saving is small, and it is only safe when computed values are fully
    known: with the types (or the checker's literal analysis) a value outside the literals is a type error, but plain JS
    projects can still build one at runtime. Do it only behind an option, and keep anything referenced by an
    unknown computed value.

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

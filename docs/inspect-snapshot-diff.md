# temper-inspect: layout snapshot and diff (planned, not built)

This is the next step for `@tiaforge-ui/temper-inspect` after the runtime, stylesheet and geometry checks. It
is written down so it can be picked up later; nothing here exists yet.

## Why

The inspector reports problems. It cannot answer the question an agent asks after every edit: "what did my
change do to the page, and what else did it touch?" Today the only answer is to look at screenshots. The
migration runs in [backlog-from-caley.md](backlog-from-caley.md) show the cost: with the inspector and the
contact sheet in use, one page still took 11 screenshots, and the mail page about 55 plus 7 contact sheets.

A check finds what is wrong by a rule. A diff finds what changed, whether or not any rule covers it: a heading
that moved 12px, a card that got narrower at 390px, a color that changed in dark mode only. Most side effects
of a CSS edit are of this kind. They are not errors, so no check will ever report them, and they are exactly
what the screenshots are taken for.

## What it does

Two options on the existing command:

```sh
npx temper-inspect http://localhost:5173/contacts/ --snapshot .temper/before   # before the edit
npx temper-inspect http://localhost:5173/contacts/ --diff .temper/before       # after it
```

`--snapshot <dir>` writes, per page, one JSON file with every visible element of every state (the page, each
dialog, each popover) at every width and scheme: its rectangle, a short list of computed styles, the start of
its text, and its source line when the page carries `data-tm-src`.

`--diff <dir>` runs the same pass and prints what differs from the saved snapshot, as text:

```
http://localhost:5173/contacts/
  page
    moved    nav#rail                          y 0 → 12                      [390 light, 390 dark]
    resized  #list article.card (×24)          width 320 → 288               [390 light, 390 dark]
    restyled main h2 "Contacts"                color #111111 → #333333       [1280 dark, 390 dark]
    restyled #list button "Add"                font-size 14px → 16px
    appeared #list p.hint "No contacts yet"
    gone     #list footer
  dialog dialog#detail
    no changes

6 changes in 1 of 3 states
```

The agent knows what it meant to change, reads that line as confirmation, and reads every other line as a
side effect. No change at a width or in a state is also an answer, and one that screenshots give only after
comparing them by eye.

The diff does not change the exit code (a change is not an error) unless `--diff-fail` is given, for use as a
regression gate in CI.

## What a snapshot holds

Per element, for each state × width × scheme:

| Field | Notes |
|---|---|
| key | how the element is found again in the next run (see "Identity") |
| rect | x, y, width, height, rounded to whole px, in page coordinates |
| styles | color, background-color, font-family (first), font-size, font-weight, line-height, border widths and colors, border-radius, opacity, display, position |
| text | the first 40 characters of its own text |
| src | `file:line` from `data-tm-src`, when present |

The property list is short on purpose: a diff of every computed property is unreadable. It can grow by
option (`--snapshot-props`).

Source of the data: the in-page audit already walks the visible elements of each state (`all()` in
`lib/audit.js`) and describes them (`sel()`), so a first version adds one function there and works in the
Vite plugin too. `DOMSnapshot.captureSnapshot` over the DevTools protocol returns rectangles, a chosen set of
computed styles, text boxes and paint order for the whole document in one call; it is the faster option for
large pages and the one to move to if the in-page walk is too slow, at the price of working in the CLI only.

## The parts that need thought

1. **Identity.** Matching an element in the new run to the same element in the old one is the hard part. An
   id or `data-testid` is stable. `data-tm-src` is stable until lines above it are added. A structural path
   (`main > section:nth-of-type(2) > h2`) breaks when a sibling is inserted. Plan: match by id or test id
   first, then by structural path, then pair the leftovers by tag, text and parent; what stays unpaired is
   `appeared` or `gone`. The quality of the diff depends on this step more than on anything else, so it gets
   its own tests with insertions, removals and reorderings.
2. **Reflow.** Insert one element at the top and everything below it moves. Reporting 300 moved elements is
   useless. Compare each element's offset to its parent, not to the page, so only the element whose relation
   to its parent changed is reported, with one summary line ("everything after `#banner` is 48px lower").
   Repeated siblings with the same change fold into one line with a count, as in the example above.
3. **Noise.** Sub-pixel layout, text that changes between runs (times, random demo data), animations that
   have not ended. A 1px tolerance, the settle step the runtime checks add, and an opt-out attribute
   (`data-tm-inspect-ignore`) for regions with live content. Text changes are reported as one line per
   element and can be turned off.
4. **Size.** A page with 1,500 visible elements, 4 passes and 6 states is about 36,000 records. Store each
   element once and list only the passes where it differs from the first; write the file compressed
   (`node:zlib`).
5. **Baselines across machines.** Rectangles depend on fonts and the Chrome version, as the pixel baselines
   in `test/visual/` do. A snapshot is for comparing two runs on one machine a few minutes apart. Committing
   snapshots as long-lived baselines is possible but not the goal.

## What comes with it

- **`--describe`**: the same data printed as an outline of the page (boxes with position and size, type size
  and weight, colors, in reading order). It gives an agent a text picture of a page it has not seen, and is a
  day of work once the snapshot exists.
- **Findings baseline**: the same before/after idea for findings ("fixed 3, new 1" against the previous run),
  which needs stable finding keys and nothing else.

## How it relates to the pixel comparison

`scripts/visual.mjs` compares screenshots of the kitchen sink pixel by pixel. That answers "did anything
change here" and catches what geometry cannot see: images, gradients, shadows, how glyphs render. The
snapshot diff answers "what changed and by how much" in words, and is blind to those. They complement each
other. A later step could run the pixel comparison only on the regions where the snapshot diff found nothing,
and report "pixels changed in `#hero` although layout and styles did not" as the one case that still needs a
look at the image.

## Not in scope

Judging whether a change is an improvement. The diff says what moved; whether it looks right stays a call
for a person or for a model looking at the contact sheet.

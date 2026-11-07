# @tiaforge-ui/tinystyle-inspect

A text-only layout and accessibility report for a running page, built for coding agents: one command
instead of a screenshot loop. It works on any page, with or without tinystyle.

```sh
npx tinystyle-inspect http://localhost:5173/contacts/
```

For each URL, it:
- loads the page in headless Chrome or Chromium at each width (default 1280 and 390) and in light and dark mode,
- opens every `<dialog>` and every closed `[popover]` in turn, the way a user does: by clicking a visible
  button that opens it (`commandfor` + `command="show-modal"`, `popovertarget`), so the app sets its state
  first (for example, which contact a detail dialog shows). If that button sits inside another closed
  dialog or popover, that one is opened first. Only when no button opens it is the overlay opened
  directly; the report then says so, and warns if it looks empty (its content probably depends on app
  state),
- reports problems as plain text, with a selector for each element.

| Check | Severity |
|---|---|
| Horizontal overflow (the outermost element that makes the page scroll sideways) | error |
| Dialog or popover stuck in the top-left corner, or extending outside the viewport | error |
| Text contrast below WCAG AA (4.5:1, or 3:1 for large text) | error below 3:1, otherwise warning |
| Control without an accessible name; image without `alt` | error |
| Field with only a placeholder | warning |
| Control whose center is covered by another element (clicks go elsewhere) | warning |
| Text cut off without an ellipsis | warning |
| Rows that wrapped; tap targets under 24×24 on narrow screens | info (`--verbose`) |

Findings are merged across widths and schemes, and capped per check (`--limit`). The exit code is 1 when
there are errors. `--json` prints machine-readable output.

`--sheet <dir>` also writes a contact sheet per page: one PNG with a row per state (the page, each dialog,
each popover) and a column per width and scheme, at most 3 states per image. Looking at one sheet
replaces a dozen separate screenshots when you also need to judge how it looks.

It needs no npm dependencies. It drives an installed Chrome or Chromium over the DevTools protocol,
using Node's built-in WebSocket (Node 22+). It finds the browser through `CHROME_PATH`, `--browser`,
common binary names, or Flatpak (`com.google.Chrome`, `org.chromium.Chromium`). Point it at your dev
server, so the page has its real data. Clicking openers runs the page's own handlers, so use dev or
mock data, not a production backend.

# @tiaforge-ui/tinystyle-inspect

A text-only layout and accessibility report for a running page, built for coding agents: one command
instead of a screenshot loop. It works on any page, with or without tinystyle.

```sh
npx tinystyle-inspect http://localhost:5173/contacts/
```

For each URL, it:
- loads the page in headless Chrome or Chromium at each width (default 1280 and 390) and in light and dark mode,
- opens every `<dialog>` and every closed `[popover]` in turn (through its `popovertarget` button when there is one),
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

It needs no npm dependencies. It drives an installed Chrome or Chromium over the DevTools protocol,
using Node's built-in WebSocket (Node 22+). It finds the browser through `CHROME_PATH`, `--browser`,
common binary names, or Flatpak (`com.google.Chrome`, `org.chromium.Chromium`). Point it at your dev
server, so the page has its real data.

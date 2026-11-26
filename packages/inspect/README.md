# @tiaforge-ui/temper-inspect

A text-only layout and accessibility report for a running page, built for coding agents: one command
instead of a screenshot loop. It works on any page, with or without temper.

```sh
npx temper-inspect http://localhost:5173/contacts/
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

Layout and accessibility:

| Check | Code | Severity |
|---|---|---|
| Horizontal overflow (the outermost element that makes the page scroll sideways) | `overflow` | error |
| Dialog or popover stuck in the top-left corner, or extending outside the viewport | `position` | error |
| Text contrast below WCAG AA (4.5:1, or 3:1 for large text) | `contrast` | error below 3:1, otherwise warning |
| Control without an accessible name; image without `alt` | `label`, `alt` | error |
| Field with only a placeholder | `label` | warning |
| Control whose center is covered by another element (clicks go elsewhere) | `covered` | warning |
| Text cut off without an ellipsis | `clipped` | warning |
| Text painted over other text (a fixed height with content that grew, a negative margin, a line-height far below the font size) | `overlap` | warning |
| Content poking out of a box that has a border, a background or a shadow (a long word or URL, a child wider than its parent) | `spill` | warning |
| Text squeezed into a sliver by the layout: a flex or grid item, a table cell or a positioned box whose words stand one per line or break mid-word. The message says what squeezes it | `squeezed` | warning |
| Image stretched: its box has another shape than the image and `object-fit` is `fill` | `distorted` | warning |
| Raster image shown at 1.5× its natural size or more | `upscaled` | info (`--verbose`) |
| Rows that wrapped; tap targets under 24×24 on narrow screens | `wrapped`, `target` | info (`--verbose`) |

The page's health (is what was measured the real page?):

| Check | Code | Severity |
|---|---|---|
| Uncaught exception or unhandled promise rejection, with file and line | `exception` | error |
| `console.error`, and errors the browser logs itself (a CSP violation) | `console` | warning |
| Request that failed or answered 400 or more | `request` | error for the page, stylesheets, scripts and fonts; warning for the rest |
| Image that did not load; web font that failed to load | `image`, `font` | error; warning |
| Quirks mode (no `<!doctype html>`) | `doctype` | error |
| No viewport meta tag with `width=device-width`; zooming switched off | `viewport`, `zoom` | error; warning |
| `<html>` without `lang`; no `<title>` | `lang`, `title` | warning |
| An id on more than one element | `id` | error when something refers to it, otherwise warning |
| A reference to an id that is not there, or to an element that cannot be its target (`for`, `commandfor`, `popovertarget`, `aria-labelledby`, `list`, `form`; other `aria-*` references, `headers`, `href="#…"`) | `ref` | error for the first group, warning for the second |
| A button that does not do what its attributes say: `popovertarget` on a submit button in a form (it submits), `commandfor` without `type` in a form (Chrome does nothing). As info: a form with two or more buttons without `type`, each of which submits it | `submit` | error; info (`--verbose`) |
| Layout shift while the page loads, with the elements that moved most | `shift` | warning above 0.1, info above 0.01 |
| Animation still running when the page is checked (finite ones get 2 s to end first) | `settle` | info (`--verbose`) |

The page's own CSS (not stylesheets from other origins or `node_modules`):

| Check | Code | Severity |
|---|---|---|
| A declaration the browser dropped, in a stylesheet or a `style` attribute: an unknown property or an invalid value. The message gives the fix it could confirm (`align-item` → `align-items`, `display: flexbox` → `flex`, `margin: 10` → `10px`) and file and line | `css` | error; warning for a property Chrome does not know and that is near no known one (it may be another browser's) |
| `var(--name)` without a fallback where `--name` is defined nowhere, with the nearest defined names (`--tm-color-primary` → `--tm-primary`) | `var` | error; info when no element matches the rule, or when the name is defined but not for these elements |

Not reported as dropped declarations: vendor prefixes, declarations inside `@supports`, and a rejected
declaration next to an accepted one for the same property (a fallback pair).

A dev server such as Vite serves CSS transformed (imports inlined, a preprocessor's output), so a line in what
the browser received is not a line of your file. For such a page the declaration is looked up in the file
under the directory the command runs in; run it from the project's root to get `(src/app.css:12)`. Without a
unique match the finding names the file alone. `--json` carries the declaration as `decl` (file, prop, value).

`exception`, `console` and `request` come from the DevTools side and exist only in this command. All other
checks also run in the Vite plugin's `inspect` option, in your own browser tab.

Findings are merged across widths and schemes, and capped per check (`--limit`). The exit code is 1 when
there are errors. `--json` prints machine-readable output.

`--sheet <dir>` also writes a contact sheet per page: one PNG with a row per state (the page, each dialog,
each popover) and a column per width and scheme, at most 3 states per image. Looking at one sheet
replaces a dozen separate screenshots when you also need to judge how it looks. The sheet is scaled down
(a 1280px page shows at 480px), too small to read text or check an icon, so every state is also written
at full size (1 CSS pixel = 1 pixel) to `<dir>/<page>/<state>-<width>-<scheme>.png`, for example
`contacts/01-dialog-dialog-detail-390-dark.png`; `--json` lists them under `shots`.

Scrollbars are hidden and take no space, as on phones and macOS, and so does a reserved scrollbar gutter
(`scrollbar-gutter: stable`, which temper's scroll lock sets on the page while a modal dialog is open): the page
and its dialogs are checked and shot at the full width.

Pages behind a login: pass the session cookie with `--cookie name=value` (set for each page's origin
before it loads) or a token with `--header "Authorization: Bearer …"` (sent with every request, also to
other origins). Both can be repeated. Get the cookie from your dev login, for example
`curl -c - -d 'user=demo&password=demo' http://localhost:3000/login`; temper-inspect does not log in itself.

It needs no npm dependencies. It drives an installed Chrome or Chromium over the DevTools protocol,
using Node's built-in WebSocket (Node 22+). It finds the browser through `CHROME_PATH`, `--browser`,
common binary names, or Flatpak (`com.google.Chrome`, `org.chromium.Chromium`). Each run uses a fresh,
throwaway profile that is removed afterwards; with a Flatpak browser the profile directory and the
directories of `file://` pages are shared into the sandbox, since its `/tmp` is not the host's. Point it at your dev
server, so the page has its real data. Clicking openers runs the page's own handlers, so use dev or
mock data, not a production backend.

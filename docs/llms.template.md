# temper

> CSS library for plain, semantic HTML. Elements look finished without classes. Variants are
> `data-tm-*` attributes with fixed values. Light and dark mode switch automatically.

<!-- short -->
This is the short version: enough for small edits. Before building whole pages or migrating, read
`llms-full.txt` in the same folder: every attribute in detail, all tokens, and copy-paste recipes
(form, card, dialog, toolbar, status, settings rows, app shell, dropdown, card grid, label/value pairs).

<!-- /short -->
## Setup

```js
import '@tiaforge-ui/temper/core.css';   // always
import '@tiaforge-ui/temper/app.css';    // app shell, navigation rail, floating action button
import '@tiaforge-ui/temper/menu.css';   // dropdown menus
import '@tiaforge-ui/temper/feedback.css'; // toasts, tooltips
import '@tiaforge-ui/temper/table.css';  // data tables: sortable headers, selection, number columns
import '@tiaforge-ui/temper/prose.css';  // data-tm-prose: articles, Markdown, mail bodies
import '@tiaforge-ui/temper/forms.css';  // data-tm-field (icon, unit, button in a field), range, read-only, required *, loading bar
import '@tiaforge-ui/temper/sheet.css';  // data-tm-sheet: a dialog as a side panel or bottom sheet
import '@tiaforge-ui/temper/expressive.css'; // surfaces, display type, hero and bento, seeded colour (opt-in voice)
import '@tiaforge-ui/temper/icons.css';  // the default icon set (see Icons)
<!-- full -->
import '@tiaforge-ui/temper/drag.css';   // data-tm-handle: drag handles (sortable lists, boards)
import '@tiaforge-ui/temper/pico-compat.css'; // only while components written for Pico (reading --pico-*) remain
<!-- /full -->
// or everything: import '@tiaforge-ui/temper/all.css';
```

```js
// vite.config.js: runs temper check in every build (errors fail the build, the dev server warns)
import temper from '@tiaforge-ui/temper/vite';
export default { plugins: [temper()] };
// with icons: every Lucide icon by name (only the used ones are emitted) plus your own SVG folder
// export default { plugins: [temper({ icons: { dir: 'src/icons' } })] };  and  import 'virtual:temper-icons.css'; (or @import it from CSS)
// (then do not also import icons.css; the CLI equivalent is: npx temper check --lucide --icons src/icons <paths>)
<!-- full -->
// computed names: data-tm-icon={dark ? 'sun' : 'moon'} emits both; names the source does not show (data-tm-icon={item.icon})
// get a notice with file and line: list them in temper({ icons: { include: ['rocket', 'star'] } })
<!-- /full -->
// while migrating step by step, check only the migrated parts: temper({ paths: ['src/contacts', 'contacts'] })
// opt-in enhancements (newer CSS, fine to leave off): temper({ enhance: ['customizable-select'] }) or enhance: 'all'
// smaller builds: temper({ prune: true }) drops rules for attributes and values the project never uses
<!-- full -->
// markup from a package (a component library) is not scanned unless named: with lib = 'node_modules/<pkg>/<components dir>',
// temper({ paths: ['src', lib], prune: { paths: ['src', lib] } }) checks it, emits its icons and keeps its attributes
<!-- /full -->
// without the plugin: import '@tiaforge-ui/temper/enhance/customizable-select.css' after core.css
```

<!-- full -->
Types for computed values (`data-tm-tone={failed ? 'danger' : 'success'}`), checked by your framework's
type checker: reference one file once, e.g. in `src/env.d.ts`:
`/// <reference types="@tiaforge-ui/temper/react" />` (also `vue`, `astro`, `svelte`). For sinter,
add `import type {} from '@tiaforge-ui/temper/sinter';` to the sinter types module. svelte-check does
not type attributes written on elements; `temper check` checks those expressions itself.
<!-- /full -->

## Rules

1. Write semantic HTML first. `button`, `input`, `select`, `textarea`, `label`, `fieldset`, `dialog`,
   `[popover]`, `details`, `table`, `article` (card), `dl`, `progress`, `meter`, `code`, `kbd` are styled
   without any attributes.
2. Use HTML and ARIA state, not attributes of your own: `disabled`, `aria-busy="true"` (spinner, shown after 200ms),
   `aria-invalid="true"` (error border), `aria-pressed="true"` (toggled), `aria-current`,
   `aria-selected="true"` (the selected `role="tab"`; see Tabs).
3. Variants are the `data-tm-*` attributes listed below, with exactly the listed values. Each attribute
   is one independent axis: `data-tm-variant` is the style, `data-tm-tone` is the color, `data-tm-size` is the
   size. Do not invent classes or values for these.
4. **Spacing:** nothing has an outer margin (only `data-tm-prose` text has). The parent owns all space: `data-tm-gap` between its
   children (needs `data-tm-layout`), `data-tm-pad` around them. Do not write `margin` or `padding` in
   `style` attributes. To add space between two things, wrap them in a `data-tm-layout` element.
   `data-tm-layout` overrides an element's own display, so `<label data-tm-layout="row">` is a real row.
   `data-tm-grow` on one child makes it take the remaining space (search fields, inputs next to a button).
5. Sizes always use the same words: `xs sm md lg xl`. There are no numeric scales.
6. Your own CSS always wins over temper (temper lives in `@layer tm.*`). Never use `!important`.
   In your own CSS, use the tokens (`var(--tm-text-muted)`, `var(--tm-space-sm)`), never hard-coded colors.
7. Use `class` only for your app's own components. `data-tm-*` is temper's: only the names below (others are
   errors). Every other `data-*` name is yours. Always write the prefix (`--fix` adds a missing one).
8. Navigations within the site cross-fade (view transitions). To turn that off, add
   `@view-transition { navigation: none; }` to your CSS; do not add your own `@view-transition` otherwise.
9. Size and tune things with the documented custom properties in `style` (`style="--tm-min: 12rem"`,
   `style="--tm-tone: #e8590c"`, `style="--tm-avatar-size: 4rem"`). That is the intended way; do not
   write `width`, `margin` or `padding` there.
10. Run `npx temper check <dir>` (`--fix` applies the safe fixes) after editing (or use the Vite plugin, which runs it in every build).
   It reports bad values, misplaced attributes, missing module imports and
   unlabeled buttons. For "no attribute" use `null`, not `false`: `cond ? 'x' : null`.
11. To see the result, prefer `npx temper-inspect <dev-server-url>` (package
    `@tiaforge-ui/temper-inspect`, if installed) over screenshots. It opens every dialog and popover
    at a wide and a narrow width, in light and dark mode, and reports as text: overflow, misplaced overlays,
    contrast, unlabeled controls, overlapping text, script errors, failed requests and CSS the browser
    dropped. To judge how it looks, add
    `--sheet <dir>`: one small image per page with every state at every width and scheme, plus each
    state at full size in `<dir>/<page>/` for details.

## Attributes

{{attributes}}

## Tokens

Set inputs on `:root` in your own CSS to change the theme. Use the rest in your own CSS.

{{tokens}}

## Icons

```html
<span data-tm-icon="mail"></span>                                        <!-- an icon, 1.125em, in the text color -->
<button data-tm-icon="pencil">Edit</button>                              <!-- icon before the text -->
<button data-tm-icon="x" data-tm-variant="ghost" aria-label="Close"></button>  <!-- empty: square icon-only button, needs aria-label -->
<a href="/mail/" data-tm-icon="mail"><span>Mail</span></a>               <!-- rail items, links -->
```

Names are Lucide's (https://lucide.dev/icons). icons.css contains: {{iconNames}}. With the Vite plugin's `icons` option every Lucide name works, and only the icons you
use end up in the CSS. Do not paste inline `<svg>` for an icon that has a name.

<!-- full -->
The plugin finds the names in your markup: static ones and every literal an expression can produce
(`data-tm-icon={dark ? 'sunrise' : 'moon-star'}` emits both). A name it cannot see, such as
`data-tm-icon={item.icon}` from a data array or a component prop, is not emitted and would render blank, so the
plugin prints a notice with the file and line (it does not fail the build). List those names in
`include`, then add a `temper-ignore` comment on that line to silence the notice:

```js
temper({ icons: { include: ['rocket', 'star', 'zap'] } })
```

Your own icons: put SVG files in the plugin's `icons.dir` (file name = icon name; it replaces a default
of the same name), or without the plugin:

```css
:root { --tm-icon-mail: url(/icons/mail.svg); }            /* replace a default icon */
:root { --tm-icon-rocket: url(/icons/rocket.svg); }         /* add one */
[data-tm-icon="rocket"] { --_icon: var(--tm-icon-rocket); }
```

`--tm-icon-<name>` is an input only: temper's own icons are not declared as properties, so reading
`var(--tm-icon-mail)` in your CSS gives nothing unless you set it. Use `data-tm-icon` to draw a default icon.

<!-- /full -->
Icons are one color (the text color); keep multicolor logos as `<img>`.

<!-- full -->
## Recipes

### Form

```html
<form data-tm-layout="stack" data-tm-gap="md">
  <label>Name <input name="name" required></label>
  <div data-tm-layout="grid" data-tm-gap="sm" style="--tm-min: 10rem">
    <label>Start <input type="date"></label>
    <label>Time <input type="time"></label>
  </div>
  <label>Calendar <select><option>Work</option></select></label>
  <label><input type="checkbox" role="switch"> All day</label>
  <label>Email
    <input type="email" aria-invalid="true">
    <small data-tm-tone="danger">Enter a full address, like name@example.com.</small>
  </label>
  <div data-tm-layout="row" data-tm-gap="sm" data-tm-justify="end">
    <button type="button" data-tm-variant="ghost">Cancel</button>
    <button>Save</button>
  </div>
</form>
```

### Card

```html
<article data-tm-layout="stack" data-tm-gap="sm">
  <header><h3>Title</h3><button data-tm-icon="x" data-tm-variant="ghost" aria-label="Close"></button></header>
  <p>Body text.</p>
  <footer><button data-tm-variant="secondary">Edit</button></footer>
</article>
```

`article > header` puts its children in a row with space between. `article > footer` aligns its
buttons to the end.

An `img`, `picture` or `video` as the card's first child runs edge to edge under its rounded top corners (also with
`data-tm-pad` on the card, and in a clickable card); everything after it keeps the padding. Nothing to add:

```html
<article data-tm-layout="stack" data-tm-gap="sm">
  <img src="cabin.jpg" alt="A cabin by the lake" width="640" height="360">
  <h3>Lake cabin</h3>
  <p data-tm-muted>Sleeps four.</p>
</article>
```

Only the first child bleeds; an image elsewhere in the card (or inside a link) stays inside the padding.

### Dialog

```html
<button commandfor="confirm" command="show-modal" data-tm-tone="danger">Delete…</button>
<dialog id="confirm">
  <header>
    <h2>Delete “Team retro”?</h2>
    <button commandfor="confirm" command="close" aria-label="Close"></button>
  </header>
  <p>This sends a cancellation to all guests.</p>
  <footer>
    <button commandfor="confirm" command="close" data-tm-variant="ghost">Keep</button>
    <button data-tm-tone="danger">Delete event</button>
  </footer>
</dialog>
```

The open dialog is a grid with a gap between its direct children, so content inside a wrapper element
loses that gap. A dialog taller than the screen scrolls between its header and footer, which stay in view
(also through one `form`, `div` or `article` wrapper); the page behind a modal dialog does not scroll. To let
one part fill the remaining height instead (a message body, a long list), give the dialog
`data-tm-layout="stack"` and that part `data-tm-grow data-tm-scroll="y"`: the dialog grows with that part's content up to the
screen's height, and the part scrolls from there. With a wrapper around header, content and footer (`dialog > form`),
give the wrapper `data-tm-layout="stack"` instead of the dialog; it is the stack that holds the header or footer, so
hidden helpers, templates and custom elements beside it do not matter (a content stack between the dialog's own header
and footer stays content). Pico-style `dialog > article` markup works too: the article adds no box of its own.

Add `closedby="any"` to close the dialog on a click outside it or on Esc, with no script (no backdrop
click handlers).

An empty close button in the header (`command="close"`, `command="hide-popover"` or
`popovertargetaction="hide"`) is drawn as a quiet × icon button; give it an `aria-label`. Header and
footer also work through one wrapper (`dialog > form > footer`, a template-rendered `div`). The open
dialog is a grid with a gap between its children, so an empty helper element inside it adds an empty
row: give such elements the `hidden` attribute.

### Toolbar

```html
<div data-tm-layout="row" data-tm-gap="sm">
  <h2>Contacts</h2>
  <input type="search" data-tm-grow placeholder="Search" aria-label="Search">
  <button data-tm-icon="plus" data-tm-variant="ghost" aria-label="Add contact"></button>
</div>
```

`data-tm-grow` makes the search field fill the space between the heading and the button. A button whose
label does not fit (a long translation on a phone) wraps the label onto two lines; nothing to add. For a fixed
width instead, leave `data-tm-grow` out and add `data-tm-justify="between"` to the row.

### Button groups

```html
<div data-tm-join role="group" aria-label="Message">               <!-- toolbar group -->
  <button data-tm-variant="outline" data-tm-icon="archive" aria-label="Archive"></button>
  <button data-tm-variant="outline" data-tm-icon="folder" aria-label="Move"></button>
  <button data-tm-variant="outline" data-tm-icon="trash-2" aria-label="Delete"></button>
</div>
<div data-tm-join>                                                 <!-- split button -->
  <button>Send</button>
  <button popovertarget="send-menu" data-tm-icon="chevron-down" aria-label="More send options"></button>
</div>
<div popover id="send-menu" data-tm-menu><button>Send later</button></div>
<nav aria-label="Pages"><div data-tm-join>                         <!-- pager -->
  <a href="?p=1" role="button" data-tm-variant="outline" data-tm-icon="chevron-left" aria-label="Previous page"></a>
  <a href="?p=3" role="button" data-tm-variant="outline" data-tm-icon="chevron-right" aria-label="Next page"></a>
</div></nav>
<form role="search" data-tm-join data-tm-grow>                         <!-- field + button -->
  <input type="search" data-tm-grow aria-label="Search">
  <button>Search</button>
</form>
```

`data-tm-join` draws its children as one unit: shared borders, rounded only at the ends, mirrored in RTL. It works for
every variant (all children usually share one), with `data-tm-size` on the group and in both densities; a focused child
keeps its whole ring. A `select` or a `data-tm-field` (forms.css) can be part of it. For toggle groups where exactly one
option is chosen, use `data-tm-segmented` instead. Do not put `data-tm-layout` or `data-tm-gap` on the group.

### Status

```html
<span data-tm-badge data-tm-tone="success">Synced</span>
<span data-tm-badge style="--tm-tone: #e8590c">Custom color</span>
<div data-tm-callout data-tm-tone="warning" role="status"><strong>Password expires soon</strong>Update it before 1 December.</div>
<button aria-busy="true">Saving</button>
```

### Settings rows

```html
<div data-tm-layout="stack" data-tm-gap="none" data-tm-density="compact">
  <label data-tm-layout="row" data-tm-justify="between" data-tm-pad="sm">Email notifications <input type="checkbox" role="switch"></label>
  <label data-tm-layout="row" data-tm-justify="between" data-tm-pad="sm">Show week numbers <input type="checkbox" role="switch"></label>
</div>
```

### Bordered list

```html
<ul data-tm-list>
  <li data-tm-layout="row" data-tm-justify="between">
    <span data-tm-grow>Firefox on Linux <span data-tm-badge data-tm-tone="accent">This browser</span></span>
    <button data-tm-icon="trash-2" data-tm-variant="ghost" data-tm-size="sm" data-tm-tone="danger" aria-label="Remove"></button>
  </li>
  <li data-tm-layout="row" data-tm-justify="between">…</li>
</ul>
```

`data-tm-list` draws one box with a line between rows and pads each row. `data-tm-grow` on the label keeps
the button at the end of the row on narrow screens. Do not build the same from bordered `article`s
with `data-tm-pad`.

### Tabs

```html
<div role="tablist" aria-label="Settings">
  <button role="tab" aria-selected="true" aria-controls="general">General</button>
  <button role="tab" aria-selected="false" aria-controls="encryption">Encryption</button>
</div>
<section role="tabpanel" id="general">…</section>
<section role="tabpanel" id="encryption" hidden>…</section>
```

No `data-tm-variant` on tabs: the selected one (`aria-selected="true"`) is underlined. Your script switches
`aria-selected` and `hidden`. `aria-orientation="vertical"` on the tablist stacks the tabs.

### Segmented control

```html
<div role="radiogroup" data-tm-segmented data-tm-size="sm" aria-label="View">
  <label><input type="radio" name="view" value="week" checked>Week</label>
  <label><input type="radio" name="view" value="month">Month</label>
</div>
```

A radio group for a view switch (a few short options, one always chosen). The checked label is a raised
chip; keep the `input` inside its `label`. For panels that show and hide use tabs instead.

### Divider with text

```html
<button data-tm-variant="secondary">Sign in with a passkey</button>
<p data-tm-divider>or</p>
```

### App shell with navigation rail (app.css)

```html
<body data-tm-shell>
  <nav data-tm-rail popover id="rail" aria-label="Main">
    <header>
      <span data-tm-rail-label>Caley</span>
      <input type="checkbox" data-tm-rail-collapse aria-label="Collapse menu">
    </header>
    <a href="/mail/" data-tm-icon="mail"><span>Mail</span><span data-tm-badge data-tm-tone="accent">12</span></a>
    <a href="/contacts/" data-tm-icon="users" aria-current="page"><span>Contacts</span></a>
    <footer>
      <span data-tm-caption data-tm-rail-label>Tia Heinrich</span>
      <a href="/settings/" data-tm-icon="settings"><span>Settings</span></a>
    </footer>
  </nav>
  <main data-tm-layout="stack" data-tm-gap="lg" data-tm-pad="lg">
    <div data-tm-layout="row" data-tm-gap="sm">
      <button popovertarget="rail" data-tm-show="narrow" data-tm-icon="menu" data-tm-variant="ghost" aria-label="Open menu"></button>
      <h1>Contacts</h1>
      …
    </div>
    …
  </main>
  <button data-tm-fab data-tm-icon="plus" aria-label="New contact"></button>
</body>
```

No script needed. On wide screens the rail sits next to `main`, and the checkbox collapses it to icons.
Below 48rem the rail is a drawer: the ☰ button opens it, and Esc or a click outside closes it. Put
the ☰ button first in each page's top row, where it takes its own space; it is hidden on wide screens. Other
children of `data-tm-shell` (scripts, templates, framework elements) take no space. `aria-current` must
be set in the markup; CSS cannot detect the current page.

With `data-tm-shell="fixed"` the shell fills the viewport and `<main>` scrolls inside it. For panes that each scroll by
themselves (a mail list and a reader), use `<main data-tm-layout="split" data-tm-wrap="none">` with `data-tm-scroll="y"` panes,
as in the next recipe: without `data-tm-wrap="none"` the panes grow to their content and the whole `<main>` scrolls. A page of such an app whose `<main>` itself scrolls (settings, a long form) gets
`<main data-tm-gutter>`: with classic scrollbars (Chrome and Edge on Linux and Windows) its content then keeps its
place when a tab or loaded data makes it shorter or taller than the screen. Not on a `<main>` that only holds
panes: the reserved space would stay there as an empty strip.

For phones with a notch, put `viewport-fit=cover` in the viewport meta
(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`): the page then uses the
whole screen, and the rail, the drawer, the FAB and the toasts keep clear of the notch and the home indicator. Your
own fixed or edge-to-edge elements need `env(safe-area-inset-*)` themselves.

`[data-tm-rail]` must be a direct child of `[data-tm-shell]` (no wrapper element in between). When an app
moves to temper page by page, keep the old nav partial for the old pages and add a second one with
this markup for the migrated pages; delete the old one when the last page has moved.

To keep the collapsed state across page loads, add this (CSS cannot store anything):

```js
const c = document.querySelector('[data-tm-rail-collapse]');
c.checked = localStorage.getItem('rail-collapsed') === '1';
c.addEventListener('change', () => localStorage.setItem('rail-collapsed', c.checked ? '1' : '0'));
```

### Panes that adapt to their own width (app.css)

```html
<main data-tm-layout="split" data-tm-wrap="none" data-tm-gap="none">   <!-- in <body data-tm-shell="fixed">, next to the rail -->
  <section data-tm-scroll="y" style="--tm-split: 22rem">           <!-- not a container: the ☰ button follows the screen -->
    <header data-tm-sticky="top" data-tm-layout="row" data-tm-gap="xs" data-tm-pad="sm">
      <button popovertarget="rail" data-tm-show="narrow" data-tm-icon="menu" data-tm-variant="ghost" aria-label="Open menu"></button>
      <h1>Inbox</h1>
    </header>
    …message list…
  </section>
  <section data-tm-scroll="y" data-tm-container data-tm-show="wide">   <!-- phones: the list only; open a message as its own page -->
    <header data-tm-sticky="top" data-tm-layout="row" data-tm-gap="xs" data-tm-pad="sm">
      <h2 data-tm-grow data-tm-truncate>Quarterly report</h2>
      <button data-tm-show="wide" data-tm-icon="archive" data-tm-variant="ghost">Archive</button>
      <button data-tm-show="narrow" data-tm-icon="archive" data-tm-variant="ghost" aria-label="Archive"></button>
    </header>
    <div data-tm-prose data-tm-pad="md">…</div>
  </section>
</main>
```

`data-tm-wrap="none"` keeps the panes side by side at the full height, so each one scrolls by itself (with the default
wrapping they grow to their content and `<main>` scrolls as a whole). They stay side by side on phones too, so show one
pane there: `data-tm-show="wide"` on a container follows the screen, not its own width. `data-tm-show` follows the
screen width, except inside a `data-tm-container`: there it follows the width of the nearest
one (narrow below 48rem), so the reader's toolbar loses its labels when the reader pane is narrow, even on a wide
screen. Nested containers: the nearest wins. A container's width has to come from outside (a block, `main`, a
`data-tm-grow` or `data-tm-layout="split"` child, a pane with a set width); on something that shrinks to fit its content
(a row child without `data-tm-grow`) it collapses to nothing. Keep the ☰ button that opens the rail drawer outside any
container, since the drawer follows the screen. `<main>` of a `data-tm-shell` is not a container unless you mark it.
Responsive grids (`data-tm-layout="grid"`, `data-tm-layout="split"`) already follow their own width without a container;
`data-tm-cols` grids keep their column count everywhere (a weekday stays in its column), so swap a week grid for a list
with `data-tm-show`.

### Dropdown menu (menu.css)

```html
<button popovertarget="book-menu" data-tm-variant="outline">Address books</button>
<div popover id="book-menu" data-tm-menu>
  <label><input type="checkbox" checked> Personal</label>
  <label><input type="checkbox"> Work</label>
  <hr>
  <button>Manage address books</button>
</div>
```

Group labels and shortcuts need no new attributes:

```html
<div popover id="edit-menu" data-tm-menu>
  <span data-tm-caption>Clipboard</span>
  <button data-tm-icon="copy">Copy <kbd>Ctrl C</kbd></button>
  <button>Paste <kbd>Ctrl V</kbd></button>
</div>
```

A `<kbd>` at the end of an item sits at its end edge, muted. Menus and popovers fade in and out like dialogs.
Buttons that open a popover (`popovertarget`, `command="toggle-popover"`) get a ▾ caret automatically;
icon buttons (`data-tm-icon`) do not. A submit button (`type="submit"`, the default inside a form) ignores
`popovertarget` and `commandfor`; give opener and closer buttons `type="button"`.

A `data-tm-menu` popover can hold any content, not only items: a month picker, a small form.

Opened from a script, `menu.showPopover({ source: button })` places it under that button too: the source is its
anchor, so neither needs an id (a component used twice on a page).

### Sheet: side panel or bottom sheet (sheet.css)

```html
<button commandfor="contact" command="show-modal">Details</button>
<dialog id="contact" data-tm-sheet="end" closedby="any">
  <header>
    <h2>Priya Raman</h2>
    <button commandfor="contact" command="close" aria-label="Close"></button>
  </header>
  <dl data-tm-pairs><dt>Email</dt><dd>priya@raman.dev</dd></dl>
  <footer><button data-tm-icon="pencil">Edit</button></footer>
</dialog>
```

A sheet is a dialog that slides in from an edge; everything else (header, footer, closing, `closedby`) is the
Dialog recipe. `end` and `start` are full-height side panels (details, filters) with the footer at the bottom,
`bottom` runs along the bottom edge (actions; the whole width on phones), and `narrow` is a bottom sheet below
48rem and an ordinary centered dialog from there (pick it when a dialog should feel native on phones). Side
panels are `--tm-dialog-width` wide, and on phones leave a strip of the page to tap. They mirror in RTL and
keep clear of the notch and the home indicator with `viewport-fit=cover`, also with `data-tm-pad`.

### Sortable list: drag handles (drag.css)

```html
<ul role="list" aria-label="Folders" data-tm-layout="stack" data-tm-gap="none">
  <li data-tm-layout="row" data-tm-gap="xs" data-tm-wrap="none">
    <button data-tm-handle aria-label="Move Inbox" aria-pressed="false" data-tm-size="sm"></button>
    <a href="/inbox" data-tm-grow>Inbox</a>
  </li>
</ul>
```

An empty `data-tm-handle` button is a quiet square button with a grip, a grab cursor and `touch-action: none` (only
the handle: the list still scrolls on a phone). Set `aria-pressed="true"` on it while its row is picked up (grabbing
cursor, pressed look). `data-tm-handle="quiet"` hides it until its row (the handle's parent) is under the pointer or
has focus, on devices that can hover. temper draws the states; the pointer, the keys and the announcements are your
script's.

### Expressive: surfaces, display type, hero and bento (expressive.css)

```html
<body data-tm-surface="mesh" data-tm-grain data-tm-pairing="editorial">   <!-- import '@fontsource-variable/fraunces' -->
  <main data-tm-layout="center" data-tm-gap="xl" data-tm-pad="lg">
    <div data-tm-hero>
      <h1 data-tm-display="hero" data-tm-ink="gradient">Caley</h1>
      <p data-tm-muted>Calendar, contacts and mail on your own servers.</p>
      <div data-tm-layout="center" style="--tm-measure: 24rem">
        <article data-tm-surface="glass" data-tm-elevation="floating" data-tm-pad="lg"><button data-tm-halo>Sign in</button></article>
      </div>
    </div>
    <ul data-tm-layout="grid" data-tm-bento data-tm-gap="md" style="--tm-min: 12rem">
      <li data-tm-surface="glass" data-tm-span="wide" data-tm-layout="stack" data-tm-gap="sm" data-tm-pad="lg">
        <span data-tm-avatar data-tm-seed="4" aria-hidden="true"><span data-tm-icon="calendar"></span></span>
        <h3>Calendar</h3><p data-tm-muted>Week and month at a glance.</p>
      </li>
    </ul>
  </main>
</body>
```

The opt-in voice on top of core. Use it for the screens people see first (sign-in, a page's masthead, a profile)
and keep working views plain. Mastheads: `header data-tm-surface="mesh" data-tm-pad="lg"` with an
`h1 data-tm-display="xl"`, and stat tiles as glass `div`s in a `dl data-tm-layout="grid" data-tm-bento` holding
`dt data-tm-caption` and `dd data-tm-figure`. A sticky glass toolbar: `data-tm-surface="glass" data-tm-sticky="top"`.
Cards: `article data-tm-elevation="raised"` (it lifts on hover when it holds a `data-tm-stretch` control). Seeded
colour: `data-tm-seed` on `data-tm-avatar` (initials or an icon); choose the seed from a name's hash so a person
keeps their colour. Everything follows `--tm-hue`/`--tm-chroma` and keeps AA (checked for chroma 0.04–0.22); never
write gradient colours of your own. `data-tm-grain` is an inline SVG image: the CSP needs `img-src data:`.

### Toasts and tooltips (feedback.css)

```html
<button data-tm-variant="ghost" data-tm-icon="trash-2" aria-label="Delete" data-tm-tooltip></button>  <!-- tooltip = aria-label -->
<span data-tm-badge tabindex="0" data-tm-tooltip="Synced 3 hours ago">Stale</span>              <!-- own text (visual only) -->

<div data-tm-toasts role="status"></div>   <!-- once, at the end of <body> -->
```

```js
// Show a toast: append it to the region, remove it after a few seconds (hidden first, so it fades out).
function toast(text, tone) {
  const t = document.createElement('div');
  t.dataset.tmToast = '';
  if (tone) t.dataset.tmTone = tone;           // success, danger, … colors the bar
  if (tone === 'danger') t.role = 'alert';
  t.textContent = text;                       // or: a <span> plus <button data-tm-variant="link" data-tm-size="sm">Undo</button>
  document.querySelector('[data-tm-toasts]').append(t);
  setTimeout(() => { t.hidden = true; setTimeout(() => t.remove(), 300); }, 5000);
}
```

A tooltip is the element's `::after`, so a text button that opens a menu (its dropdown caret), a `data-tm-stretch` link
and a sort button in an `aria-sort` header never show one (`temper check` warns, TM123): put the hint in the label,
or use an icon button, which keeps its tooltip.

In a framework, render the region once and the toasts from a list (`{#each toasts as t (t.id)}<div data-tm-toast …>`).
To show toasts above an open modal dialog, give the region `popover="manual"` and call `region.showPopover()`
after the dialog opens (the top layer stacks in opening order).

### Data table (table.css)

```html
<div data-tm-scroll>                       <!-- scrolls sideways on phones; data-tm-scroll="y" + a height for a fixed header area -->
  <table>
    <caption>Invoices</caption>
    <thead><tr>
      <th><input type="checkbox" aria-label="Select all"></th>
      <th aria-sort="ascending"><button>Customer</button></th>   <!-- your code sorts, then sets aria-sort -->
      <th aria-sort="none"><button>Status</button></th>
      <th data-tm-num aria-sort="none"><button>Amount</button></th>
      <th><span data-tm-sr-only>Actions</span></th>
    </tr></thead>
    <tbody>
      <tr>
        <td><input type="checkbox" aria-label="Select Acme" checked></td>   <!-- checked: the row is highlighted -->
        <th scope="row">Acme Corp</th>
        <td><span data-tm-badge data-tm-tone="success">Paid</span></td>
        <td data-tm-num>1,204.50</td>
        <td><div data-tm-layout="row" data-tm-gap="xs" data-tm-justify="end">
          <button data-tm-variant="ghost" data-tm-size="sm" data-tm-icon="pencil" aria-label="Edit"></button>
        </div></td>
      </tr>
    </tbody>
    <tfoot><tr><td></td><th scope="row" colspan="2">Total</th><td data-tm-num>1,204.50</td><td></td></tr></tfoot>
  </table>
</div>
```

The header sticks while the page scrolls. Put `data-tm-num` on every cell of a number column. Never put
`data-tm-layout` on a `td` (it stops being a cell); wrap the cell content instead. No rows: one
`<tr><td colspan="5" data-tm-muted>No invoices yet.</td></tr>`.

### Fields with an icon, a unit or a button (forms.css)

```html
<div data-tm-field>                                     <!-- search: icon before the input -->
  <span data-tm-icon="search"></span><input type="search" aria-label="Search mail">
</div>
<label>Amount                                         <!-- in a label: <span data-tm-field> -->
  <span data-tm-field><span>€</span><input inputmode="decimal" name="amount" required><span>EUR</span></span>
</label>
<div data-tm-layout="stack" data-tm-gap="xs">               <!-- with a button: <label for>, not a wrapping label -->
  <label for="pw">Password</label>
  <div data-tm-field>
    <input type="password" id="pw" autocomplete="current-password">
    <button type="button" data-tm-variant="ghost" data-tm-icon="eye" aria-label="Show password" aria-pressed="false"></button>
  </div>
</div>
```

The button goes last. Your script toggles the input's `type` and the button's `aria-pressed` (and `data-tm-icon` to
`eye-off`). States go on the input (`aria-invalid`, `disabled`, `readonly`); the whole field shows them. forms.css
also gives `readonly` fields a filled look, marks the label of a `required` field with `*` (a wrapping label, or a `<label for>`
just before the field or data-tm-field; not read out, since the field says "required"; off with `label::after { content: none }`), tints autofilled fields in the theme, styles
`<input type="range">` and animates a `<progress>` without a value.

### Long-form text (prose.css)

```html
<article data-tm-layout="center" data-tm-pad="xl" data-tm-prose>   <!-- a post: a centered reading column (65ch), not a card -->
  <header><h1>Title</h1><p data-tm-muted>Byline</p></header>
  <p>Rendered Markdown, CMS HTML or a mail body, as it comes: no data-tm-layout, no data-tm-gap.</p>
  <figure><img src="…" alt="…"><figcaption>Caption</figcaption></figure>
  <div data-tm-callout data-tm-tone="info"><strong>Note</strong>Components inside keep their own spacing.</div>
  <div data-tm-layout="row" data-tm-gap="sm"><button>Reply</button><button data-tm-variant="outline">Forward</button></div>
</article>
<div data-tm-prose style="--tm-measure: none">{@html mailBody}</div>   <!-- full width, e.g. a mail reader pane -->
```

Space comes from the text flow at any depth (content nested in `div` and `section` wrappers too), never
before the first block or after the last. Images in running text stay in the line; layout tables
(`role="presentation"` or no `th`) lose the data-table look. Do not add `data-tm-gap` or margins to the content. Sanitize
untrusted HTML first; prose.css only styles it.

### Combobox (menu.css)

```html
<div data-tm-combo>
  <input type="text" role="combobox" aria-label="To" aria-controls="to-list" aria-expanded="true">
  <div data-tm-menu role="listbox" id="to-list">
    <div role="option" aria-selected="true">Priya Raman &lt;priya@raman.dev&gt;</div>
    <div role="option">Mira Okafor &lt;mira@okafor.io&gt;</div>
  </div>
</div>
```

Show and hide the list, and move `aria-selected` with the arrow keys, from script.

### Calendar grid and event chips

```html
<div data-tm-layout="grid" data-tm-cols="7" data-tm-gap="xs">
  <div data-tm-layout="stack" data-tm-gap="xs">
    <span data-tm-caption aria-current="date">Sat 7</span>
    <button data-tm-variant="item" data-tm-size="sm" data-tm-bar style="--tm-tone: #4CAF50">
      <small data-tm-muted>10:00</small><span data-tm-clamp="2">Market and brunch</span>
    </button>
  </div>
  …
</div>
```

### Card grid with avatars, whole card clickable

```html
<div data-tm-layout="grid" data-tm-gap="md" style="--tm-min: 13rem">
  <article data-tm-layout="stack" data-tm-gap="xs" data-tm-align="center">
    <span data-tm-avatar>MO</span>
    <a href="#mira" data-tm-stretch><strong>Mira Okafor</strong></a>
    <!-- or, when a click opens a dialog: <button data-tm-stretch data-tm-variant="link" commandfor="detail" command="show-modal">Mira Okafor</button> -->
    <a href="mailto:mira@okafor.io">mira@okafor.io</a>
    <small data-tm-muted>Climbing club</small>
  </article>
</div>
```

### Label/value pairs

```html
<dl data-tm-pairs>
  <dt>From</dt><dd>Priya Raman</dd>
  <div data-sn-show="c.phone"><dt>Phone</dt><dd>+49 30 9876 5432</dd></div>
</dl>
```

A `div` around a `dt`/`dd` pair is allowed (to show or hide the pair as one).

### Page layout

```html
<main data-tm-layout="center" data-tm-gap="xl" data-tm-pad="xl">
  <section data-tm-layout="stack" data-tm-gap="md">…</section>
  <section data-tm-layout="grid" data-tm-gap="lg" style="--tm-min: 20rem">…</section>
</main>
```

### Sticky bars

```html
<main data-tm-layout="stack" data-tm-gap="md">
  <header data-tm-sticky="top" data-tm-layout="row" data-tm-gap="sm" data-tm-pad="sm">
    <h1 data-tm-grow>Invoices</h1><button>New invoice</button>
  </header>
  …a long list or table…
</main>
<form data-tm-layout="stack" data-tm-gap="md">
  …many fields…
  <footer data-tm-sticky="bottom" data-tm-layout="row" data-tm-gap="sm" data-tm-justify="end" data-tm-pad="sm">
    <button type="button" data-tm-variant="ghost">Discard</button><button>Save</button>
  </footer>
</form>
```

The bar stays at the top or bottom of the nearest scroll container (the page, `main` of a fixed shell, a
`data-tm-scroll="y"` pane) while its parent is in view: put it in the long element itself, not in a wrapper of its
own, and not inside a sideways `data-tm-scroll`. It has the background of what it sits on (the page, a card, a
`details` or a dialog) and a line toward the content. It covers a sticky table header that scrolls up to it; to keep both
in view, give the table its own `data-tm-scroll="y"` area under the bar, or move the header down by the bar's height in
your CSS (`thead th { inset-block-start: 3.5rem }`). The bottom bar keeps its content above the home
indicator (with `viewport-fit=cover`). Printed, the bars stay in place in the flow.

### Skip link

```html
<body>
  <a href="#main" data-tm-sr-only>Skip to content</a>   <!-- the first focusable element of the page -->
  …navigation…
  <main id="main">…</main>
```

Hidden until a keyboard user tabs to it; while focused it shows where it stands (in a `data-tm-shell`, at the start of
the row). Following it moves the focus to `<main>`.

### Right to left, high contrast, print

Nothing to add for these. `dir="rtl"` (on `<html>`, or any element) mirrors the layout and the components: the rail
and the drawer on the right, the FAB and the toasts at the bottom left, switches, the select arrow, menus, vertical
tabs, number columns. Icons are not mirrored: pick `arrow-left` or `arrow-right` by meaning. In forced colors
(Windows high contrast) icons keep the text color and selected, pressed and current items get a ring in the
system's highlight color. Printed, a page leaves out the rail, the FAB, toasts and tooltips, prints a fixed shell
and `data-tm-scroll` areas in full, light and without shadows.

<!-- /full -->
## Anti-patterns

| Don't | Do |
|---|---|
| `<button class="secondary">` | `<button data-tm-variant="secondary">` |
| `<button data-tm-variant="danger">` | `<button data-tm-tone="danger">` (tone is color, variant is style) |
| `<button data-tm-variant="primary">` | `<button>` (primary is the default) |
| `<p class="error">` | `<p data-tm-tone="danger">` or `<div data-tm-callout data-tm-tone="danger">` |
| `style="margin-top: 1rem"` on a button or input | wrap the elements in `data-tm-layout="stack" data-tm-gap="md"` |
| `style="padding: var(--tm-space-lg)"` | `data-tm-pad="lg"` |
| a custom class to turn a `label` into a flex row | `<label data-tm-layout="row" data-tm-justify="between">` |
| `data-tm-gap="4"` or `data-tm-gap="16px"` | `data-tm-gap="md"` |
| `<button data-tm-icon="x"></button>` | `<button data-tm-icon="x" aria-label="Close"></button>` |
| `<svg><path d="…"/></svg>` for a mail icon | `<span data-tm-icon="mail"></span>` |
| `data-tm-badge="true"` | `data-tm-badge` |
| `color: #666` in app CSS | `color: var(--tm-text-muted)` |
| `!important` to beat temper | a plain selector; app CSS already wins |

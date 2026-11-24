# temper

> CSS library for plain, semantic HTML. Elements look finished without classes. Variants are
> `data-*` attributes with fixed values. Light and dark mode switch automatically.

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
import '@tiaforge-ui/temper/prose.css';  // data-prose: articles, Markdown, mail bodies
import '@tiaforge-ui/temper/forms.css';  // data-field (icon, unit, button in a field), range, read-only, required *, loading bar
import '@tiaforge-ui/temper/sheet.css';  // data-sheet: a dialog as a side panel or bottom sheet
import '@tiaforge-ui/temper/icons.css';  // the default icon set (see Icons)
import '@tiaforge-ui/temper/pico-compat.css'; // only while components written for Pico (reading --pico-*) remain
// or everything: import '@tiaforge-ui/temper/all.css';
```

```js
// vite.config.js: runs temper check in every build (errors fail the build, the dev server warns)
import temper from '@tiaforge-ui/temper/vite';
export default { plugins: [temper()] };
// with icons: every Lucide icon by name (only the used ones are emitted) plus your own SVG folder
// export default { plugins: [temper({ icons: { dir: 'src/icons' } })] };  and  import 'virtual:temper-icons.css';
// (then do not also import icons.css; the CLI equivalent is: npx temper check --lucide --icons src/icons <paths>)
<!-- full -->
// computed names: data-icon={dark ? 'sun' : 'moon'} emits both; names the source does not show (data-icon={item.icon})
// get a notice with file and line: list them in temper({ icons: { include: ['rocket', 'star'] } })
<!-- /full -->
// while migrating step by step, check only the migrated parts: temper({ paths: ['src/contacts', 'contacts'] })
// opt-in enhancements (newer CSS, fine to leave off): temper({ enhance: ['customizable-select'] }) or enhance: 'all'
// smaller builds: temper({ prune: true }) drops rules for attributes and values the project never uses
// without the plugin: import '@tiaforge-ui/temper/enhance/customizable-select.css' after core.css
```

<!-- full -->
Types for computed values (`data-tone={failed ? 'danger' : 'success'}`), checked by your framework's
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
3. Variants are the `data-*` attributes listed below, with exactly the listed values. Each attribute
   is one independent axis: `data-variant` is the style, `data-tone` is the color, `data-size` is the
   size. Do not invent classes or values for these.
4. **Spacing:** nothing has an outer margin (only `data-prose` text has). The parent owns all space: `data-gap` between its
   children (needs `data-layout`), `data-pad` around them. Do not write `margin` or `padding` in
   `style` attributes. To add space between two things, wrap them in a `data-layout` element.
   `data-layout` overrides an element's own display, so `<label data-layout="row">` is a real row.
   `data-grow` on one child makes it take the remaining space (search fields, inputs next to a button).
5. Sizes always use the same words: `xs sm md lg xl`. There are no numeric scales.
6. Your own CSS always wins over temper (temper lives in `@layer tm.*`). Never use `!important`.
   In your own CSS, use the tokens (`var(--tm-text-muted)`, `var(--tm-space-sm)`), never hard-coded colors.
7. Use `class` only for your app's own components. `data-*` attributes from the list below belong to
   temper; do not use those names for anything else.
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
    at a wide and a narrow width, in light and dark mode, and reports overflow, misplaced overlays,
    contrast, unlabeled controls and covered click targets as text. To judge how it looks, add
    `--sheet <dir>`: one small image per page with every state at every width and scheme, plus each
    state at full size in `<dir>/<page>/` for details.

## Attributes

{{attributes}}

## Tokens

Set inputs on `:root` in your own CSS to change the theme. Use the rest in your own CSS.

{{tokens}}

## Icons

```html
<span data-icon="mail"></span>                                        <!-- an icon, 1.125em, in the text color -->
<button data-icon="pencil">Edit</button>                              <!-- icon before the text -->
<button data-icon="x" data-variant="ghost" aria-label="Close"></button>  <!-- empty: square icon-only button, needs aria-label -->
<a href="/mail/" data-icon="mail"><span>Mail</span></a>               <!-- rail items, links -->
```

Names are Lucide's (https://lucide.dev/icons). icons.css contains: {{iconNames}}. With the Vite plugin's `icons` option every Lucide name works, and only the icons you
use end up in the CSS. Do not paste inline `<svg>` for an icon that has a name.

<!-- full -->
The plugin finds the names in your markup: static ones and every literal an expression can produce
(`data-icon={dark ? 'sunrise' : 'moon-star'}` emits both). A name it cannot see, such as
`data-icon={item.icon}` from a data array or a component prop, is not emitted and would render blank, so the
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
[data-icon="rocket"] { --_icon: var(--tm-icon-rocket); }
```

`--tm-icon-<name>` is an input only: temper's own icons are not declared as properties, so reading
`var(--tm-icon-mail)` in your CSS gives nothing unless you set it. Use `data-icon` to draw a default icon.

<!-- /full -->
Icons are one color (the text color); keep multicolor logos as `<img>`.

<!-- full -->
## Recipes

### Form

```html
<form data-layout="stack" data-gap="md">
  <label>Name <input name="name" required></label>
  <div data-layout="grid" data-gap="sm" style="--tm-min: 10rem">
    <label>Start <input type="date"></label>
    <label>Time <input type="time"></label>
  </div>
  <label>Calendar <select><option>Work</option></select></label>
  <label><input type="checkbox" role="switch"> All day</label>
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

### Card

```html
<article data-layout="stack" data-gap="sm">
  <header><h3>Title</h3><button data-icon="x" data-variant="ghost" aria-label="Close"></button></header>
  <p>Body text.</p>
  <footer><button data-variant="secondary">Edit</button></footer>
</article>
```

`article > header` puts its children in a row with space between. `article > footer` aligns its
buttons to the end.

An `img`, `picture` or `video` as the card's first child runs edge to edge under its rounded top corners (also with
`data-pad` on the card, and in a clickable card); everything after it keeps the padding. Nothing to add:

```html
<article data-layout="stack" data-gap="sm">
  <img src="cabin.jpg" alt="A cabin by the lake" width="640" height="360">
  <h3>Lake cabin</h3>
  <p data-muted>Sleeps four.</p>
</article>
```

Only the first child bleeds; an image elsewhere in the card (or inside a link) stays inside the padding.

### Dialog

```html
<button commandfor="confirm" command="show-modal" data-tone="danger">Delete…</button>
<dialog id="confirm">
  <header>
    <h2>Delete “Team retro”?</h2>
    <button commandfor="confirm" command="close" aria-label="Close"></button>
  </header>
  <p>This sends a cancellation to all guests.</p>
  <footer>
    <button commandfor="confirm" command="close" data-variant="ghost">Keep</button>
    <button data-tone="danger">Delete event</button>
  </footer>
</dialog>
```

The open dialog is a grid with a gap between its direct children, so content inside a wrapper element
loses that gap. A dialog taller than the screen scrolls between its header and footer, which stay in view
(also through one `form`, `div` or `article` wrapper); the page behind a modal dialog does not scroll. To let
one part fill the remaining height instead (a message body, a long list), give the dialog
`data-layout="stack"` and that part `data-grow data-scroll="y"`. Pico-style `dialog > article` markup
works too: the article adds no box of its own.

Add `closedby="any"` to close the dialog on a click outside it or on Esc, with no script (no backdrop
click handlers).

An empty close button in the header (`command="close"`, `command="hide-popover"` or
`popovertargetaction="hide"`) is drawn as a quiet × icon button; give it an `aria-label`. Header and
footer also work through one wrapper (`dialog > form > footer`, a template-rendered `div`). The open
dialog is a grid with a gap between its children, so an empty helper element inside it adds an empty
row: give such elements the `hidden` attribute.

### Toolbar

```html
<div data-layout="row" data-gap="sm">
  <h2>Contacts</h2>
  <input type="search" data-grow placeholder="Search" aria-label="Search">
  <button data-icon="plus" data-variant="ghost" aria-label="Add contact"></button>
</div>
```

`data-grow` makes the search field fill the space between the heading and the button. A button whose
label does not fit (a long translation on a phone) wraps the label onto two lines; nothing to add. For a fixed
width instead, leave `data-grow` out and add `data-justify="between"` to the row.

### Button groups

```html
<div data-join role="group" aria-label="Message">               <!-- toolbar group -->
  <button data-variant="outline" data-icon="archive" aria-label="Archive"></button>
  <button data-variant="outline" data-icon="folder" aria-label="Move"></button>
  <button data-variant="outline" data-icon="trash-2" aria-label="Delete"></button>
</div>
<div data-join>                                                 <!-- split button -->
  <button>Send</button>
  <button popovertarget="send-menu" data-icon="chevron-down" aria-label="More send options"></button>
</div>
<div popover id="send-menu" data-menu><button>Send later</button></div>
<nav aria-label="Pages"><div data-join>                         <!-- pager -->
  <a href="?p=1" role="button" data-variant="outline" data-icon="chevron-left" aria-label="Previous page"></a>
  <a href="?p=3" role="button" data-variant="outline" data-icon="chevron-right" aria-label="Next page"></a>
</div></nav>
<form role="search" data-join data-grow>                         <!-- field + button -->
  <input type="search" data-grow aria-label="Search">
  <button>Search</button>
</form>
```

`data-join` draws its children as one unit: shared borders, rounded only at the ends, mirrored in RTL. It works for
every variant (all children usually share one), with `data-size` on the group and in both densities; a focused child
keeps its whole ring. A `select` or a `data-field` (forms.css) can be part of it. For toggle groups where exactly one
option is chosen, use `data-segmented` instead. Do not put `data-layout` or `data-gap` on the group.

### Status

```html
<span data-badge data-tone="success">Synced</span>
<span data-badge style="--tm-tone: #e8590c">Custom color</span>
<div data-callout data-tone="warning" role="status"><strong>Password expires soon</strong>Update it before 1 December.</div>
<button aria-busy="true">Saving</button>
```

### Settings rows

```html
<div data-layout="stack" data-gap="none" data-density="compact">
  <label data-layout="row" data-justify="between" data-pad="sm">Email notifications <input type="checkbox" role="switch"></label>
  <label data-layout="row" data-justify="between" data-pad="sm">Show week numbers <input type="checkbox" role="switch"></label>
</div>
```

### Bordered list

```html
<ul data-list>
  <li data-layout="row" data-justify="between">
    <span data-grow>Firefox on Linux <span data-badge data-tone="accent">This browser</span></span>
    <button data-icon="trash-2" data-variant="ghost" data-size="sm" data-tone="danger" aria-label="Remove"></button>
  </li>
  <li data-layout="row" data-justify="between">…</li>
</ul>
```

`data-list` draws one box with a line between rows and pads each row. `data-grow` on the label keeps
the button at the end of the row on narrow screens. Do not build the same from bordered `article`s
with `data-pad`.

### Tabs

```html
<div role="tablist" aria-label="Settings">
  <button role="tab" aria-selected="true" aria-controls="general">General</button>
  <button role="tab" aria-selected="false" aria-controls="encryption">Encryption</button>
</div>
<section role="tabpanel" id="general">…</section>
<section role="tabpanel" id="encryption" hidden>…</section>
```

No `data-variant` on tabs: the selected one (`aria-selected="true"`) is underlined. Your script switches
`aria-selected` and `hidden`. `aria-orientation="vertical"` on the tablist stacks the tabs.

### Segmented control

```html
<div role="radiogroup" data-segmented data-size="sm" aria-label="View">
  <label><input type="radio" name="view" value="week" checked>Week</label>
  <label><input type="radio" name="view" value="month">Month</label>
</div>
```

A radio group for a view switch (a few short options, one always chosen). The checked label is a raised
chip; keep the `input` inside its `label`. For panels that show and hide use tabs instead.

### Divider with text

```html
<button data-variant="secondary">Sign in with a passkey</button>
<p data-divider>or</p>
```

### App shell with navigation rail (app.css)

```html
<body data-shell>
  <nav data-rail popover id="rail" aria-label="Main">
    <header>
      <span data-rail-label>Caley</span>
      <input type="checkbox" data-rail-collapse aria-label="Collapse menu">
    </header>
    <a href="/mail/" data-icon="mail"><span>Mail</span><span data-badge data-tone="accent">12</span></a>
    <a href="/contacts/" data-icon="users" aria-current="page"><span>Contacts</span></a>
    <footer>
      <span data-caption data-rail-label>Tia Heinrich</span>
      <a href="/settings/" data-icon="settings"><span>Settings</span></a>
    </footer>
  </nav>
  <main data-layout="stack" data-gap="lg" data-pad="lg">
    <div data-layout="row" data-gap="sm">
      <button popovertarget="rail" data-show="narrow" data-icon="menu" data-variant="ghost" aria-label="Open menu"></button>
      <h1>Contacts</h1>
      …
    </div>
    …
  </main>
  <button data-fab data-icon="plus" aria-label="New contact"></button>
</body>
```

No script needed. On wide screens the rail sits next to `main`, and the checkbox collapses it to icons.
Below 48rem the rail is a drawer: the ☰ button opens it, and Esc or a click outside closes it. Put
the ☰ button first in each page's top row, where it takes its own space; it is hidden on wide screens. Other
children of `data-shell` (scripts, templates, framework elements) take no space. `aria-current` must
be set in the markup; CSS cannot detect the current page.

With `data-shell="fixed"` the shell fills the viewport and `<main>` scrolls inside it (multi-pane apps: give the
panes `data-scroll="y"`). A page of such an app whose `<main>` itself scrolls (settings, a long form) gets
`<main data-gutter>`: with classic scrollbars (Chrome and Edge on Linux and Windows) its content then keeps its
place when a tab or loaded data makes it shorter or taller than the screen. Not on a `<main>` that only holds
panes: the reserved space would stay there as an empty strip.

For phones with a notch, put `viewport-fit=cover` in the viewport meta
(`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`): the page then uses the
whole screen, and the rail, the drawer, the FAB and the toasts keep clear of the notch and the home indicator. Your
own fixed or edge-to-edge elements need `env(safe-area-inset-*)` themselves.

`[data-rail]` must be a direct child of `[data-shell]` (no wrapper element in between). When an app
moves to temper page by page, keep the old nav partial for the old pages and add a second one with
this markup for the migrated pages; delete the old one when the last page has moved.

To keep the collapsed state across page loads, add this (CSS cannot store anything):

```js
const c = document.querySelector('[data-rail-collapse]');
c.checked = localStorage.getItem('rail-collapsed') === '1';
c.addEventListener('change', () => localStorage.setItem('rail-collapsed', c.checked ? '1' : '0'));
```

### Panes that adapt to their own width (app.css)

```html
<main data-layout="split" data-wrap="none" data-gap="none">   <!-- in <body data-shell="fixed">, next to the rail -->
  <section data-scroll="y" data-container style="--tm-split: 22rem">…message list…</section>
  <section data-scroll="y" data-container>
    <header data-sticky="top" data-layout="row" data-gap="xs" data-pad="sm">
      <h2 data-grow data-truncate>Quarterly report</h2>
      <button data-show="wide" data-icon="archive" data-variant="ghost">Archive</button>
      <button data-show="narrow" data-icon="archive" data-variant="ghost" aria-label="Archive"></button>
    </header>
    <div data-prose data-pad="md">…</div>
  </section>
</main>
```

`data-wrap="none"` keeps the panes side by side at the full height, so each one scrolls by itself. `data-show` follows the
screen width, except inside a `data-container`: there it follows the width of the nearest
one (narrow below 48rem), so the reader's toolbar loses its labels when the reader pane is narrow, even on a wide
screen. Nested containers: the nearest wins. A container's width has to come from outside (a block, `main`, a
`data-grow` or `data-layout="split"` child, a pane with a set width); on something that shrinks to fit its content
(a row child without `data-grow`) it collapses to nothing. Keep the ☰ button that opens the rail drawer outside any
container, since the drawer follows the screen. `<main>` of a `data-shell` is not a container unless you mark it.
Responsive grids (`data-layout="grid"`, `data-layout="split"`) already follow their own width without a container;
`data-cols` grids keep their column count everywhere (a weekday stays in its column), so swap a week grid for a list
with `data-show`.

### Dropdown menu (menu.css)

```html
<button popovertarget="book-menu" data-variant="outline">Address books</button>
<div popover id="book-menu" data-menu>
  <label><input type="checkbox" checked> Personal</label>
  <label><input type="checkbox"> Work</label>
  <hr>
  <button>Manage address books</button>
</div>
```

Group labels and shortcuts need no new attributes:

```html
<div popover id="edit-menu" data-menu>
  <span data-caption>Clipboard</span>
  <button data-icon="copy">Copy <kbd>Ctrl C</kbd></button>
  <button>Paste <kbd>Ctrl V</kbd></button>
</div>
```

A `<kbd>` at the end of an item sits at its end edge, muted. Menus and popovers fade in and out like dialogs.
Buttons that open a popover (`popovertarget`, `command="toggle-popover"`) get a ▾ caret automatically;
icon buttons (`data-icon`) do not. A submit button (`type="submit"`, the default inside a form) ignores
`popovertarget` and `commandfor`; give opener and closer buttons `type="button"`.

A `data-menu` popover can hold any content, not only items: a month picker, a small form.

### Sheet: side panel or bottom sheet (sheet.css)

```html
<button commandfor="contact" command="show-modal">Details</button>
<dialog id="contact" data-sheet="end" closedby="any">
  <header>
    <h2>Priya Raman</h2>
    <button commandfor="contact" command="close" aria-label="Close"></button>
  </header>
  <dl data-pairs><dt>Email</dt><dd>priya@raman.dev</dd></dl>
  <footer><button data-icon="pencil">Edit</button></footer>
</dialog>
```

A sheet is a dialog that slides in from an edge; everything else (header, footer, closing, `closedby`) is the
Dialog recipe. `end` and `start` are full-height side panels (details, filters) with the footer at the bottom,
`bottom` runs along the bottom edge (actions; the whole width on phones), and `narrow` is a bottom sheet below
48rem and an ordinary centered dialog from there (pick it when a dialog should feel native on phones). Side
panels are `--tm-dialog-width` wide, and on phones leave a strip of the page to tap. They mirror in RTL and
keep clear of the notch with `viewport-fit=cover`.

### Toasts and tooltips (feedback.css)

```html
<button data-variant="ghost" data-icon="trash-2" aria-label="Delete" data-tooltip></button>  <!-- tooltip = aria-label -->
<span data-badge tabindex="0" data-tooltip="Synced 3 hours ago">Stale</span>              <!-- own text (visual only) -->

<div data-toasts role="status"></div>   <!-- once, at the end of <body> -->
```

```js
// Show a toast: append it to the region, remove it after a few seconds (hidden first, so it fades out).
function toast(text, tone) {
  const t = document.createElement('div');
  t.dataset.toast = '';
  if (tone) t.dataset.tone = tone;           // success, danger, … colors the bar
  if (tone === 'danger') t.role = 'alert';
  t.textContent = text;                       // or: a <span> plus <button data-variant="link" data-size="sm">Undo</button>
  document.querySelector('[data-toasts]').append(t);
  setTimeout(() => { t.hidden = true; setTimeout(() => t.remove(), 300); }, 5000);
}
```

In a framework, render the region once and the toasts from a list (`{#each toasts as t (t.id)}<div data-toast …>`).
To show toasts above an open modal dialog, give the region `popover="manual"` and call `region.showPopover()`
after the dialog opens (the top layer stacks in opening order).

### Data table (table.css)

```html
<div data-scroll>                       <!-- scrolls sideways on phones; data-scroll="y" + a height for a fixed header area -->
  <table>
    <caption>Invoices</caption>
    <thead><tr>
      <th><input type="checkbox" aria-label="Select all"></th>
      <th aria-sort="ascending"><button>Customer</button></th>   <!-- your code sorts, then sets aria-sort -->
      <th aria-sort="none"><button>Status</button></th>
      <th data-num aria-sort="none"><button>Amount</button></th>
      <th><span data-sr-only>Actions</span></th>
    </tr></thead>
    <tbody>
      <tr>
        <td><input type="checkbox" aria-label="Select Acme" checked></td>   <!-- checked: the row is highlighted -->
        <th scope="row">Acme Corp</th>
        <td><span data-badge data-tone="success">Paid</span></td>
        <td data-num>1,204.50</td>
        <td><div data-layout="row" data-gap="xs" data-justify="end">
          <button data-variant="ghost" data-size="sm" data-icon="pencil" aria-label="Edit"></button>
        </div></td>
      </tr>
    </tbody>
    <tfoot><tr><td></td><th scope="row" colspan="2">Total</th><td data-num>1,204.50</td><td></td></tr></tfoot>
  </table>
</div>
```

The header sticks while the page scrolls. Put `data-num` on every cell of a number column. Never put
`data-layout` on a `td` (it stops being a cell); wrap the cell content instead. No rows: one
`<tr><td colspan="5" data-muted>No invoices yet.</td></tr>`.

### Fields with an icon, a unit or a button (forms.css)

```html
<div data-field>                                     <!-- search: icon before the input -->
  <span data-icon="search"></span><input type="search" aria-label="Search mail">
</div>
<label>Amount                                         <!-- in a label: <span data-field> -->
  <span data-field><span>€</span><input inputmode="decimal" name="amount" required><span>EUR</span></span>
</label>
<div data-layout="stack" data-gap="xs">               <!-- with a button: <label for>, not a wrapping label -->
  <label for="pw">Password</label>
  <div data-field>
    <input type="password" id="pw" autocomplete="current-password">
    <button type="button" data-variant="ghost" data-icon="eye" aria-label="Show password" aria-pressed="false"></button>
  </div>
</div>
```

The button goes last. Your script toggles the input's `type` and the button's `aria-pressed` (and `data-icon` to
`eye-off`). States go on the input (`aria-invalid`, `disabled`, `readonly`); the whole field shows them. forms.css
also gives `readonly` fields a filled look, marks the label of a `required` field with `*` (not read out, since the
field says "required"; off with `label::after { content: none }`), tints autofilled fields in the theme, styles
`<input type="range">` and animates a `<progress>` without a value.

### Long-form text (prose.css)

```html
<article data-layout="center" data-pad="xl" data-prose>   <!-- a post: a centered reading column (65ch), not a card -->
  <header><h1>Title</h1><p data-muted>Byline</p></header>
  <p>Rendered Markdown, CMS HTML or a mail body, as it comes: no data-layout, no data-gap.</p>
  <figure><img src="…" alt="…"><figcaption>Caption</figcaption></figure>
  <div data-callout data-tone="info"><strong>Note</strong>Components inside keep their own spacing.</div>
  <div data-layout="row" data-gap="sm"><button>Reply</button><button data-variant="outline">Forward</button></div>
</article>
<div data-prose style="--tm-measure: none">{@html mailBody}</div>   <!-- full width, e.g. a mail reader pane -->
```

Space comes from the text flow at any depth (content nested in `div` and `section` wrappers too), never
before the first block or after the last. Images in running text stay in the line; layout tables
(`role="presentation"` or no `th`) lose the data-table look. Do not add `data-gap` or margins to the content. Sanitize
untrusted HTML first; prose.css only styles it.

### Combobox (menu.css)

```html
<div data-combo>
  <input type="text" role="combobox" aria-label="To" aria-controls="to-list" aria-expanded="true">
  <div data-menu role="listbox" id="to-list">
    <div role="option" aria-selected="true">Priya Raman &lt;priya@raman.dev&gt;</div>
    <div role="option">Mira Okafor &lt;mira@okafor.io&gt;</div>
  </div>
</div>
```

Show and hide the list, and move `aria-selected` with the arrow keys, from script.

### Calendar grid and event chips

```html
<div data-layout="grid" data-cols="7" data-gap="xs">
  <div data-layout="stack" data-gap="xs">
    <span data-caption aria-current="date">Sat 7</span>
    <button data-variant="item" data-size="sm" data-bar style="--tm-tone: #4CAF50">
      <small data-muted>10:00</small><span data-clamp="2">Market and brunch</span>
    </button>
  </div>
  …
</div>
```

### Card grid with avatars, whole card clickable

```html
<div data-layout="grid" data-gap="md" style="--tm-min: 13rem">
  <article data-layout="stack" data-gap="xs" data-align="center">
    <span data-avatar>MO</span>
    <a href="#mira" data-stretch><strong>Mira Okafor</strong></a>
    <!-- or, when a click opens a dialog: <button data-stretch data-variant="link" commandfor="detail" command="show-modal">Mira Okafor</button> -->
    <a href="mailto:mira@okafor.io">mira@okafor.io</a>
    <small data-muted>Climbing club</small>
  </article>
</div>
```

### Label/value pairs

```html
<dl data-pairs>
  <dt>From</dt><dd>Priya Raman</dd>
  <div data-sn-show="c.phone"><dt>Phone</dt><dd>+49 30 9876 5432</dd></div>
</dl>
```

A `div` around a `dt`/`dd` pair is allowed (to show or hide the pair as one).

### Page layout

```html
<main data-layout="center" data-gap="xl" data-pad="xl">
  <section data-layout="stack" data-gap="md">…</section>
  <section data-layout="grid" data-gap="lg" style="--tm-min: 20rem">…</section>
</main>
```

### Sticky bars

```html
<main data-layout="stack" data-gap="md">
  <header data-sticky="top" data-layout="row" data-gap="sm" data-pad="sm">
    <h1 data-grow>Invoices</h1><button>New invoice</button>
  </header>
  …a long list or table…
</main>
<form data-layout="stack" data-gap="md">
  …many fields…
  <footer data-sticky="bottom" data-layout="row" data-gap="sm" data-justify="end" data-pad="sm">
    <button type="button" data-variant="ghost">Discard</button><button>Save</button>
  </footer>
</form>
```

The bar stays at the top or bottom of the nearest scroll container (the page, `main` of a fixed shell, a
`data-scroll="y"` pane) while its parent is in view: put it in the long element itself, not in a wrapper of its
own, and not inside a sideways `data-scroll`. It has the background of what it sits on (the page, a card, a
`details` or a dialog) and a line toward the content. It covers a sticky table header that scrolls up to it; to keep both
in view, give the table its own `data-scroll="y"` area under the bar, or move the header down by the bar's height in
your CSS (`thead th { inset-block-start: 3.5rem }`). The bottom bar keeps its content above the home
indicator (with `viewport-fit=cover`). Printed, the bars stay in place in the flow.

### Skip link

```html
<body>
  <a href="#main" data-sr-only>Skip to content</a>   <!-- the first focusable element of the page -->
  …navigation…
  <main id="main">…</main>
```

Hidden until a keyboard user tabs to it; while focused it shows where it stands (in a `data-shell`, at the start of
the row). Following it moves the focus to `<main>`.

### Right to left, high contrast, print

Nothing to add for these. `dir="rtl"` (on `<html>`, or any element) mirrors the layout and the components: the rail
and the drawer on the right, the FAB and the toasts at the bottom left, switches, the select arrow, menus, vertical
tabs, number columns. Icons are not mirrored: pick `arrow-left` or `arrow-right` by meaning. In forced colors
(Windows high contrast) icons keep the text color and selected, pressed and current items get a ring in the
system's highlight color. Printed, a page leaves out the rail, the FAB, toasts and tooltips, prints a fixed shell
and `data-scroll` areas in full, light and without shadows.

<!-- /full -->
## Anti-patterns

| Don't | Do |
|---|---|
| `<button class="secondary">` | `<button data-variant="secondary">` |
| `<button data-variant="danger">` | `<button data-tone="danger">` (tone is color, variant is style) |
| `<button data-variant="primary">` | `<button>` (primary is the default) |
| `<p class="error">` | `<p data-tone="danger">` or `<div data-callout data-tone="danger">` |
| `style="margin-top: 1rem"` on a button or input | wrap the elements in `data-layout="stack" data-gap="md"` |
| `style="padding: var(--tm-space-lg)"` | `data-pad="lg"` |
| a custom class to turn a `label` into a flex row | `<label data-layout="row" data-justify="between">` |
| `data-gap="4"` or `data-gap="16px"` | `data-gap="md"` |
| `<button data-icon="x"></button>` | `<button data-icon="x" aria-label="Close"></button>` |
| `<svg><path d="…"/></svg>` for a mail icon | `<span data-icon="mail"></span>` |
| `data-badge="true"` | `data-badge` |
| `color: #666` in app CSS | `color: var(--tm-text-muted)` |
| `!important` to beat temper | a plain selector; app CSS already wins |

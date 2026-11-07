# tinystyle

> Tiny CSS library for plain, semantic HTML. Elements look finished without classes. Variants are
> `data-*` attributes with fixed values. Light and dark mode switch automatically.

## Setup

```js
import '@tiaforge-ui/tinystyle/core.css';   // always
import '@tiaforge-ui/tinystyle/app.css';    // app shell, navigation rail, floating action button
import '@tiaforge-ui/tinystyle/menu.css';   // dropdown menus
// or everything: import '@tiaforge-ui/tinystyle/all.css';
```

```js
// vite.config.js: runs tinystyle check in every build (errors fail the build, the dev server warns)
import tinystyle from '@tiaforge-ui/tinystyle/vite';
export default { plugins: [tinystyle()] };
```

## Rules

1. Write semantic HTML first. `button`, `input`, `select`, `textarea`, `label`, `fieldset`, `dialog`,
   `[popover]`, `details`, `table`, `article` (card), `dl`, `progress`, `code`, `kbd` are styled
   without any attributes.
2. Use HTML and ARIA state, not attributes of your own: `disabled`, `aria-busy="true"` (spinner),
   `aria-invalid="true"` (error border), `aria-pressed="true"` (toggled), `aria-current`.
3. Variants are the `data-*` attributes listed below, with exactly the listed values. Each attribute
   is one independent axis: `data-variant` is the style, `data-tone` is the color, `data-size` is the
   size. Do not invent classes or values for these.
4. **Spacing:** nothing has an outer margin. The parent owns all space: `data-gap` between its
   children (needs `data-layout`), `data-pad` around them. Do not write `margin` or `padding` in
   `style` attributes. To add space between two things, wrap them in a `data-layout` element.
   `data-layout` overrides an element's own display, so `<label data-layout="row">` is a real row.
   `data-grow` on one child makes it take the remaining space (search fields, inputs next to a button).
5. Sizes always use the same words: `xs sm md lg xl`. There are no numeric scales.
6. Your own CSS always wins over tinystyle (tinystyle lives in `@layer ts.*`). Never use `!important`.
   In your own CSS, use the tokens (`var(--ts-text-muted)`, `var(--ts-space-sm)`), never hard-coded colors.
7. Use `class` only for your app's own components. `data-*` attributes from the list below belong to
   tinystyle; do not use those names for anything else.
8. Size and tune things with the documented custom properties in `style` (`style="--ts-min: 12rem"`,
   `style="--ts-tone: #e8590c"`, `style="--ts-avatar-size: 4rem"`). That is the intended way; do not
   write `width`, `margin` or `padding` there.
9. Run `npx tinystyle check <dir>` after editing (or use the Vite plugin, which runs it in every build).
   It reports unknown attribute values and tokens, and unlabeled icon or close buttons.
10. To see the result, prefer `npx tinystyle-inspect <dev-server-url>` (package
    `@tiaforge-ui/tinystyle-inspect`, if installed) over screenshots. It opens every dialog and popover
    at a wide and a narrow width, in light and dark mode, and reports overflow, misplaced overlays,
    contrast, unlabeled controls and covered click targets as text.

## Attributes

{{attributes}}

## Tokens

Set inputs on `:root` in your own CSS to change the theme. Use the rest in your own CSS.

{{tokens}}

## Recipes

### Form

```html
<form data-layout="stack" data-gap="md">
  <label>Name <input name="name" required></label>
  <div data-layout="grid" data-gap="sm" style="--ts-min: 10rem">
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
  <header><h3>Title</h3><button data-icon data-variant="ghost" aria-label="Close">×</button></header>
  <p>Body text.</p>
  <footer><button data-variant="secondary">Edit</button></footer>
</article>
```

`article > header` puts its children in a row with space between. `article > footer` aligns its
buttons to the end.

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
    <button commandfor="confirm" command="close" data-variant="secondary">Keep</button>
    <button data-tone="danger">Delete event</button>
  </footer>
</dialog>
```

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
  <button data-icon data-variant="ghost" aria-label="Add contact">+</button>
</div>
```

`data-grow` makes the search field fill the space between the heading and the button. For a fixed
width instead, leave `data-grow` out and add `data-justify="between"` to the row.

### Status

```html
<span data-badge data-tone="success">Synced</span>
<span data-badge style="--ts-tone: #e8590c">Custom color</span>
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

### App shell with navigation rail (app.css)

```html
<body data-shell>
  <!-- shared nav partial: the drawer button and the rail -->
  <button popovertarget="rail" data-show="narrow" data-icon data-variant="ghost" aria-label="Open menu"
          style="position: fixed; inset: var(--ts-space-sm) auto auto var(--ts-space-sm)">☰</button>
  <nav data-rail popover id="rail" aria-label="Main">
    <header>
      <span data-rail-label>Caley</span>
      <input type="checkbox" data-rail-collapse aria-label="Collapse menu">
    </header>
    <a href="/mail/"><svg>…</svg><span>Mail</span><span data-badge data-tone="accent">12</span></a>
    <a href="/contacts/" aria-current="page"><svg>…</svg><span>Contacts</span></a>
    <footer>
      <span data-caption data-rail-label>Tia Heinrich</span>
      <a href="/settings/"><svg>…</svg><span>Settings</span></a>
    </footer>
  </nav>
  <main data-layout="stack" data-gap="lg" data-pad="lg">…</main>
  <button data-fab data-icon aria-label="New contact">+</button>
</body>
```

No script needed. On wide screens the rail sits next to `main`, and the checkbox collapses it to icons.
Below 48rem the rail is a drawer: the ☰ button opens it, and Esc or a click outside closes it. Other
children of `data-shell` (scripts, templates, framework elements) take no space. `aria-current` must
be set in the markup; CSS cannot detect the current page.

To keep the collapsed state across page loads, add this (CSS cannot store anything):

```js
const c = document.querySelector('[data-rail-collapse]');
c.checked = localStorage.getItem('rail-collapsed') === '1';
c.addEventListener('change', () => localStorage.setItem('rail-collapsed', c.checked ? '1' : '0'));
```

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

Buttons that open a popover (`popovertarget`, `command="toggle-popover"`) get a ▾ caret automatically;
icon buttons (`data-icon`) do not.

### Card grid with avatars, whole card clickable

```html
<div data-layout="grid" data-gap="md" style="--ts-min: 13rem">
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
  <section data-layout="grid" data-gap="lg" style="--ts-min: 20rem">…</section>
</main>
```

## Anti-patterns

| Don't | Do |
|---|---|
| `<button class="secondary">` | `<button data-variant="secondary">` |
| `<button data-variant="danger">` | `<button data-tone="danger">` (tone is color, variant is style) |
| `<button data-variant="primary">` | `<button>` (primary is the default) |
| `<p class="error">` | `<p data-tone="danger">` or `<div data-callout data-tone="danger">` |
| `style="margin-top: 1rem"` on a button or input | wrap the elements in `data-layout="stack" data-gap="md"` |
| `style="padding: var(--ts-space-lg)"` | `data-pad="lg"` |
| a custom class to turn a `label` into a flex row | `<label data-layout="row" data-justify="between">` |
| `data-gap="4"` or `data-gap="16px"` | `data-gap="md"` |
| `<button data-icon>×</button>` | `<button data-icon aria-label="Close">×</button>` |
| `data-badge="true"` | `data-badge` |
| `color: #666` in app CSS | `color: var(--ts-text-muted)` |
| `!important` to beat tinystyle | a plain selector; app CSS already wins |
